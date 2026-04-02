import prisma from "@/config/prisma.js";
import {
  Prisma,
  CustomerAccountType,
  type MaturityCalculationMethod,
  type PaymentMethod,
  ServiceType,
  ServiceStatus,
  TransactionType,
} from "@/generated/prisma/client.js";
import createHttpError from "http-errors";
import {
  buildFdDocumentObjectKey,
  generateFdDocumentUploadUrl,
  getFdDocumentPublicUrl,
} from "@/services/r2StorageService.js";

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

const computeFdMaturityAmount = (
  depositAmount: Prisma.Decimal,
  projectType: {
    maturityCalculationMethod: MaturityCalculationMethod;
    maturityAmountPerHundred: Prisma.Decimal;
    maturityMultiple: Prisma.Decimal;
  },
) => {
  if (projectType.maturityCalculationMethod === "MULTIPLE_OF_PRINCIPAL") {
    return depositAmount.mul(projectType.maturityMultiple);
  }
  return depositAmount.div(100).mul(projectType.maturityAmountPerHundred);
};

export const createProjectType = async (
  actor: Prisma.MembershipModel,
  data: {
    name: string;
    duration: number;
    minimumAmount: number;
    maturityCalculationMethod: "PER_RS_100" | "MULTIPLE_OF_PRINCIPAL";
    maturityValue: number;
  },
) => {
  const isPerRs100 = data.maturityCalculationMethod === "PER_RS_100";
  return prisma.fixedDepositProjectType.create({
    data: {
      name: data.name,
      duration: data.duration,
      minimumAmount: new Prisma.Decimal(data.minimumAmount),
      maturityCalculationMethod: data.maturityCalculationMethod,
      maturityAmountPerHundred: isPerRs100
        ? new Prisma.Decimal(data.maturityValue)
        : new Prisma.Decimal(0),
      maturityMultiple: isPerRs100 ? new Prisma.Decimal(0) : new Prisma.Decimal(data.maturityValue),
      societyId: actor.societyId,
      createdBy: actor.userId,
    },
  });
};

export const listProjectTypes = async (societyId: string, includeDeleted = false) => {
  return prisma.fixedDepositProjectType.findMany({
    where: {
      societyId,
      ...(includeDeleted ? {} : { isDeleted: false }),
    },
    orderBy: [{ createdAt: "desc" }],
  });
};

export const updateProjectTypeStatus = async (
  actor: Prisma.MembershipModel,
  projectTypeId: string,
  status: "ACTIVE" | "SUSPENDED",
) => {
  const projectType = await prisma.fixedDepositProjectType.findFirst({
    where: {
      id: projectTypeId,
      societyId: actor.societyId,
      isDeleted: false,
    },
    select: { id: true },
  });

  if (!projectType) {
    throw createHttpError(404, "Fixed deposit project type not found");
  }

  return prisma.fixedDepositProjectType.update({
    where: { id: projectTypeId },
    data: {
      isArchived: status === "SUSPENDED",
      updatedBy: actor.userId,
    },
  });
};

export const softDeleteProjectType = async (
  actor: Prisma.MembershipModel,
  projectTypeId: string,
) => {
  const projectType = await prisma.fixedDepositProjectType.findFirst({
    where: {
      id: projectTypeId,
      societyId: actor.societyId,
      isDeleted: false,
    },
    select: { id: true },
  });

  if (!projectType) {
    throw createHttpError(404, "Fixed deposit project type not found");
  }

  return prisma.fixedDepositProjectType.update({
    where: { id: projectTypeId },
    data: {
      isDeleted: true,
      deletedAt: new Date(),
      isArchived: true,
      updatedBy: actor.userId,
    },
  });
};

export const createFdAccount = async (
  actor: Prisma.MembershipModel,
  data: {
    referrerMembershipId: string;
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
    fd: {
      projectTypeId: string;
      depositAmount: number;
      startDate: Date;
      initialPaymentAmount?: number;
    };
    payment: {
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
  },
) => {
  if (data.fd.depositAmount <= 0) {
    throw createHttpError(400, "Deposit amount must be greater than 0");
  }
  if (!data.nominees?.length) {
    throw createHttpError(400, "At least one nominee is required");
  }

  const initialPaymentAmount = data.fd.initialPaymentAmount ?? data.fd.depositAmount;
  if (initialPaymentAmount <= 0) {
    throw createHttpError(400, "Initial payment amount must be greater than 0");
  }
  if (initialPaymentAmount > data.fd.depositAmount) {
    throw createHttpError(400, "Initial payment amount cannot be greater than deposit amount");
  }

  return prisma.$transaction(async (tx) => {
    const existingCustomer = await tx.customer.findFirst({
      where: {
        societyId: actor.societyId,
        phone: data.customer.phone,
        isDeleted: false,
      },
      select: { id: true },
    });

    if (existingCustomer) {
      throw createHttpError(409, "Customer phone already exists in this society");
    }

    const projectType = await tx.fixedDepositProjectType.findFirst({
      where: {
        id: data.fd.projectTypeId,
        societyId: actor.societyId,
        isDeleted: false,
        isArchived: false,
      },
    });

    if (!projectType) {
      throw createHttpError(404, "Fixed deposit project type not found for this society");
    }

    const depositAmount = new Prisma.Decimal(data.fd.depositAmount);
    if (depositAmount.lt(projectType.minimumAmount)) {
      throw createHttpError(
        400,
        `Deposit amount must be greater than or equal to minimum amount (${projectType.minimumAmount.toFixed(2)})`,
      );
    }
    const initialPaymentAmountDecimal = new Prisma.Decimal(initialPaymentAmount);
    const maturityAmount = computeFdMaturityAmount(depositAmount, projectType);
    const maturityDate = calculateMaturityDate(new Date(data.fd.startDate), projectType.duration);
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

    const linkedMembershipId = data.referrerMembershipId;

    const customer = await tx.customer.create({
      data: {
        fullName: data.customer.fullName,
        phone: data.customer.phone,
        email: data.customer.email ?? null,
        address: data.customer.address ?? null,
        aadhaar: data.customer.aadhaar ?? null,
        pan: data.customer.pan ?? null,
        accountType: CustomerAccountType.FIXED_DEPOSIT,
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

    const fixedDeposit = await tx.fixDeposit.create({
      data: {
        principalAmount: depositAmount,
        startDate: new Date(data.fd.startDate),
        maturityDate,
        maturityAmount,
        status: ServiceStatus.ACTIVE,
        projectTypeId: projectType.id,
        customerId: customer.id,
        createdBy: actor.userId,
      },
    });

    await tx.fixDepositTransaction.create({
      data: {
        type: TransactionType.CREDIT,
        amount: initialPaymentAmountDecimal,
        paymentMethod: data.payment.paymentMethod ?? null,
        transactionId: data.payment.transactionId ?? null,
        upiId: data.payment.upiId ?? null,
        chequeNumber: data.payment.chequeNumber ?? null,
        bankName: data.payment.bankName ?? null,
        fixDepositId: fixedDeposit.id,
        createdBy: actor.userId,
      },
    });

    const createdDocuments = await Promise.all(
      (data.documents ?? []).map((document) => {
        const objectKey = buildFdDocumentObjectKey(
          actor.societyId,
          fixedDeposit.id,
          document.fileName,
        );
        return tx.serviceDocument.create({
          data: {
            serviceType: ServiceType.FIX_DEPOSIT,
            serviceEntityId: fixedDeposit.id,
            fileName: document.fileName,
            displayName: document.displayName,
            objectKey,
            fileUrl: getFdDocumentPublicUrl(objectKey),
            contentType: document.contentType ?? null,
            sizeBytes: document.sizeBytes ?? null,
            fixDepositId: fixedDeposit.id,
            createdBy: actor.userId,
          },
        });
      }),
    );

    const fdPayload = await tx.fixDeposit.findUniqueOrThrow({
      where: { id: fixedDeposit.id },
      include: {
        customer: true,
        projectType: true,
        documents: {
          where: { isDeleted: false },
          orderBy: { createdAt: "desc" },
        },
        transactions: {
          where: { isDeleted: false },
          orderBy: { createdAt: "desc" },
        },
      },
    });

    const uploadTargets = await Promise.all(
      createdDocuments.map(async (document) => ({
        documentId: document.id,
        displayName: document.displayName,
        fileName: document.fileName,
        uploadUrl: await generateFdDocumentUploadUrl(
          document.contentType
            ? { objectKey: document.objectKey, contentType: document.contentType }
            : { objectKey: document.objectKey },
        ),
        fileUrl: document.fileUrl,
      })),
    );

    return {
      ...fdPayload,
      uploadTargets,
    };
  });
};

export const listFdAccounts = async (
  societyId: string,
  sorting?: {
    sortBy?:
      | "id"
      | "customer_name"
      | "phone"
      | "plan"
      | "principal_amount"
      | "maturity_amount"
      | "start_date"
      | "maturity_date"
      | "status";
    sortOrder?: "asc" | "desc";
  },
  includeDeleted = false,
  search?: string,
) => {
  const sortBy = sorting?.sortBy ?? "maturity_date";
  const sortOrder = sorting?.sortOrder ?? "desc";
  const orderByByField: Record<
    NonNullable<typeof sortBy>,
    Prisma.FixDepositOrderByWithRelationInput | Prisma.FixDepositOrderByWithRelationInput[]
  > = {
    id: { id: sortOrder },
    customer_name: [{ customer: { fullName: sortOrder } }, { id: "desc" }],
    phone: [{ customer: { phone: sortOrder } }, { id: "desc" }],
    plan: [{ projectType: { name: sortOrder } }, { id: "desc" }],
    principal_amount: [{ principalAmount: sortOrder }, { id: "desc" }],
    maturity_amount: [{ maturityAmount: sortOrder }, { id: "desc" }],
    start_date: [{ startDate: sortOrder }, { id: "desc" }],
    maturity_date: [{ maturityDate: sortOrder }, { id: "desc" }],
    status: [{ status: sortOrder }, { id: "desc" }],
  };

  const where: Prisma.FixDepositWhereInput = {
    ...(includeDeleted ? {} : { isDeleted: false }),
    customer: {
      societyId,
      isDeleted: false,
    },
  };

  const searchTerm = search?.trim();
  if (searchTerm) {
    const searchOrConditions: Prisma.FixDepositWhereInput[] = [
      { id: { contains: searchTerm, mode: "insensitive" } },
      { customer: { fullName: { contains: searchTerm, mode: "insensitive" } } },
      { customer: { phone: { contains: searchTerm } } },
      { projectType: { name: { contains: searchTerm, mode: "insensitive" } } },
    ];

    const normalizedStatus = searchTerm.toUpperCase();
    if (["ACTIVE", "COMPLETED", "CLOSED"].includes(normalizedStatus)) {
      searchOrConditions.push({ status: normalizedStatus as ServiceStatus });
    }

    const numericSearch = Number(searchTerm);
    if (!Number.isNaN(numericSearch)) {
      const amount = new Prisma.Decimal(numericSearch);
      searchOrConditions.push({ principalAmount: amount }, { maturityAmount: amount });
    }

    const parsedDate = new Date(searchTerm);
    if (!Number.isNaN(parsedDate.getTime())) {
      const dayStart = new Date(parsedDate);
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(parsedDate);
      dayEnd.setHours(23, 59, 59, 999);
      searchOrConditions.push(
        { startDate: { gte: dayStart, lte: dayEnd } },
        { maturityDate: { gte: dayStart, lte: dayEnd } },
      );
    }

    where.AND = [{ OR: searchOrConditions }];
  }

  return prisma.fixDeposit.findMany({
    where,
    include: {
      customer: true,
      projectType: true,
      transactions: {
        where: { isDeleted: false },
        orderBy: { createdAt: "asc" },
      },
    },
    orderBy: orderByByField[sortBy],
  });
};

export const getFdDetail = async (id: string, societyId: string) => {
  const fixedDeposit = await prisma.fixDeposit.findFirst({
    where: {
      id,
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
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!fixedDeposit) {
    throw createHttpError(404, "Fixed deposit account not found");
  }

  return fixedDeposit;
};

export const updateFdAccount = async (
  actor: Prisma.MembershipModel,
  fixDepositId: string,
  data: {
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
    documents?: {
      updates?: Array<{ id: string; displayName: string }>;
      deleteIds?: string[];
    };
  },
) => {
  if (!data.nominees.length) {
    throw createHttpError(400, "At least one nominee is required");
  }

  return prisma.$transaction(async (tx) => {
    const fixedDeposit = await tx.fixDeposit.findFirst({
      where: {
        id: fixDepositId,
        isDeleted: false,
        customer: {
          societyId: actor.societyId,
          isDeleted: false,
        },
      },
      select: { id: true, customerId: true },
    });

    if (!fixedDeposit) {
      throw createHttpError(404, "Fixed deposit account not found");
    }

    await tx.customer.update({
      where: { id: fixedDeposit.customerId },
      data: {
        fullName: data.customer.fullName,
        phone: data.customer.phone,
        email: data.customer.email ?? null,
        address: data.customer.address ?? null,
        aadhaar: data.customer.aadhaar ?? null,
        pan: data.customer.pan ?? null,
        updatedBy: actor.userId,
      },
    });

    await tx.nominee.updateMany({
      where: { customerId: fixedDeposit.customerId, isDeleted: false },
      data: { isDeleted: true, deletedAt: new Date(), updatedBy: actor.userId },
    });
    await Promise.all(
      data.nominees.map((nominee) =>
        tx.nominee.create({
          data: {
            ...nominee,
            relation: nominee.relation ?? null,
            address: nominee.address ?? null,
            aadhaar: nominee.aadhaar ?? null,
            pan: nominee.pan ?? null,
            customerId: fixedDeposit.customerId,
            createdBy: actor.userId,
          },
        }),
      ),
    );

    if (data.documents?.updates?.length) {
      await Promise.all(
        data.documents.updates.map((doc) =>
          tx.serviceDocument.updateMany({
            where: { id: doc.id, fixDepositId, isDeleted: false },
            data: { displayName: doc.displayName, updatedBy: actor.userId },
          }),
        ),
      );
    }
    if (data.documents?.deleteIds?.length) {
      await tx.serviceDocument.updateMany({
        where: { id: { in: data.documents.deleteIds }, fixDepositId, isDeleted: false },
        data: { isDeleted: true, deletedAt: new Date(), updatedBy: actor.userId },
      });
    }

    return getFdDetail(fixDepositId, actor.societyId);
  });
};

export const addTransaction = async (
  actor: Prisma.MembershipModel,
  fixDepositId: string,
  data: {
    type: TransactionType;
    amount: number;
    paymentMethod?: PaymentMethod;
    transactionId?: string;
    upiId?: string;
    bankName?: string;
    chequeNumber?: string;
    month?: number;
  },
) => {
  if (data.amount <= 0) {
    throw createHttpError(400, "Transaction amount must be greater than 0");
  }

  const fixedDeposit = await prisma.fixDeposit.findFirst({
    where: {
      id: fixDepositId,
      isDeleted: false,
      customer: {
        societyId: actor.societyId,
        isDeleted: false,
      },
    },
    select: {
      id: true,
      principalAmount: true,
      maturityAmount: true,
      transactions: {
        where: { isDeleted: false },
        select: { type: true, amount: true },
      },
    },
  });

  if (!fixedDeposit) {
    throw createHttpError(404, "Fixed deposit account not found");
  }

  const incomingAmount = new Prisma.Decimal(data.amount);
  const totalCredit = fixedDeposit.transactions
    .filter((transaction) => transaction.type === TransactionType.CREDIT)
    .reduce((sum, transaction) => sum.add(transaction.amount), new Prisma.Decimal(0));
  const totalPayout = fixedDeposit.transactions
    .filter((transaction) => transaction.type === TransactionType.PAYOUT)
    .reduce((sum, transaction) => sum.add(transaction.amount), new Prisma.Decimal(0));

  if (data.type === TransactionType.CREDIT) {
    const creditRemaining = fixedDeposit.principalAmount.sub(totalCredit);
    if (creditRemaining.lte(0)) {
      throw createHttpError(400, "Deposit amount is already fully collected for this FD account");
    }
    if (incomingAmount.gt(creditRemaining)) {
      throw createHttpError(
        400,
        `Credit amount cannot exceed remaining deposit amount (${creditRemaining.toFixed(2)})`,
      );
    }
  }

  if (data.type === TransactionType.PAYOUT) {
    const payoutRemaining = fixedDeposit.maturityAmount.sub(totalPayout);
    if (payoutRemaining.lte(0)) {
      throw createHttpError(400, "Maturity payout is already fully paid for this FD account");
    }
    if (incomingAmount.gt(payoutRemaining)) {
      throw createHttpError(
        400,
        `Payout amount cannot exceed remaining maturity amount (${payoutRemaining.toFixed(2)})`,
      );
    }
  }

  return prisma.fixDepositTransaction.create({
    data: {
      type: data.type,
      amount: incomingAmount,
      month: data.month ?? null,
      paymentMethod: data.paymentMethod ?? null,
      transactionId: data.transactionId ?? null,
      upiId: data.upiId ?? null,
      bankName: data.bankName ?? null,
      chequeNumber: data.chequeNumber ?? null,
      fixDepositId,
      createdBy: actor.userId,
    },
  });
};

export const updateFdAccountStatus = async (
  actor: Prisma.MembershipModel,
  fixDepositId: string,
  status: ServiceStatus,
): Promise<Prisma.FixDepositModel> => {
  const fixedDeposit = await prisma.fixDeposit.findFirst({
    where: {
      id: fixDepositId,
      isDeleted: false,
      customer: {
        societyId: actor.societyId,
        isDeleted: false,
      },
    },
    select: { id: true },
  });

  if (!fixedDeposit) {
    throw createHttpError(404, "Fixed deposit account not found");
  }

  return prisma.fixDeposit.update({
    where: { id: fixDepositId },
    data: {
      status,
      updatedBy: actor.userId,
    },
  });
};

export const softDeleteFdAccount = async (actor: Prisma.MembershipModel, fixDepositId: string) => {
  const fixedDeposit = await prisma.fixDeposit.findFirst({
    where: {
      id: fixDepositId,
      isDeleted: false,
      customer: {
        societyId: actor.societyId,
        isDeleted: false,
      },
    },
    select: { id: true },
  });

  if (!fixedDeposit) {
    throw createHttpError(404, "Fixed deposit account not found");
  }

  return prisma.fixDeposit.update({
    where: { id: fixDepositId },
    data: {
      isDeleted: true,
      deletedAt: new Date(),
      status: ServiceStatus.CLOSED,
      updatedBy: actor.userId,
    },
  });
};

export const listFdReferrerMembers = async (societyId: string) => {
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

export const requestFdDocumentUpload = async (
  actor: Prisma.MembershipModel,
  fixDepositId: string,
  data: {
    fileName: string;
    displayName: string;
    contentType?: string;
    sizeBytes?: number;
  },
) => {
  const fixedDeposit = await prisma.fixDeposit.findFirst({
    where: {
      id: fixDepositId,
      isDeleted: false,
      customer: {
        societyId: actor.societyId,
        isDeleted: false,
      },
    },
    select: { id: true },
  });

  if (!fixedDeposit) {
    throw createHttpError(404, "Fixed deposit account not found");
  }

  const objectKey = buildFdDocumentObjectKey(actor.societyId, fixDepositId, data.fileName);
  const fileUrl = getFdDocumentPublicUrl(objectKey);

  const document = await prisma.serviceDocument.create({
    data: {
      serviceType: ServiceType.FIX_DEPOSIT,
      serviceEntityId: fixDepositId,
      fileName: data.fileName,
      displayName: data.displayName,
      objectKey,
      fileUrl,
      contentType: data.contentType ?? null,
      sizeBytes: data.sizeBytes ?? null,
      fixDepositId,
      createdBy: actor.userId,
    },
  });

  const uploadUrl = await generateFdDocumentUploadUrl(
    data.contentType ? { objectKey, contentType: data.contentType } : { objectKey },
  );

  return {
    document,
    uploadUrl,
    fileUrl,
  };
};

export const completeFdDocumentUpload = async (
  actor: Prisma.MembershipModel,
  fixDepositId: string,
  documentId: string,
) => {
  const document = await prisma.serviceDocument.findFirst({
    where: {
      id: documentId,
      fixDepositId,
      isDeleted: false,
      fixDeposit: {
        customer: {
          societyId: actor.societyId,
          isDeleted: false,
        },
      },
    },
    select: { id: true },
  });

  if (!document) {
    throw createHttpError(404, "Fixed deposit document not found");
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
