import prisma from "@/config/prisma.js";
import {
  CustomerAccountType,
  Prisma,
  RdFineCalculationMethod,
  RecurringDepositInstallmentStatus,
  RecurringDepositTransactionType,
  type PaymentMethod,
  ServiceStatus,
  type RecurringDepositInstallment,
} from "@/generated/prisma/client.js";
import createHttpError from "http-errors";
import {
  computeDueLines,
  fifoAllocatePayment,
  fifoAllocatePaymentWithFineSkip,
  isOverdue,
  sumMaxAllocatable,
  sumTotalDue,
  type InstallmentInput,
  type RdDueParams,
} from "@/services/rdDueCalculator.js";

interface CreateRdProjectTypeInput {
  name: string;
  duration: number;
  minimumMonthlyAmount: number;
  maturityPerHundred: number;
  fineCalculationMethod: RdFineCalculationMethod;
  fixedOverdueFineAmount?: number;
  fineRatePerHundred: number;
  graceDays: number;
  penaltyMultiplier?: number;
  penaltyStartMonth?: number;
}

interface CreateRdAccountInput {
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
  rd: {
    projectTypeId: string;
    monthlyAmount: number;
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
}

interface PaymentMetaInput {
  paymentMethod?: PaymentMethod;
  transactionId?: string;
  upiId?: string;
  chequeNumber?: string;
  bankName?: string;
}

type SkipFinePolicy = "none" | "all" | "selected";

interface SkipFineInput {
  skipFinePolicy?: SkipFinePolicy;
  skipFineMonths?: number[];
}

const assertMembership = (req: { membership?: Prisma.MembershipModel }) => {
  if (!req.membership) {
    throw createHttpError(400, "Society context is missing. Provide x-society-id header.");
  }
  return req.membership;
};

export { assertMembership };

export function addMonths(d: Date, months: number): Date {
  const x = new Date(d);
  x.setMonth(x.getMonth() + months);
  return x;
}

export function computeExpectedMaturityPayout(
  monthlyAmount: Prisma.Decimal,
  duration: number,
  maturityPerHundred: Prisma.Decimal,
): Prisma.Decimal {
  const totalPrincipal = monthlyAmount.mul(duration);
  const interest = totalPrincipal.mul(maturityPerHundred).div(100);
  return totalPrincipal.add(interest);
}

function rdDueParamsFromAccount(account: {
  monthlyAmount: Prisma.Decimal;
  fineCalculationMethodSnapshot: RdFineCalculationMethod;
  fixedOverdueFineAmountSnapshot: Prisma.Decimal | null;
  fineRatePerHundredSnapshot: Prisma.Decimal;
  graceDaysSnapshot: number;
  penaltyMultiplierSnapshot: Prisma.Decimal | null;
  penaltyStartMonthSnapshot: number | null;
}): RdDueParams {
  return {
    monthlyAmount: account.monthlyAmount,
    fineCalculationMethod: account.fineCalculationMethodSnapshot,
    fixedOverdueFineAmount: account.fixedOverdueFineAmountSnapshot,
    fineRatePerHundred: account.fineRatePerHundredSnapshot,
    graceDays: account.graceDaysSnapshot,
    penaltyMultiplier: account.penaltyMultiplierSnapshot ?? new Prisma.Decimal(1),
    penaltyStartMonth: account.penaltyStartMonthSnapshot ?? 1,
  };
}

function toInstallmentInputs(
  rows: {
    id: string;
    monthIndex: number;
    dueDate: Date;
    principalAmount: Prisma.Decimal;
    paidPrincipal: Prisma.Decimal;
  }[],
): InstallmentInput[] {
  return rows.map((r) => ({
    id: r.id,
    monthIndex: r.monthIndex,
    dueDate: r.dueDate,
    principalAmount: r.principalAmount,
    paidPrincipal: r.paidPrincipal,
  }));
}

function deriveInstallmentStatus(
  principalAmount: Prisma.Decimal,
  paidPrincipal: Prisma.Decimal,
  dueDate: Date,
  graceDays: number,
  now: Date,
): RecurringDepositInstallmentStatus {
  const remaining = Prisma.Decimal.max(principalAmount.sub(paidPrincipal), new Prisma.Decimal(0));
  if (remaining.lte(0)) return RecurringDepositInstallmentStatus.PAID;
  if (isOverdue(dueDate, graceDays, now)) return RecurringDepositInstallmentStatus.OVERDUE;
  if (paidPrincipal.gt(0)) return RecurringDepositInstallmentStatus.PARTIAL;
  return RecurringDepositInstallmentStatus.PENDING;
}

function validateMonthFilter(
  monthFilter: number[] | undefined,
  installments: RecurringDepositInstallment[],
): number[] | undefined {
  if (!monthFilter?.length) return undefined;
  const valid = new Set(installments.map((i) => i.monthIndex));
  for (const m of monthFilter) {
    if (!valid.has(m)) {
      throw createHttpError(400, `Invalid month index: ${m}`);
    }
  }
  return monthFilter;
}

function resolveSkipFineMonthIndices(
  policy: SkipFinePolicy,
  monthFilter: number[] | undefined,
  skipFineMonths: number[] | undefined,
  lines: { monthIndex: number; totalDue: Prisma.Decimal }[],
  installments: RecurringDepositInstallment[],
): Set<number> {
  if (policy === "none") {
    return new Set<number>();
  }

  const validMonths = new Set(installments.map((i) => i.monthIndex));
  const inScopeMonths = new Set(monthFilter ?? installments.map((i) => i.monthIndex));

  if (policy === "all") {
    return new Set(
      lines
        .filter((line) => line.totalDue.gt(0))
        .filter((line) => inScopeMonths.has(line.monthIndex))
        .map((line) => line.monthIndex),
    );
  }

  if (!skipFineMonths?.length) {
    throw createHttpError(400, "skipFineMonths is required when skipFinePolicy is selected");
  }

  const result = new Set<number>();
  for (const m of skipFineMonths) {
    if (!validMonths.has(m)) {
      throw createHttpError(400, `Invalid skip fine month index: ${m}`);
    }
    if (!inScopeMonths.has(m)) {
      throw createHttpError(400, `Skip fine month ${m} is outside selected payment scope`);
    }
    result.add(m);
  }
  return result;
}

export const createRdProjectType = async (
  actor: Prisma.MembershipModel,
  data: CreateRdProjectTypeInput,
) => {
  return prisma.recurringDepositProjectType.create({
    data: {
      name: data.name,
      duration: data.duration,
      minimumMonthlyAmount: new Prisma.Decimal(data.minimumMonthlyAmount),
      maturityPerHundred: new Prisma.Decimal(data.maturityPerHundred),
      fineCalculationMethod: data.fineCalculationMethod,
      fixedOverdueFineAmount:
        data.fineCalculationMethod === RdFineCalculationMethod.FIXED_PER_STREAK_UNIT
          ? new Prisma.Decimal(data.fixedOverdueFineAmount ?? 0)
          : null,
      fineRatePerHundred:
        data.fineCalculationMethod === RdFineCalculationMethod.PROPORTIONAL_PER_HUNDRED
          ? new Prisma.Decimal(data.fineRatePerHundred)
          : new Prisma.Decimal(0),
      graceDays: data.graceDays,
      penaltyMultiplier:
        data.penaltyMultiplier !== undefined
          ? new Prisma.Decimal(data.penaltyMultiplier)
          : null,
      penaltyStartMonth: data.penaltyStartMonth ?? null,
      societyId: actor.societyId,
      createdBy: actor.userId,
    },
  });
};

export const listRdProjectTypes = async (
  societyId: string,
  includeDeleted = false,
  includeArchived = false,
) => {
  return prisma.recurringDepositProjectType.findMany({
    where: {
      societyId,
      ...(includeDeleted ? {} : { isDeleted: false }),
      ...(includeArchived ? {} : { isArchived: false }),
    },
    orderBy: [{ createdAt: "desc" }],
  });
};

export const softDeleteRdProjectType = async (
  actor: Prisma.MembershipModel,
  projectTypeId: string,
) => {
  const projectType = await prisma.recurringDepositProjectType.findFirst({
    where: {
      id: projectTypeId,
      societyId: actor.societyId,
      isDeleted: false,
    },
    select: { id: true },
  });

  if (!projectType) {
    throw createHttpError(404, "RD project type not found");
  }

  return prisma.recurringDepositProjectType.update({
    where: { id: projectTypeId },
    data: {
      isDeleted: true,
      deletedAt: new Date(),
      isArchived: true,
      updatedBy: actor.userId,
    },
  });
};

export const createRdAccount = async (actor: Prisma.MembershipModel, data: CreateRdAccountInput) => {
  if (data.rd.monthlyAmount <= 0) {
    throw createHttpError(400, "Monthly amount must be greater than 0");
  }
  if (!data.nominees.length) {
    throw createHttpError(400, "At least one nominee is required");
  }

  const initialPaymentAmount = data.payment?.amount ?? 0;
  if (initialPaymentAmount < 0) {
    throw createHttpError(400, "Initial payment amount cannot be negative");
  }

  return prisma.$transaction(async (tx) => {
    const projectType = await tx.recurringDepositProjectType.findFirst({
      where: {
        id: data.rd.projectTypeId,
        societyId: actor.societyId,
        isDeleted: false,
        isArchived: false,
      },
    });

    if (!projectType) {
      throw createHttpError(404, "RD project type not found for this society");
    }

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

    const monthlyAmount = new Prisma.Decimal(data.rd.monthlyAmount);
    if (monthlyAmount.lt(projectType.minimumMonthlyAmount)) {
      throw createHttpError(
        400,
        `Monthly amount must be at least ${projectType.minimumMonthlyAmount.toFixed(2)}`,
      );
    }

    const customer = await tx.customer.create({
      data: {
        fullName: data.customer.fullName,
        phone: data.customer.phone,
        email: data.customer.email ?? null,
        address: data.customer.address ?? null,
        aadhaar: data.customer.aadhaar ?? null,
        pan: data.customer.pan ?? null,
        accountType: CustomerAccountType.RECURING_DEPOSIT,
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

    const startDate = new Date(data.rd.startDate);
    const maturityDate = addMonths(startDate, projectType.duration);
    const totalPrincipalExpected = monthlyAmount.mul(projectType.duration);
    const expectedMaturityPayout = computeExpectedMaturityPayout(
      monthlyAmount,
      projectType.duration,
      projectType.maturityPerHundred,
    );

    const rd = await tx.recurringDeposit.create({
      data: {
        monthlyAmount,
        totalPrincipalExpected,
        expectedMaturityPayout,
        maturityPerHundredSnapshot: projectType.maturityPerHundred,
        fineCalculationMethodSnapshot: projectType.fineCalculationMethod,
        fixedOverdueFineAmountSnapshot: projectType.fixedOverdueFineAmount,
        fineRatePerHundredSnapshot: projectType.fineRatePerHundred,
        graceDaysSnapshot: projectType.graceDays,
        penaltyMultiplierSnapshot: projectType.penaltyMultiplier,
        penaltyStartMonthSnapshot: projectType.penaltyStartMonth,
        startDate,
        maturityDate,
        status: ServiceStatus.ACTIVE,
        projectTypeId: projectType.id,
        customerId: customer.id,
        createdBy: actor.userId,
      },
    });

    const now = new Date();
    const installmentRows = Array.from({ length: projectType.duration }).map((_, index) => {
      const monthIndex = index + 1;
      const dueDate = addMonths(startDate, monthIndex);
      const principalAmount = monthlyAmount;
      const paidPrincipal = new Prisma.Decimal(0);
      const status = deriveInstallmentStatus(
        principalAmount,
        paidPrincipal,
        dueDate,
        projectType.graceDays,
        now,
      );
      return {
        recurringDepositId: rd.id,
        monthIndex,
        dueDate,
        principalAmount,
        paidPrincipal,
        status,
        createdBy: actor.userId,
      };
    });

    await tx.recurringDepositInstallment.createMany({
      data: installmentRows,
    });

    if (initialPaymentAmount > 0) {
      const payAmount = new Prisma.Decimal(initialPaymentAmount);
      const instRows = await tx.recurringDepositInstallment.findMany({
        where: { recurringDepositId: rd.id, isDeleted: false },
        orderBy: { monthIndex: "asc" },
      });

      const params = rdDueParamsFromAccount({
        monthlyAmount,
        fineCalculationMethodSnapshot: projectType.fineCalculationMethod,
        fixedOverdueFineAmountSnapshot: projectType.fixedOverdueFineAmount,
        fineRatePerHundredSnapshot: projectType.fineRatePerHundred,
        graceDaysSnapshot: projectType.graceDays,
        penaltyMultiplierSnapshot: projectType.penaltyMultiplier,
        penaltyStartMonthSnapshot: projectType.penaltyStartMonth,
      });

      const lines = computeDueLines(toInstallmentInputs(instRows), params, now);
      const maxDue = sumTotalDue(lines);
      if (payAmount.gt(maxDue)) {
        throw createHttpError(400, "Initial payment exceeds total due");
      }

      const { allocations, unallocated } = fifoAllocatePayment(lines, payAmount);
      if (unallocated.gt(0)) {
        throw createHttpError(400, "Could not allocate initial payment");
      }

      const totalPrincipal = allocations.reduce(
        (s, a) => s.add(a.principalApplied),
        new Prisma.Decimal(0),
      );
      const totalFine = allocations.reduce(
        (s, a) => s.add(a.fineApplied),
        new Prisma.Decimal(0),
      );

      const transactionRow = await tx.recurringDepositTransaction.create({
        data: {
          recurringDepositId: rd.id,
          amount: payAmount,
          principalAmount: totalPrincipal,
          fineAmount: totalFine,
          type: RecurringDepositTransactionType.CREDIT,
          paymentMethod: data.payment?.paymentMethod ?? null,
          transactionId: data.payment?.transactionId ?? null,
          upiId: data.payment?.upiId ?? null,
          chequeNumber: data.payment?.chequeNumber ?? null,
          bankName: data.payment?.bankName ?? null,
          createdBy: actor.userId,
        },
      });

      for (const alloc of allocations) {
        await tx.recurringDepositPaymentAllocation.create({
          data: {
            transactionId: transactionRow.id,
            installmentId: alloc.installmentId,
            principalApplied: alloc.principalApplied,
            fineApplied: alloc.fineApplied,
          },
        });

        const inst = instRows.find((r: RecurringDepositInstallment) => r.id === alloc.installmentId);
        if (!inst) continue;
        const newPaid = inst.paidPrincipal.add(alloc.principalApplied);
        await tx.recurringDepositInstallment.update({
          where: { id: alloc.installmentId },
          data: {
            paidPrincipal: newPaid,
            status: deriveInstallmentStatus(
              inst.principalAmount,
              newPaid,
              inst.dueDate,
              projectType.graceDays,
              now,
            ),
            updatedBy: actor.userId,
          },
        });
      }
    }

    return tx.recurringDeposit.findUniqueOrThrow({
      where: { id: rd.id },
      include: {
        customer: true,
        projectType: true,
        installments: {
          where: { isDeleted: false },
          orderBy: { monthIndex: "asc" },
        },
        transactions: {
          where: { isDeleted: false },
          orderBy: { createdAt: "desc" },
          include: { allocations: true },
        },
      },
    });
  });
};

export const listRdReferrerMembers = async (societyId: string) => {
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

export const listRdAccounts = async (
  societyId: string,
  paging: { page: number; pageSize: number },
  sorting?: {
    sortBy?:
      | "id"
      | "customer_name"
      | "phone"
      | "monthly_amount"
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
    | Prisma.RecurringDepositOrderByWithRelationInput
    | Prisma.RecurringDepositOrderByWithRelationInput[]
  > = {
    id: { id: sortOrder },
    customer_name: [{ customer: { fullName: sortOrder } }, { id: "desc" }],
    phone: [{ customer: { phone: sortOrder } }, { id: "desc" }],
    monthly_amount: [{ monthlyAmount: sortOrder }, { id: "desc" }],
    maturity_date: [{ maturityDate: sortOrder }, { id: "desc" }],
    status: [{ status: sortOrder }, { id: "desc" }],
  };

  const where: Prisma.RecurringDepositWhereInput = {
    ...(includeDeleted ? {} : { isDeleted: false }),
    customer: {
      societyId,
      isDeleted: false,
    },
  };

  const searchTerm = search?.trim();
  if (searchTerm) {
    const searchOrConditions: Prisma.RecurringDepositWhereInput[] = [
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
      searchOrConditions.push({ monthlyAmount: amount });
    }

    where.AND = [{ OR: searchOrConditions }];
  }

  const [items, total] = await Promise.all([
    prisma.recurringDeposit.findMany({
      where,
      include: {
        customer: true,
        projectType: true,
      },
      orderBy: orderByByField[sortBy],
      skip,
      take: paging.pageSize,
    }),
    prisma.recurringDeposit.count({ where }),
  ]);

  return {
    items,
    total,
    page: paging.page,
    pageSize: paging.pageSize,
    totalPages: Math.max(1, Math.ceil(total / paging.pageSize)),
  };
};

export const getRdDetail = async (rdId: string, societyId: string) => {
  const rd = await prisma.recurringDeposit.findFirst({
    where: {
      id: rdId,
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
      installments: {
        where: { isDeleted: false },
        orderBy: { monthIndex: "asc" },
      },
      transactions: {
        where: { isDeleted: false },
        orderBy: { createdAt: "desc" },
        include: { allocations: true },
      },
    },
  }) as Prisma.RecurringDepositGetPayload<{
    include: {
      customer: { include: { nominees: true } };
      projectType: true;
      installments: true;
      transactions: { include: { allocations: true } };
    };
  }> | null;

  if (!rd) {
    throw createHttpError(404, "RD account not found");
  }

  const now = new Date();
  const params = rdDueParamsFromAccount(rd);
  const lines = computeDueLines(toInstallmentInputs(rd.installments), params, now);
  const totalOutstanding = sumTotalDue(lines);

  const lineById = new Map(lines.map((l) => [l.installmentId, l]));
  const totalDeferredFines = rd.installments.reduce(
    (sum, inst) => sum.add(inst.deferredFineAccrued),
    new Prisma.Decimal(0),
  );
  const netMaturityPayoutAfterDeferredFines = Prisma.Decimal.max(
    rd.expectedMaturityPayout.sub(totalDeferredFines),
    new Prisma.Decimal(0),
  );
  const installmentsWithDue = rd.installments.map((inst: RecurringDepositInstallment) => {
    const line = lineById.get(inst.id);
    return {
      ...inst,
      remainingPrincipal: line?.remainingPrincipal.toString() ?? "0",
      fine: line?.fine.toString() ?? "0",
      totalDue: line?.totalDue.toString() ?? "0",
      deferredFineAccrued: inst.deferredFineAccrued.toString(),
      computedStatus: line?.status ?? inst.status,
    };
  });

  return {
    ...rd,
    installments: installmentsWithDue,
    summary: {
      totalOutstanding: totalOutstanding.toString(),
      expectedMaturityPayout: rd.expectedMaturityPayout.toString(),
      grossMaturityPayout: rd.expectedMaturityPayout.toString(),
      totalDeferredFines: totalDeferredFines.toString(),
      netMaturityPayoutAfterDeferredFines: netMaturityPayoutAfterDeferredFines.toString(),
      totalPrincipalExpected: rd.totalPrincipalExpected.toString(),
    },
  };
};

export const updateRdAccount = async (
  actor: Prisma.MembershipModel,
  rdId: string,
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
  },
) => {
  if (!data.nominees.length) {
    throw createHttpError(400, "At least one nominee is required");
  }

  return prisma.$transaction(async (tx) => {
    const rd = await tx.recurringDeposit.findFirst({
      where: {
        id: rdId,
        isDeleted: false,
        customer: { societyId: actor.societyId, isDeleted: false },
      },
      select: { id: true, customerId: true },
    });

    if (!rd) {
      throw createHttpError(404, "RD account not found");
    }

    await tx.customer.update({
      where: { id: rd.customerId },
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
      where: { customerId: rd.customerId, isDeleted: false },
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
            customerId: rd.customerId,
            createdBy: actor.userId,
          },
        }),
      ),
    );

    return getRdDetail(rdId, actor.societyId);
  });
};

export const previewRdPayment = async (
  societyId: string,
  rdId: string,
  input: { amount?: number; months?: number[] } & SkipFineInput,
) => {
  const rd = await prisma.recurringDeposit.findFirst({
    where: {
      id: rdId,
      isDeleted: false,
      customer: { societyId, isDeleted: false },
    },
    include: {
      installments: {
        where: { isDeleted: false },
        orderBy: { monthIndex: "asc" },
      },
    },
  }) as Prisma.RecurringDepositGetPayload<{
    include: { installments: true };
  }> | null;

  if (!rd) {
    throw createHttpError(404, "RD account not found");
  }

  const now = new Date();
  const params = rdDueParamsFromAccount(rd);
  const lines = computeDueLines(toInstallmentInputs(rd.installments), params, now);

  const monthFilter = validateMonthFilter(input.months, rd.installments);
  const skipFinePolicy = input.skipFinePolicy ?? "none";
  const skipFineMonthIndices = resolveSkipFineMonthIndices(
    skipFinePolicy,
    monthFilter,
    input.skipFineMonths,
    lines,
    rd.installments,
  );
  const maxDue = skipFinePolicy === "none"
    ? sumTotalDue(lines, monthFilter)
    : sumMaxAllocatable(lines, monthFilter, skipFineMonthIndices);
  let amountDecimal: Prisma.Decimal;
  if (input.amount !== undefined) {
    amountDecimal = new Prisma.Decimal(input.amount);
    if (amountDecimal.lte(0)) {
      throw createHttpError(400, "Amount must be greater than 0");
    }
    if (amountDecimal.gt(maxDue)) {
      throw createHttpError(400, "Amount exceeds total due");
    }
  } else {
    amountDecimal = new Prisma.Decimal(0);
  }

  const allocationResult = skipFinePolicy === "none"
    ? (() => {
      const standard = fifoAllocatePayment(lines, amountDecimal, monthFilter);
      return {
        allocations: standard.allocations,
        unallocated: standard.unallocated,
        deferredFineDeltas: [] as {
          installmentId: string;
          monthIndex: number;
          deferredFineDelta: Prisma.Decimal;
        }[],
      };
    })()
    : fifoAllocatePaymentWithFineSkip(lines, amountDecimal, monthFilter, skipFineMonthIndices);
  const { allocations, unallocated, deferredFineDeltas } = allocationResult;

  return {
    maxDue: maxDue.toString(),
    amount: input.amount !== undefined ? amountDecimal.toString() : "0",
    allocations: allocations.map((a) => ({
      installmentId: a.installmentId,
      monthIndex: a.monthIndex,
      principalApplied: a.principalApplied.toString(),
      fineApplied: a.fineApplied.toString(),
    })),
    deferredFineDeltas: deferredFineDeltas.map((d) => ({
      installmentId: d.installmentId,
      monthIndex: d.monthIndex,
      deferredFineDelta: d.deferredFineDelta.toString(),
    })),
    unallocated: unallocated.toString(),
    skipFinePolicy,
    skipFineMonths: Array.from(skipFineMonthIndices),
    lines: lines.map((l) => ({
      installmentId: l.installmentId,
      monthIndex: l.monthIndex,
      remainingPrincipal: l.remainingPrincipal.toString(),
      fine: l.fine.toString(),
      totalDue: l.totalDue.toString(),
      overdue: l.overdue,
      status: l.status,
    })),
  };
};

export const payRd = async (
  actor: Prisma.MembershipModel,
  rdId: string,
  data: { amount: number; months?: number[] } & PaymentMetaInput & SkipFineInput,
) => {
  if (data.amount <= 0) {
    throw createHttpError(400, "Payment amount must be greater than 0");
  }

  return prisma.$transaction(async (tx) => {
    const rd = await tx.recurringDeposit.findFirst({
      where: {
        id: rdId,
        isDeleted: false,
        customer: { societyId: actor.societyId, isDeleted: false },
      },
      include: {
        installments: {
          where: { isDeleted: false },
          orderBy: { monthIndex: "asc" },
        },
      },
    }) as Prisma.RecurringDepositGetPayload<{
      include: { installments: true };
    }> | null;

    if (!rd) {
      throw createHttpError(404, "RD account not found");
    }

    if (rd.status !== ServiceStatus.ACTIVE) {
      throw createHttpError(400, "RD account is not active");
    }

    const now = new Date();
    const params = rdDueParamsFromAccount(rd);
    const lines = computeDueLines(toInstallmentInputs(rd.installments), params, now);

    const monthFilter = validateMonthFilter(data.months, rd.installments);
    const skipFinePolicy = data.skipFinePolicy ?? "none";
    const skipFineMonthIndices = resolveSkipFineMonthIndices(
      skipFinePolicy,
      monthFilter,
      data.skipFineMonths,
      lines,
      rd.installments,
    );
    const maxDue = skipFinePolicy === "none"
      ? sumTotalDue(lines, monthFilter)
      : sumMaxAllocatable(lines, monthFilter, skipFineMonthIndices);
    const payAmount = new Prisma.Decimal(data.amount);
    if (payAmount.gt(maxDue)) {
      throw createHttpError(400, "Payment exceeds total due");
    }

    const allocationResult = skipFinePolicy === "none"
      ? (() => {
        const standard = fifoAllocatePayment(lines, payAmount, monthFilter);
        return {
          allocations: standard.allocations,
          unallocated: standard.unallocated,
          deferredFineDeltas: [] as {
            installmentId: string;
            monthIndex: number;
            deferredFineDelta: Prisma.Decimal;
          }[],
        };
      })()
      : fifoAllocatePaymentWithFineSkip(lines, payAmount, monthFilter, skipFineMonthIndices);
    const { allocations, unallocated, deferredFineDeltas } = allocationResult;
    if (unallocated.gt(0)) {
      throw createHttpError(400, "Could not allocate payment");
    }

    const totalPrincipal = allocations.reduce(
      (s, a) => s.add(a.principalApplied),
      new Prisma.Decimal(0),
    );
    const totalFine = allocations.reduce(
      (s, a) => s.add(a.fineApplied),
      new Prisma.Decimal(0),
    );

    const transactionRow = await tx.recurringDepositTransaction.create({
      data: {
        recurringDepositId: rd.id,
        amount: payAmount,
        principalAmount: totalPrincipal,
        fineAmount: totalFine,
        type: RecurringDepositTransactionType.CREDIT,
        paymentMethod: data.paymentMethod ?? null,
        transactionId: data.transactionId ?? null,
        upiId: data.upiId ?? null,
        chequeNumber: data.chequeNumber ?? null,
        bankName: data.bankName ?? null,
        createdBy: actor.userId,
      },
    });

    const deferredMap = new Map(
      deferredFineDeltas.map((d) => [d.installmentId, d.deferredFineDelta]),
    );

    for (const alloc of allocations) {
      await tx.recurringDepositPaymentAllocation.create({
        data: {
          transactionId: transactionRow.id,
          installmentId: alloc.installmentId,
          principalApplied: alloc.principalApplied,
          fineApplied: alloc.fineApplied,
        },
      });

      const inst = rd.installments.find((r: RecurringDepositInstallment) => r.id === alloc.installmentId);
      if (!inst) continue;
      const newPaid = inst.paidPrincipal.add(alloc.principalApplied);
      const deferredDelta = deferredMap.get(alloc.installmentId) ?? new Prisma.Decimal(0);
      await tx.recurringDepositInstallment.update({
        where: { id: alloc.installmentId },
        data: {
          paidPrincipal: newPaid,
          deferredFineAccrued: inst.deferredFineAccrued.add(deferredDelta),
          status: deriveInstallmentStatus(
            inst.principalAmount,
            newPaid,
            inst.dueDate,
            rd.graceDaysSnapshot,
            now,
          ),
          updatedBy: actor.userId,
        },
      });
    }

    return tx.recurringDeposit.findUniqueOrThrow({
      where: { id: rd.id },
      include: {
        customer: true,
        projectType: true,
        installments: {
          where: { isDeleted: false },
          orderBy: { monthIndex: "asc" },
        },
        transactions: {
          where: { isDeleted: false },
          orderBy: { createdAt: "desc" },
          include: { allocations: true },
        },
      },
    });
  });
};

export const withdrawRd = async (
  actor: Prisma.MembershipModel,
  rdId: string,
  data: PaymentMetaInput & { deductDeferredFinesFromMaturity?: boolean },
) => {
  return prisma.$transaction(async (tx) => {
    const rd = await tx.recurringDeposit.findFirst({
      where: {
        id: rdId,
        isDeleted: false,
        customer: { societyId: actor.societyId, isDeleted: false },
      },
      include: {
        installments: {
          where: { isDeleted: false },
          orderBy: { monthIndex: "asc" },
        },
      },
    }) as Prisma.RecurringDepositGetPayload<{
      include: { installments: true };
    }> | null;

    if (!rd) {
      throw createHttpError(404, "RD account not found");
    }

    const now = new Date();
    if (startOfDay(now) < startOfDay(rd.maturityDate)) {
      throw createHttpError(400, "Withdrawal is only allowed after maturity date");
    }

    for (const inst of rd.installments) {
      const remaining = inst.principalAmount.sub(inst.paidPrincipal);
      if (remaining.gt(0)) {
        throw createHttpError(400, "All installments must be fully paid before withdrawal");
      }
    }

    if (rd.status === ServiceStatus.COMPLETED || rd.status === ServiceStatus.CLOSED) {
      throw createHttpError(400, "RD account is already closed");
    }

    const totalDeferredFines = rd.installments.reduce(
      (sum, inst) => sum.add(inst.deferredFineAccrued),
      new Prisma.Decimal(0),
    );
    const shouldDeductDeferredFines =
      totalDeferredFines.gt(0) && data.deductDeferredFinesFromMaturity === true;
    if (totalDeferredFines.gt(0) && !shouldDeductDeferredFines) {
      throw createHttpError(
        400,
        "Deferred fines are pending. Enable maturity deduction to settle and withdraw.",
      );
    }

    const payout = shouldDeductDeferredFines
      ? rd.expectedMaturityPayout.sub(totalDeferredFines)
      : rd.expectedMaturityPayout;
    if (payout.lt(0)) {
      throw createHttpError(400, "Deferred fines exceed maturity payout");
    }

    await tx.recurringDepositTransaction.create({
      data: {
        recurringDepositId: rd.id,
        amount: payout,
        principalAmount: rd.totalPrincipalExpected,
        // Fine amount on PAYOUT stores deferred fine settlement done at maturity.
        fineAmount: shouldDeductDeferredFines ? totalDeferredFines : new Prisma.Decimal(0),
        type: RecurringDepositTransactionType.PAYOUT,
        paymentMethod: data.paymentMethod ?? null,
        transactionId: data.transactionId ?? null,
        upiId: data.upiId ?? null,
        chequeNumber: data.chequeNumber ?? null,
        bankName: data.bankName ?? null,
        createdBy: actor.userId,
      },
    });

    return tx.recurringDeposit.update({
      where: { id: rd.id },
      data: {
        status: ServiceStatus.COMPLETED,
        updatedBy: actor.userId,
      },
      include: {
        customer: true,
        projectType: true,
        installments: true,
        transactions: {
          where: { isDeleted: false },
          orderBy: { createdAt: "desc" },
        },
      },
    });
  });
};

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export const softDeleteRdAccount = async (actor: Prisma.MembershipModel, rdId: string) => {
  const rd = await prisma.recurringDeposit.findFirst({
    where: {
      id: rdId,
      isDeleted: false,
      customer: {
        societyId: actor.societyId,
        isDeleted: false,
      },
    },
    select: { id: true },
  });

  if (!rd) {
    throw createHttpError(404, "RD account not found");
  }

  return prisma.recurringDeposit.update({
    where: { id: rdId },
    data: {
      isDeleted: true,
      deletedAt: new Date(),
      status: ServiceStatus.CLOSED,
      updatedBy: actor.userId,
    },
  });
};
