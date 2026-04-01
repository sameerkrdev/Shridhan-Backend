import prisma from "@/config/prisma.js";
import {
  Prisma,
  CustomerAccountType,
  MisCalculationMethod,
  type PaymentMethod,
  ServiceStatus,
  ServiceType,
  TransactionType,
} from "@/generated/prisma/client.js";
import createHttpError from "http-errors";
import {
  buildMisDocumentObjectKey,
  generateMisDocumentUploadUrl,
  getMisDocumentPublicUrl,
} from "@/services/r2StorageService.js";

interface CreateMisProjectTypeInput {
  name: string;
  duration: number;
  minimumAmount: number;
  calculationMethod: MisCalculationMethod;
  monthlyPayoutAmountPerHundred?: number;
  annualInterestRate?: number;
  rules?: string;
}

interface CreateMisAccountInput {
  referrerMembershipId?: string;
  customer: {
    fullName: string;
    phone: string;
    email?: string;
    address?: string;
    aadhaar?: string;
    pan?: string;
  };
  nominees: {
    name: string;
    phone: string;
    relation?: string;
    address?: string;
    aadhaar?: string;
    pan?: string;
  }[];
  mis: {
    projectTypeId: string;
    depositAmount: number;
    startDate: Date;
  };
  payment?: {
    amount?: number;
    paymentMethod?: PaymentMethod;
    transactionId?: string;
    upiId?: string;
    chequeNumber?: string;
    bankName?: string;
  };
  documents?: {
    fileName: string;
    displayName: string;
    contentType?: string;
    sizeBytes?: number;
  }[];
}

interface PaymentMetaInput {
  paymentMethod?: PaymentMethod;
  transactionId?: string;
  upiId?: string;
  chequeNumber?: string;
  bankName?: string;
}

const assertMembership = (req: { membership?: Prisma.MembershipModel }) => {
  if (!req.membership) {
    throw createHttpError(400, "Society context is missing. Provide x-society-id header.");
  }
  return req.membership;
};

const calculateMaturityDate = (startDate: Date, durationInMonths: number) => {
  const maturityDate = new Date(startDate);
  maturityDate.setMonth(maturityDate.getMonth() + durationInMonths);
  return maturityDate;
};

const calculateMonthlyInterest = (
  depositAmount: Prisma.Decimal,
  projectType: {
    calculationMethod: MisCalculationMethod;
    monthlyPayoutAmountPerHundred: Prisma.Decimal | null;
    annualInterestRate: Prisma.Decimal | null;
  },
) => {
  if (projectType.calculationMethod === MisCalculationMethod.ANNUAL_INTEREST_RATE) {
    if (projectType.annualInterestRate === null) {
      throw createHttpError(500, "MIS project type configuration is invalid: annualInterestRate is missing");
    }
    return depositAmount.mul(projectType.annualInterestRate).div(100).div(12);
  }

  if (projectType.monthlyPayoutAmountPerHundred === null) {
    throw createHttpError(
      500,
      "MIS project type configuration is invalid: monthlyPayoutAmountPerHundred is missing",
    );
  }
  return depositAmount.div(100).mul(projectType.monthlyPayoutAmountPerHundred);
};

const sumAmount = (
  rows: {
    amount: Prisma.Decimal;
  }[],
) => rows.reduce((sum, row) => sum.add(row.amount), new Prisma.Decimal(0));

export const createMisProjectType = async (
  actor: Prisma.MembershipModel,
  data: CreateMisProjectTypeInput,
) => {
  if (
    data.calculationMethod === MisCalculationMethod.MONTHLY_PAYOUT_PER_HUNDRED &&
    data.monthlyPayoutAmountPerHundred === undefined
  ) {
    throw createHttpError(400, "monthlyPayoutAmountPerHundred is required for selected calculation method");
  }
  if (
    data.calculationMethod === MisCalculationMethod.ANNUAL_INTEREST_RATE &&
    data.annualInterestRate === undefined
  ) {
    throw createHttpError(400, "annualInterestRate is required for selected calculation method");
  }

  const monthlyPayoutAmountPerHundred =
    data.calculationMethod === MisCalculationMethod.MONTHLY_PAYOUT_PER_HUNDRED
      ? new Prisma.Decimal(data.monthlyPayoutAmountPerHundred ?? 0)
      : null;
  const annualInterestRate =
    data.calculationMethod === MisCalculationMethod.ANNUAL_INTEREST_RATE
      ? new Prisma.Decimal(data.annualInterestRate ?? 0)
      : null;

  return prisma.monthlyInterestSchemeProjectType.create({
    data: {
      name: data.name,
      duration: data.duration,
      minimumAmount: new Prisma.Decimal(data.minimumAmount),
      calculationMethod: data.calculationMethod,
      monthlyPayoutAmountPerHundred,
      annualInterestRate,
      societyId: actor.societyId,
      createdBy: actor.userId,
      updatedBy: data.rules ? actor.userId : null,
    },
  });
};

export const listMisProjectTypes = async (
  societyId: string,
  includeDeleted = false,
  includeArchived = false,
) => {
  return prisma.monthlyInterestSchemeProjectType.findMany({
    where: {
      societyId,
      ...(includeDeleted ? {} : { isDeleted: false }),
      ...(includeArchived ? {} : { isArchived: false }),
    },
    orderBy: [{ createdAt: "desc" }],
  });
};

export const softDeleteMisProjectType = async (
  actor: Prisma.MembershipModel,
  projectTypeId: string,
) => {
  const projectType = await prisma.monthlyInterestSchemeProjectType.findFirst({
    where: {
      id: projectTypeId,
      societyId: actor.societyId,
      isDeleted: false,
    },
    select: { id: true },
  });

  if (!projectType) {
    throw createHttpError(404, "MIS project type not found");
  }

  return prisma.monthlyInterestSchemeProjectType.update({
    where: { id: projectTypeId },
    data: {
      isDeleted: true,
      deletedAt: new Date(),
      isArchived: true,
      updatedBy: actor.userId,
    },
  });
};

export const createMisAccount = async (
  actor: Prisma.MembershipModel,
  data: CreateMisAccountInput,
) => {
  if (data.mis.depositAmount <= 0) {
    throw createHttpError(400, "Deposit amount must be greater than 0");
  }
  if (!data.nominees.length) {
    throw createHttpError(400, "At least one nominee is required");
  }

  const initialPaymentAmount = data.payment?.amount ?? 0;
  if (initialPaymentAmount < 0) {
    throw createHttpError(400, "Initial payment amount cannot be negative");
  }
  if (initialPaymentAmount > data.mis.depositAmount) {
    throw createHttpError(400, "Initial payment amount cannot be greater than deposit amount");
  }

  return prisma.$transaction(async (tx) => {
    const projectType = await tx.monthlyInterestSchemeProjectType.findFirst({
      where: {
        id: data.mis.projectTypeId,
        societyId: actor.societyId,
        isDeleted: false,
        isArchived: false,
      },
    });

    if (!projectType) {
      throw createHttpError(404, "MIS project type not found for this society");
    }

    const linkedMembershipId = data.referrerMembershipId ?? actor.id;
    if (data.referrerMembershipId) {
      const referrerMembership = await tx.membership.findFirst({
        where: {
          id: data.referrerMembershipId,
          societyId: actor.societyId,
          deletedAt: null,
        },
        select: { id: true },
      });

      if (!referrerMembership) {
        throw createHttpError(404, "Selected referrer member not found in this society");
      }
    }

    const customer = await tx.customer.create({
      data: {
        fullName: data.customer.fullName,
        phone: data.customer.phone,
        email: data.customer.email ?? null,
        address: data.customer.address ?? null,
        aadhaar: data.customer.aadhaar ?? null,
        pan: data.customer.pan ?? null,
        accountType: CustomerAccountType.MONTHLY_INTEREST_SCHEME,
        societyId: actor.societyId,
        membershipId: linkedMembershipId,
        createdBy: actor.userId,
      },
    });

    await Promise.all(
      data.nominees.map((nominee) =>
        tx.nominee.create({
          data: {
            name: nominee.name,
            phone: nominee.phone,
            relation: nominee.relation ?? null,
            address: nominee.address ?? null,
            aadhaar: nominee.aadhaar ?? null,
            pan: nominee.pan ?? null,
            customerId: customer.id,
            createdBy: actor.userId,
          },
        }),
      ),
    );

    const depositAmount = new Prisma.Decimal(data.mis.depositAmount);
    if (depositAmount.lt(projectType.minimumAmount)) {
      throw createHttpError(
        400,
        `Deposit amount must be greater than or equal to minimum amount (${projectType.minimumAmount.toFixed(2)})`,
      );
    }
    const monthlyInterest = calculateMonthlyInterest(depositAmount, projectType);
    const startDate = new Date(data.mis.startDate);
    const maturityDate = calculateMaturityDate(startDate, projectType.duration);

    const mis = await tx.monthlyInterestScheme.create({
      data: {
        depositAmount,
        monthlyInterest,
        startDate,
        maturityDate,
        // Keep legacy field aligned with principal amount.
        maturityAmount: depositAmount,
        status: ServiceStatus.PENDING_DEPOSIT,
        projectTypeId: projectType.id,
        customerId: customer.id,
        createdBy: actor.userId,
      },
    });

    await tx.monthlyInterestSchemeTransaction.createMany({
      data: Array.from({ length: projectType.duration }).map((_, index) => ({
        month: index + 1,
        amount: monthlyInterest,
        type: TransactionType.INTEREST_PAYOUT,
        isExpected: true,
        monthlyInterestSchemeId: mis.id,
        createdBy: actor.userId,
      })),
    });

    if (initialPaymentAmount > 0) {
      await tx.monthlyInterestSchemeTransaction.create({
        data: {
          type: TransactionType.DEPOSIT,
          amount: new Prisma.Decimal(initialPaymentAmount),
          monthlyInterestSchemeId: mis.id,
          paymentMethod: data.payment?.paymentMethod ?? null,
          transactionId: data.payment?.transactionId ?? null,
          upiId: data.payment?.upiId ?? null,
          chequeNumber: data.payment?.chequeNumber ?? null,
          bankName: data.payment?.bankName ?? null,
          createdBy: actor.userId,
        },
      });

      if (new Prisma.Decimal(initialPaymentAmount).gte(depositAmount)) {
        await tx.monthlyInterestScheme.update({
          where: { id: mis.id },
          data: {
            status: ServiceStatus.ACTIVE,
            updatedBy: actor.userId,
          },
        });
      }
    }

    const createdDocuments = await Promise.all(
      (data.documents ?? []).map((document) => {
        const objectKey = buildMisDocumentObjectKey(actor.societyId, mis.id, document.fileName);
        return tx.serviceDocument.create({
          data: {
            serviceType: ServiceType.MONTHLY_INTEREST_SCHEME,
            serviceEntityId: mis.id,
            fileName: document.fileName,
            displayName: document.displayName,
            objectKey,
            fileUrl: getMisDocumentPublicUrl(objectKey),
            contentType: document.contentType ?? null,
            sizeBytes: document.sizeBytes ?? null,
            monthlyInterestSchemeId: mis.id,
            createdBy: actor.userId,
          },
        });
      }),
    );

    const misPayload = await tx.monthlyInterestScheme.findUniqueOrThrow({
      where: { id: mis.id },
      include: {
        customer: true,
        projectType: true,
        documents: {
          where: { isDeleted: false },
          orderBy: { createdAt: "desc" },
        },
        transactions: {
          where: { isDeleted: false },
          orderBy: [{ month: "asc" }, { createdAt: "asc" }],
        },
      },
    });

    const uploadTargets = await Promise.all(
      createdDocuments.map(async (document) => ({
        documentId: document.id,
        displayName: document.displayName,
        fileName: document.fileName,
        uploadUrl: await generateMisDocumentUploadUrl(
          document.contentType
            ? { objectKey: document.objectKey, contentType: document.contentType }
            : { objectKey: document.objectKey },
        ),
        fileUrl: document.fileUrl,
      })),
    );

    return {
      ...misPayload,
      uploadTargets,
    };
  });
};

export const listMisReferrerMembers = async (societyId: string) => {
  return prisma.membership.findMany({
    where: {
      societyId,
      deletedAt: null,
      status: "active",
    },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          phone: true,
          email: true,
        },
      },
      role: {
        select: {
          id: true,
          name: true,
        },
      },
    },
    orderBy: [{ joinedAt: "desc" }],
  });
};

export const addMisDeposit = async (
  actor: Prisma.MembershipModel,
  misId: string,
  data: { amount: number } & PaymentMetaInput,
) => {
  if (data.amount <= 0) {
    throw createHttpError(400, "Payment amount must be greater than 0");
  }

  return prisma.$transaction(async (tx) => {
    const mis = await tx.monthlyInterestScheme.findFirst({
      where: {
        id: misId,
        isDeleted: false,
        customer: {
          societyId: actor.societyId,
          isDeleted: false,
        },
      },
      include: {
        transactions: {
          where: {
            isDeleted: false,
            type: TransactionType.DEPOSIT,
          },
          select: { amount: true },
        },
      },
    });

    if (!mis) {
      throw createHttpError(404, "MIS account not found");
    }
    if (mis.status === ServiceStatus.CLOSED) {
      throw createHttpError(400, "MIS account is already closed");
    }

    const depositPaid = sumAmount(mis.transactions);
    const incomingAmount = new Prisma.Decimal(data.amount);
    const remainingDeposit = mis.depositAmount.sub(depositPaid);
    if (incomingAmount.gt(remainingDeposit)) {
      throw createHttpError(
        400,
        `Deposit amount cannot exceed remaining deposit (${remainingDeposit.toFixed(2)})`,
      );
    }

    const transaction = await tx.monthlyInterestSchemeTransaction.create({
      data: {
        type: TransactionType.DEPOSIT,
        amount: incomingAmount,
        paymentMethod: data.paymentMethod ?? null,
        transactionId: data.transactionId ?? null,
        upiId: data.upiId ?? null,
        chequeNumber: data.chequeNumber ?? null,
        bankName: data.bankName ?? null,
        monthlyInterestSchemeId: mis.id,
        createdBy: actor.userId,
      },
    });

    const updatedDepositPaid = depositPaid.add(incomingAmount);
    if (updatedDepositPaid.gte(mis.depositAmount) && mis.status === ServiceStatus.PENDING_DEPOSIT) {
      await tx.monthlyInterestScheme.update({
        where: { id: mis.id },
        data: {
          status: ServiceStatus.ACTIVE,
          updatedBy: actor.userId,
        },
      });
    }

    return transaction;
  });
};

export const payMisInterest = async (
  actor: Prisma.MembershipModel,
  misId: string,
  data: {
    month?: number;
    months?: number[];
    amount: number;
  } & PaymentMetaInput,
) => {
  if (data.amount <= 0) {
    throw createHttpError(400, "Payment amount must be greater than 0");
  }

  return prisma.$transaction(async (tx) => {
    const mis = await tx.monthlyInterestScheme.findFirst({
      where: {
        id: misId,
        isDeleted: false,
        customer: {
          societyId: actor.societyId,
          isDeleted: false,
        },
      },
      include: {
        projectType: true,
        transactions: {
          where: {
            isDeleted: false,
            type: TransactionType.INTEREST_PAYOUT,
            isExpected: false,
          },
          select: {
            amount: true,
            month: true,
          },
        },
      },
    });

    if (!mis) {
      throw createHttpError(404, "MIS account not found");
    }
    if (mis.status === ServiceStatus.CLOSED) {
      throw createHttpError(400, "MIS account is already closed");
    }

    const months = data.month !== undefined ? [data.month] : (data.months ?? []);
    if (months.length === 0) {
      throw createHttpError(400, "Month information is required");
    }

    for (const month of months) {
      if (month < 1 || month > mis.projectType.duration) {
        throw createHttpError(400, `Month must be between 1 and ${mis.projectType.duration}`);
      }
    }

    const paidByMonth = new Map<number, Prisma.Decimal>();
    for (const transaction of mis.transactions) {
      if (transaction.month === null) continue;
      const current = paidByMonth.get(transaction.month) ?? new Prisma.Decimal(0);
      paidByMonth.set(transaction.month, current.add(transaction.amount));
    }

    if (months.length > 1) {
      const requiredAmount = mis.monthlyInterest.mul(months.length);
      if (!new Prisma.Decimal(data.amount).eq(requiredAmount)) {
        throw createHttpError(
          400,
          `Amount must equal monthly interest x month count (${requiredAmount.toFixed(2)})`,
        );
      }
      for (const month of months) {
        const paid = paidByMonth.get(month) ?? new Prisma.Decimal(0);
        const remaining = mis.monthlyInterest.sub(paid);
        if (remaining.lt(mis.monthlyInterest)) {
          throw createHttpError(
            400,
            `Month ${month} already has a partial/full payment. Use single-month payment for split payout.`,
          );
        }
      }
    } else {
      const month = months[0]!;
      const paid = paidByMonth.get(month) ?? new Prisma.Decimal(0);
      const remaining = mis.monthlyInterest.sub(paid);
      if (remaining.lte(0)) {
        throw createHttpError(400, `Month ${month} interest is already fully paid`);
      }
      if (new Prisma.Decimal(data.amount).gt(remaining)) {
        throw createHttpError(
          400,
          `Interest amount cannot exceed remaining month payout (${remaining.toFixed(2)})`,
        );
      }
    }

    const rows =
      months.length > 1
        ? months.map((month) => ({
            type: TransactionType.INTEREST_PAYOUT,
            isExpected: false,
            month,
            amount: mis.monthlyInterest,
            paymentMethod: data.paymentMethod ?? null,
            transactionId: data.transactionId ?? null,
            upiId: data.upiId ?? null,
            chequeNumber: data.chequeNumber ?? null,
            bankName: data.bankName ?? null,
            monthlyInterestSchemeId: mis.id,
            createdBy: actor.userId,
          }))
        : [
            {
              type: TransactionType.INTEREST_PAYOUT,
              isExpected: false,
              month: months[0]!,
              amount: new Prisma.Decimal(data.amount),
              paymentMethod: data.paymentMethod ?? null,
              transactionId: data.transactionId ?? null,
              upiId: data.upiId ?? null,
              chequeNumber: data.chequeNumber ?? null,
              bankName: data.bankName ?? null,
              monthlyInterestSchemeId: mis.id,
              createdBy: actor.userId,
            },
          ];

    await tx.monthlyInterestSchemeTransaction.createMany({ data: rows });
    return { success: true };
  });
};

export const returnMisPrincipal = async (
  actor: Prisma.MembershipModel,
  misId: string,
  data: PaymentMetaInput,
) => {
  return prisma.$transaction(async (tx) => {
    const mis = await tx.monthlyInterestScheme.findFirst({
      where: {
        id: misId,
        isDeleted: false,
        customer: {
          societyId: actor.societyId,
          isDeleted: false,
        },
      },
      include: {
        transactions: {
          where: {
            isDeleted: false,
            type: TransactionType.PRINCIPAL_RETURN,
          },
          select: { id: true },
        },
      },
    });

    if (!mis) {
      throw createHttpError(404, "MIS account not found");
    }
    if (mis.transactions.length > 0) {
      throw createHttpError(400, "Principal has already been returned for this MIS account");
    }
    if (mis.status === ServiceStatus.CLOSED) {
      throw createHttpError(400, "MIS account is already closed");
    }
    if (mis.maturityDate.getTime() > Date.now()) {
      throw createHttpError(400, "Principal can only be returned at or after maturity date");
    }

    const transaction = await tx.monthlyInterestSchemeTransaction.create({
      data: {
        type: TransactionType.PRINCIPAL_RETURN,
        amount: mis.depositAmount,
        paymentMethod: data.paymentMethod ?? null,
        transactionId: data.transactionId ?? null,
        upiId: data.upiId ?? null,
        chequeNumber: data.chequeNumber ?? null,
        bankName: data.bankName ?? null,
        monthlyInterestSchemeId: mis.id,
        createdBy: actor.userId,
      },
    });

    await tx.monthlyInterestScheme.update({
      where: { id: mis.id },
      data: {
        status: ServiceStatus.CLOSED,
        updatedBy: actor.userId,
      },
    });

    return transaction;
  });
};

export const listMisAccounts = async (
  societyId: string,
  paging: {
    page: number;
    pageSize: number;
  },
  sorting?: {
    sortBy?:
      | "id"
      | "customer_name"
      | "phone"
      | "deposit_amount"
      | "monthly_interest"
      | "maturity_date"
      | "status";
    sortOrder?: "asc" | "desc";
  },
  includeDeleted = false,
  search?: string,
) => {
  const sortBy = sorting?.sortBy ?? "maturity_date";
  const sortOrder = sorting?.sortOrder ?? "desc";
  const skip = (paging.page - 1) * paging.pageSize;

  const orderByByField: Record<
    NonNullable<typeof sortBy>,
    | Prisma.MonthlyInterestSchemeOrderByWithRelationInput
    | Prisma.MonthlyInterestSchemeOrderByWithRelationInput[]
  > = {
    id: { id: sortOrder },
    customer_name: [{ customer: { fullName: sortOrder } }, { id: "desc" }],
    phone: [{ customer: { phone: sortOrder } }, { id: "desc" }],
    deposit_amount: [{ depositAmount: sortOrder }, { id: "desc" }],
    monthly_interest: [{ monthlyInterest: sortOrder }, { id: "desc" }],
    maturity_date: [{ maturityDate: sortOrder }, { id: "desc" }],
    status: [{ status: sortOrder }, { id: "desc" }],
  };

  const where: Prisma.MonthlyInterestSchemeWhereInput = {
    ...(includeDeleted ? {} : { isDeleted: false }),
    customer: {
      societyId,
      isDeleted: false,
    },
  };

  const searchTerm = search?.trim();
  if (searchTerm) {
    const searchOrConditions: Prisma.MonthlyInterestSchemeWhereInput[] = [
      { id: { contains: searchTerm, mode: "insensitive" } },
      { customer: { fullName: { contains: searchTerm, mode: "insensitive" } } },
      { customer: { phone: { contains: searchTerm } } },
      { projectType: { name: { contains: searchTerm, mode: "insensitive" } } },
    ];

    const normalizedStatus = searchTerm.toUpperCase();
    if (["PENDING_DEPOSIT", "ACTIVE", "COMPLETED", "CLOSED"].includes(normalizedStatus)) {
      searchOrConditions.push({ status: normalizedStatus as ServiceStatus });
    }

    const numericSearch = Number(searchTerm);
    if (!Number.isNaN(numericSearch)) {
      const amount = new Prisma.Decimal(numericSearch);
      searchOrConditions.push({ depositAmount: amount }, { monthlyInterest: amount });
    }

    where.AND = [{ OR: searchOrConditions }];
  }

  const [items, total] = await Promise.all([
    prisma.monthlyInterestScheme.findMany({
      where,
      include: {
        customer: true,
        projectType: true,
      },
      orderBy: orderByByField[sortBy],
      skip,
      take: paging.pageSize,
    }),
    prisma.monthlyInterestScheme.count({ where }),
  ]);

  return {
    items,
    total,
    page: paging.page,
    pageSize: paging.pageSize,
    totalPages: Math.max(1, Math.ceil(total / paging.pageSize)),
  };
};

export const getMisDetail = async (misId: string, societyId: string) => {
  const mis = (await prisma.monthlyInterestScheme.findFirst({
    where: {
      id: misId,
      isDeleted: false,
      customer: {
        societyId,
        isDeleted: false,
      },
    },
    include: {
      customer: {
        include: {
          nominees: {
            where: { isDeleted: false },
            orderBy: { createdAt: "desc" },
          },
        },
      },
      projectType: true,
      documents: {
        where: { isDeleted: false },
        orderBy: { createdAt: "desc" },
      },
      transactions: {
        where: { isDeleted: false },
        orderBy: [{ month: "asc" }, { createdAt: "asc" }],
      },
    },
  })) as
    | (Prisma.MonthlyInterestSchemeModel & {
        customer: Prisma.CustomerModel & {
          nominees: Prisma.NomineeModel[];
        };
        projectType: Prisma.MonthlyInterestSchemeProjectTypeModel;
        transactions: Prisma.MonthlyInterestSchemeTransactionModel[];
      })
    | null;

  if (!mis) {
    throw createHttpError(404, "MIS account not found");
  }

  const depositPaid = sumAmount(
    mis.transactions.filter((transaction) => transaction.type === TransactionType.DEPOSIT),
  );

  const interestPaidByMonth = new Map<number, Prisma.Decimal>();
  for (const transaction of mis.transactions) {
    if (
      transaction.type !== TransactionType.INTEREST_PAYOUT ||
      transaction.isExpected ||
      transaction.month === null
    ) {
      continue;
    }
    const current = interestPaidByMonth.get(transaction.month) ?? new Prisma.Decimal(0);
    interestPaidByMonth.set(transaction.month, current.add(transaction.amount));
  }

  const interestPaid = Array.from(interestPaidByMonth.values()).reduce(
    (sum, current) => sum.add(current),
    new Prisma.Decimal(0),
  );

  const pendingMonths: number[] = [];
  for (let month = 1; month <= mis.projectType.duration; month += 1) {
    const paid = interestPaidByMonth.get(month) ?? new Prisma.Decimal(0);
    if (paid.lt(mis.monthlyInterest)) {
      pendingMonths.push(month);
    }
  }

  return {
    ...mis,
    summary: {
      depositPaid: depositPaid.toString(),
      remainingDeposit: Prisma.Decimal.max(
        mis.depositAmount.sub(depositPaid),
        new Prisma.Decimal(0),
      ).toString(),
      interestPaid: interestPaid.toString(),
      pendingMonths,
    },
  };
};

export const softDeleteMisAccount = async (actor: Prisma.MembershipModel, misId: string) => {
  const mis = await prisma.monthlyInterestScheme.findFirst({
    where: {
      id: misId,
      isDeleted: false,
      customer: {
        societyId: actor.societyId,
        isDeleted: false,
      },
    },
    select: { id: true },
  });

  if (!mis) {
    throw createHttpError(404, "MIS account not found");
  }

  return prisma.monthlyInterestScheme.update({
    where: { id: misId },
    data: {
      isDeleted: true,
      deletedAt: new Date(),
      status: ServiceStatus.CLOSED,
      updatedBy: actor.userId,
    },
  });
};

export const requestMisDocumentUpload = async (
  actor: Prisma.MembershipModel,
  misId: string,
  data: {
    fileName: string;
    displayName: string;
    contentType?: string;
    sizeBytes?: number;
  },
) => {
  const mis = await prisma.monthlyInterestScheme.findFirst({
    where: {
      id: misId,
      isDeleted: false,
      customer: {
        societyId: actor.societyId,
        isDeleted: false,
      },
    },
    select: { id: true },
  });

  if (!mis) {
    throw createHttpError(404, "MIS account not found");
  }

  const objectKey = buildMisDocumentObjectKey(actor.societyId, misId, data.fileName);
  const fileUrl = getMisDocumentPublicUrl(objectKey);

  const document = await prisma.serviceDocument.create({
    data: {
      serviceType: ServiceType.MONTHLY_INTEREST_SCHEME,
      serviceEntityId: misId,
      fileName: data.fileName,
      displayName: data.displayName,
      objectKey,
      fileUrl,
      contentType: data.contentType ?? null,
      sizeBytes: data.sizeBytes ?? null,
      monthlyInterestSchemeId: misId,
      createdBy: actor.userId,
    },
  });

  const uploadUrl = await generateMisDocumentUploadUrl(
    data.contentType ? { objectKey, contentType: data.contentType } : { objectKey },
  );

  return {
    document,
    uploadUrl,
    fileUrl,
  };
};

export const completeMisDocumentUpload = async (
  actor: Prisma.MembershipModel,
  misId: string,
  documentId: string,
) => {
  const document = await prisma.serviceDocument.findFirst({
    where: {
      id: documentId,
      monthlyInterestSchemeId: misId,
      isDeleted: false,
      monthlyInterestScheme: {
        customer: {
          societyId: actor.societyId,
          isDeleted: false,
        },
      },
    },
    select: { id: true },
  });

  if (!document) {
    throw createHttpError(404, "MIS document not found");
  }

  return prisma.serviceDocument.update({
    where: { id: documentId },
    data: {
      isUploaded: true,
      updatedBy: actor.userId,
    },
  });
};

export { assertMembership };
