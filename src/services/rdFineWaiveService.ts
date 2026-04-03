import prisma from "@/config/prisma.js";
import env from "@/config/dotenv.js";
import {
  ActivityActionType,
  ActivityEntityType,
  Prisma,
  RdFineWaiveRequestStatus,
  RdFineWaiveScopeType,
  type RecurringDepositInstallment,
} from "@/generated/prisma/client.js";
import createHttpError from "http-errors";
import { computeDueLines, type InstallmentInput } from "@/services/rdDueCalculator.js";
import { logActivity } from "@/services/activityService.js";
import { pushRdWaiveNotificationsToFirestore } from "@/services/firebaseNotificationService.js";
import { sendRdFineWaiveEmail } from "@/services/emailService.js";

export interface CreateRdFineWaiveRequestInput {
  scopeType: "all" | "selected";
  months?: number[];
  ttlDays?: number;
  expiresAt?: Date;
  reduceFromMaturity?: boolean;
  reason?: string;
  autoApprove?: boolean;
}

type RdWithInstallments = Prisma.RecurringDepositGetPayload<{
  include: {
    customer: true;
    installments: { where: { isDeleted: false }; orderBy: { monthIndex: "asc" } };
  };
}>;

function toInstallmentInputs(rows: RecurringDepositInstallment[]): InstallmentInput[] {
  return rows.map((r) => ({
    id: r.id,
    monthIndex: r.monthIndex,
    dueDate: r.dueDate,
    principalAmount: r.principalAmount,
    paidPrincipal: r.paidPrincipal,
  }));
}

function resolveExpiresAt(input: CreateRdFineWaiveRequestInput): Date {
  if (input.expiresAt) return input.expiresAt;
  const ttlDays = input.ttlDays ?? 7;
  if (ttlDays < 1 || ttlDays > 30) {
    throw createHttpError(400, "ttlDays must be between 1 and 30");
  }
  const expires = new Date();
  expires.setDate(expires.getDate() + ttlDays);
  return expires;
}

function resolveTargetMonths(
  input: CreateRdFineWaiveRequestInput,
  rd: RdWithInstallments,
  now: Date,
): { monthIndex: number; fine: Prisma.Decimal }[] {
  const lines = computeDueLines(
    toInstallmentInputs(rd.installments),
    {
      monthlyAmount: rd.monthlyAmount,
      fineCalculationMethod: rd.fineCalculationMethodSnapshot,
      fixedOverdueFineAmount: rd.fixedOverdueFineAmountSnapshot,
      fineRatePerHundred: rd.fineRatePerHundredSnapshot,
      graceDays: rd.graceDaysSnapshot,
      penaltyMultiplier: rd.penaltyMultiplierSnapshot ?? new Prisma.Decimal(1),
      penaltyStartMonth: rd.penaltyStartMonthSnapshot ?? 1,
    },
    now,
  );

  const withFine = new Map<number, Prisma.Decimal>();
  for (const line of lines) {
    if (line.remainingPrincipal.gt(0) && line.fine.gt(0)) {
      withFine.set(line.monthIndex, line.fine);
    }
  }

  if (input.scopeType === "all") {
    if (!withFine.size) {
      throw createHttpError(400, "No unpaid overdue fines are available to waive");
    }
    return [...withFine.entries()]
      .map(([monthIndex, fine]) => ({ monthIndex, fine }))
      .sort((a, b) => a.monthIndex - b.monthIndex);
  }

  const months = input.months ?? [];
  if (!months.length) {
    throw createHttpError(400, "months are required for selected scope");
  }

  const unique = [...new Set(months)].sort((a, b) => a - b);
  const selected: { monthIndex: number; fine: Prisma.Decimal }[] = [];
  for (const monthIndex of unique) {
    const fine = withFine.get(monthIndex);
    if (!fine) {
      throw createHttpError(400, `Month ${monthIndex} has no unpaid overdue fine to waive`);
    }
    selected.push({ monthIndex, fine });
  }
  return selected;
}

async function getApprovers(societyId: string, excludingMembershipId?: string) {
  const roles = await prisma.societyRole.findMany({
    where: { societyId, permissions: { has: "recurring_deposit.approve_fine_waive" } },
    select: { id: true },
  });
  if (!roles.length) return [];
  return prisma.membership.findMany({
    where: {
      societyId,
      deletedAt: null,
      roleId: { in: roles.map((r) => r.id) },
      ...(excludingMembershipId ? { id: { not: excludingMembershipId } } : {}),
    },
    include: {
      user: { select: { id: true, name: true, email: true, phone: true } },
      role: { select: { id: true, name: true } },
    },
  });
}

export const createRdFineWaiveRequest = async (
  actor: Prisma.MembershipModel,
  rdId: string,
  input: CreateRdFineWaiveRequestInput,
) => {
  const rd = (await prisma.recurringDeposit.findFirst({
    where: {
      id: rdId,
      isDeleted: false,
      status: "ACTIVE",
      customer: { societyId: actor.societyId, isDeleted: false },
    },
    include: {
      customer: true,
      installments: {
        where: { isDeleted: false },
        orderBy: { monthIndex: "asc" },
      },
    },
  })) as RdWithInstallments | null;

  if (!rd) throw createHttpError(404, "RD account not found");

  const expiresAt = resolveExpiresAt(input);
  if (expiresAt.getTime() <= Date.now()) {
    throw createHttpError(400, "expiresAt must be in the future");
  }

  const targetMonths = resolveTargetMonths(input, rd, new Date());
  const autoApprove = input.autoApprove === true;
  const request = await prisma.$transaction(async (tx) => {
    const created = await tx.rdFineWaiveRequest.create({
      data: {
        recurringDepositId: rd.id,
        requestedByMembershipId: actor.id,
        scopeType:
          input.scopeType === "all" ? RdFineWaiveScopeType.ALL : RdFineWaiveScopeType.SELECTED,
        reason: input.reason?.trim() ? input.reason.trim() : null,
        expiresAt,
        reduceFromMaturity: input.reduceFromMaturity === true,
        status: autoApprove ? RdFineWaiveRequestStatus.APPROVED : RdFineWaiveRequestStatus.PENDING,
        approvedByMembershipId: autoApprove ? actor.id : null,
        approvedAt: autoApprove ? new Date() : null,
        months: {
          createMany: {
            data: targetMonths.map((m) => ({
              monthIndex: m.monthIndex,
              waivedFineAmount: m.fine,
            })),
          },
        },
      },
      include: { months: true },
    });

    await logActivity(tx, actor, {
      entityType: ActivityEntityType.RD_ACCOUNT,
      entityId: rd.id,
      actionType: autoApprove
        ? ActivityActionType.WAIVE_REQUEST_APPROVED
        : ActivityActionType.WAIVE_REQUEST_CREATED,
      metadata: {
        requestId: created.id,
        scopeType: created.scopeType,
        monthIndices: created.months.map((m) => m.monthIndex),
        reduceFromMaturity: created.reduceFromMaturity,
        autoApproved: autoApprove,
      },
    });
    return created;
  });

  const approvers = await getApprovers(actor.societyId, actor.id);
  const statusText = request.status;
  await pushRdWaiveNotificationsToFirestore({
    societyId: actor.societyId,
    notificationType: "RD_FINE_WAIVE_REQUEST",
    requestId: request.id,
    rdId: rd.id,
    rdCustomerName: rd.customer.fullName,
    module: "rd",
    accountId: rd.id,
    accountLabel: `${rd.customer.fullName} (${rd.id})`,
    routePath: "/recurring-deposits",
    detailKey: request.id,
    requesterMembershipId: actor.id,
    requesterName: actor.userId,
    status: statusText,
    canAct: !autoApprove,
    approverMembershipIds: approvers.map((a) => a.id),
    monthEntries: request.months.map((m) => ({
      monthIndex: m.monthIndex,
      fine: m.waivedFineAmount.toString(),
    })),
    reduceFromMaturity: request.reduceFromMaturity,
    expiresAt: request.expiresAt.toISOString(),
  });

  const frontendBaseUrl = env.FRONTEND_URLS.split(",").map((url) => url.trim()).find(Boolean) ?? "";
  const approversWithEmail = approvers.filter((m) => Boolean(m.user.email));
  if (approversWithEmail.length) {
    for (const approver of approversWithEmail) {
      const email = approver.user.email;
      if (!email) continue;
      const notificationDocId = `${request.id}_${approver.id}`;
      const actionPath = `/notifications?docId=${encodeURIComponent(notificationDocId)}&requestId=${encodeURIComponent(request.id)}&accountType=rd&accountId=${encodeURIComponent(rd.id)}`;
      const actionUrl = frontendBaseUrl ? `${frontendBaseUrl}${actionPath}` : undefined;

      await sendRdFineWaiveEmail({
        to: [email],
        subject: autoApprove
          ? "RD fine waive-off auto-approved"
          : "RD fine waive-off request pending approval",
        title: autoApprove ? "RD fine waive-off auto-approved" : "RD fine waive-off request",
        statusLabel: statusText,
        requesterMembershipId: actor.id,
        rdId: rd.id,
        rdCustomerName: rd.customer.fullName,
        monthEntries: request.months.map((m) => ({
          monthIndex: m.monthIndex,
          fine: m.waivedFineAmount.toString(),
        })),
        reduceFromMaturity: request.reduceFromMaturity,
        expiresAt: request.expiresAt,
        ...(request.reason ? { reason: request.reason } : {}),
        ...(actionUrl
          ? {
              actionUrl,
              actionText: autoApprove ? "Open notification" : "Accept request",
            }
          : {}),
      });
    }
  }

  return request;
};

export const listRdFineWaiveRequests = async (actor: Prisma.MembershipModel, rdId: string) => {
  return prisma.rdFineWaiveRequest.findMany({
    where: {
      recurringDepositId: rdId,
      recurringDeposit: {
        customer: { societyId: actor.societyId, isDeleted: false },
      },
    },
    include: { months: true },
    orderBy: { createdAt: "desc" },
  });
};

export const listPendingRdFineWaiveRequests = async (actor: Prisma.MembershipModel) => {
  return prisma.rdFineWaiveRequest.findMany({
    where: {
      recurringDeposit: {
        customer: { societyId: actor.societyId, isDeleted: false },
      },
      status: RdFineWaiveRequestStatus.PENDING,
      expiresAt: { gt: new Date() },
    },
    include: {
      months: true,
      recurringDeposit: {
        include: {
          customer: {
            select: { id: true, fullName: true, phone: true },
          },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });
};

export const approveRdFineWaiveRequest = async (
  actor: Prisma.MembershipModel,
  requestId: string,
) => {
  return prisma.$transaction(async (tx) => {
    const request = await tx.rdFineWaiveRequest.findFirst({
      where: {
        id: requestId,
        recurringDeposit: { customer: { societyId: actor.societyId, isDeleted: false } },
      },
      include: {
        recurringDeposit: { include: { customer: true } },
        months: true,
      },
    });
    if (!request) throw createHttpError(404, "Fine waive request not found");
    if (request.status !== RdFineWaiveRequestStatus.PENDING) return request;
    if (request.expiresAt.getTime() <= Date.now()) {
      throw createHttpError(400, "Fine waive request is expired");
    }

    const updated = await tx.rdFineWaiveRequest.update({
      where: { id: request.id },
      data: {
        status: RdFineWaiveRequestStatus.APPROVED,
        approvedByMembershipId: actor.id,
        approvedAt: new Date(),
      },
      include: { months: true },
    });
    await logActivity(tx, actor, {
      entityType: ActivityEntityType.RD_ACCOUNT,
      entityId: request.recurringDepositId,
      actionType: ActivityActionType.WAIVE_REQUEST_APPROVED,
      metadata: {
        requestId: request.id,
        monthIndices: updated.months.map((m) => m.monthIndex),
        reduceFromMaturity: updated.reduceFromMaturity,
      },
    });

    const approvers = await getApprovers(actor.societyId);
    await pushRdWaiveNotificationsToFirestore({
      societyId: actor.societyId,
      notificationType: "RD_FINE_WAIVE_REQUEST",
      requestId: updated.id,
      rdId: request.recurringDepositId,
      rdCustomerName: request.recurringDeposit.customer.fullName,
      module: "rd",
      accountId: request.recurringDepositId,
      accountLabel: `${request.recurringDeposit.customer.fullName} (${request.recurringDepositId})`,
      routePath: "/recurring-deposits",
      detailKey: updated.id,
      requesterMembershipId: request.requestedByMembershipId,
      requesterName: actor.userId,
      status: updated.status,
      canAct: false,
      approverMembershipIds: approvers.map((a) => a.id),
      monthEntries: updated.months.map((m) => ({
        monthIndex: m.monthIndex,
        fine: m.waivedFineAmount.toString(),
      })),
      reduceFromMaturity: updated.reduceFromMaturity,
      expiresAt: updated.expiresAt.toISOString(),
      actedByMembershipId: actor.id,
    });
    return updated;
  });
};

export const rejectRdFineWaiveRequest = async (
  actor: Prisma.MembershipModel,
  requestId: string,
  rejectionReason?: string,
) => {
  return prisma.$transaction(async (tx) => {
    const request = await tx.rdFineWaiveRequest.findFirst({
      where: {
        id: requestId,
        recurringDeposit: { customer: { societyId: actor.societyId, isDeleted: false } },
      },
      include: {
        recurringDeposit: { include: { customer: true } },
        months: true,
      },
    });
    if (!request) throw createHttpError(404, "Fine waive request not found");
    if (request.status !== RdFineWaiveRequestStatus.PENDING) return request;

    const updated = await tx.rdFineWaiveRequest.update({
      where: { id: request.id },
      data: {
        status: RdFineWaiveRequestStatus.REJECTED,
        rejectedByMembershipId: actor.id,
        rejectedAt: new Date(),
        rejectionReason: rejectionReason?.trim() ? rejectionReason.trim() : null,
        invalidationReason: "MANUAL_REJECT",
      },
      include: { months: true },
    });
    await logActivity(tx, actor, {
      entityType: ActivityEntityType.RD_ACCOUNT,
      entityId: request.recurringDepositId,
      actionType: ActivityActionType.WAIVE_REQUEST_REJECTED,
      metadata: {
        requestId: request.id,
        reason: updated.rejectionReason,
      },
    });
    const approvers = await getApprovers(actor.societyId);
    await pushRdWaiveNotificationsToFirestore({
      societyId: actor.societyId,
      notificationType: "RD_FINE_WAIVE_REQUEST",
      requestId: updated.id,
      rdId: request.recurringDepositId,
      rdCustomerName: request.recurringDeposit.customer.fullName,
      module: "rd",
      accountId: request.recurringDepositId,
      accountLabel: `${request.recurringDeposit.customer.fullName} (${request.recurringDepositId})`,
      routePath: "/recurring-deposits",
      detailKey: updated.id,
      requesterMembershipId: request.requestedByMembershipId,
      requesterName: actor.userId,
      status: updated.status,
      canAct: false,
      approverMembershipIds: approvers.map((a) => a.id),
      monthEntries: updated.months.map((m) => ({
        monthIndex: m.monthIndex,
        fine: m.waivedFineAmount.toString(),
      })),
      reduceFromMaturity: updated.reduceFromMaturity,
      expiresAt: updated.expiresAt.toISOString(),
      actedByMembershipId: actor.id,
    });
    return updated;
  });
};
