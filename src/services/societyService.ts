import { SocietyStatus } from "@/generated/prisma/client.js";
import prisma from "@/config/prisma.js";
import logger from "@/config/logger.js";
import type { Prisma } from "@/generated/prisma/client.js";
import createHttpError from "http-errors";
import {
  cancelSubscriptionAndRefund,
  initializeSocietyTrial,
  setupSubscriptionMandate,
} from "@/services/subscriptionLifecycleService.js";
import { sendTrialStartedNotification } from "@/services/billingNotificationService.js";

type SocietyStatusKey = "CREATED" | "RAZORPAY_PENDING" | "ACTIVE";

const SYSTEM_ROLE_PERMISSIONS: Record<string, string[]> = {
  OWNER: [
    "membership.create",
    "membership.read",
    "membership.list",
    "membership.update_role",
    "membership.update_status",
    "membership.remove",
    "society.read",
    "society.update",
    "role.create",
    "role.read",
    "role.update_permissions",
    "role.delete",
    "user.update_self_only",
    "fixed_deposit.create",
    "fixed_deposit.read",
    "fixed_deposit.list",
    "fixed_deposit.add_transaction",
    "fixed_deposit.update_status",
    "fixed_deposit.remove",
    "fixed_deposit.remove_project_type",
    "mis.create",
    "mis.read",
    "mis.list",
    "mis.deposit",
    "mis.pay_interest",
    "mis.return_principal",
    "mis.update_status",
    "mis.remove",
    "mis.remove_project_type",
  ],
  ADMIN: [
    "membership.create",
    "membership.read",
    "membership.list",
    "membership.update_role",
    "membership.update_status",
    "membership.remove",
    "society.read",
    "society.update",
    "role.read",
    "user.update_self_only",
    "fixed_deposit.create",
    "fixed_deposit.read",
    "fixed_deposit.list",
    "fixed_deposit.add_transaction",
    "fixed_deposit.update_status",
    "fixed_deposit.remove",
    "fixed_deposit.remove_project_type",
    "mis.create",
    "mis.read",
    "mis.list",
    "mis.deposit",
    "mis.pay_interest",
    "mis.return_principal",
    "mis.update_status",
    "mis.remove",
    "mis.remove_project_type",
  ],
  MANAGER: [
    "membership.create",
    "membership.read",
    "membership.list",
    "membership.update_status",
    "society.read",
    "role.read",
    "user.update_self_only",
    "fixed_deposit.create",
    "fixed_deposit.read",
    "fixed_deposit.list",
    "fixed_deposit.add_transaction",
    "fixed_deposit.update_status",
    "fixed_deposit.remove",
    "fixed_deposit.remove_project_type",
    "mis.create",
    "mis.read",
    "mis.list",
    "mis.deposit",
    "mis.pay_interest",
    "mis.return_principal",
    "mis.update_status",
    "mis.remove",
    "mis.remove_project_type",
  ],
  MEMBER: [
    "membership.read",
    "society.read",
    "user.update_self_only",
    "fixed_deposit.read",
    "mis.read",
  ],
};

const statusRouteMap: Record<SocietyStatusKey, string> = {
  CREATED: "/",
  RAZORPAY_PENDING: "/",
  ACTIVE: "/",
};

export const createSociety = async (data: Prisma.SocietyCreateInput, creator: Prisma.UserModel) => {
  const existingSociety = await prisma.society.findFirst({
    where: { OR: [{ name: data.name }, { subDomainName: data.subDomainName }] },
  });

  if (existingSociety) {
    throw createHttpError(400, "Society already exists");
  }

  const payload = await prisma.$transaction(async (tx) => {
    const createdSociety = await tx.society.create({ data });

    const createdRoles = await Promise.all(
      Object.entries(SYSTEM_ROLE_PERMISSIONS).map(([name, permissions]) =>
        tx.societyRole.create({
          data: {
            societyId: createdSociety.id,
            name,
            isSystem: true,
            permissions,
          },
        }),
      ),
    );
    const ownerRole = createdRoles.find((role) => role.name === "OWNER");
    if (!ownerRole) {
      throw createHttpError(500, "Failed to initialize owner role");
    }

    const membership = await tx.membership.create({
      data: {
        userId: creator.id,
        societyId: createdSociety.id,
        roleId: ownerRole.id,
        status: "active",
      },
      include: {
        role: {
          select: { id: true, name: true, permissions: true },
        },
      },
    });

    await initializeSocietyTrial(tx, createdSociety.id, new Date());

    return { society: createdSociety, membership };
  });

  const society = await prisma.society.update({
    where: { id: payload.society.id },
    data: { status: SocietyStatus.ACTIVE },
  });

  const trialSettings = await prisma.societyPlanSettings.findUnique({
    where: { societyId: payload.society.id },
    select: { trialEndDate: true },
  });
  if (trialSettings?.trialEndDate) {
    void sendTrialStartedNotification(payload.society.id, society.name, trialSettings.trialEndDate);
  }

  logger.info({
    message: "Society created with in-house RBAC setup",
    societyId: payload.society.id,
    userId: creator.id,
  });

  return { society, membership: payload.membership };
};

export const getMemberSocieties = async (userId: string) => {
  const memberships = await prisma.membership.findMany({
    where: { userId, deletedAt: null },
    include: {
      society: {
        select: { id: true, name: true, subDomainName: true, status: true },
      },
      role: {
        select: { id: true, name: true, permissions: true },
      },
    },
  });

  return memberships.map((m) => ({
    membershipId: m.id,
    role: m.role.name,
    roleId: m.role.id,
    permissions: m.role.permissions,
    status: m.status,
    societyId: m.societyId,
    societyName: m.society.name,
    subDomainName: m.society.subDomainName,
    societyStatus: m.society.status as SocietyStatusKey,
  }));
};

export const resolveMemberSociety = async (userId: string, societyId: string) => {
  const membership = await prisma.membership.findFirst({
    where: { userId, societyId, deletedAt: null },
    include: {
      society: {
        select: { id: true, name: true, subDomainName: true, status: true },
      },
      role: {
        select: { id: true, name: true, permissions: true },
      },
    },
  });

  if (!membership) {
    throw createHttpError(403, "You are not a member of this society");
  }

  return {
    membershipId: membership.id,
    societyId: membership.society.id,
    societyName: membership.society.name,
    subDomainName: membership.society.subDomainName,
    societyStatus: membership.society.status,
    role: membership.role.name,
    roleId: membership.role.id,
    permissions: membership.role.permissions,
    status: membership.status,
    nextRoute: statusRouteMap[membership.society.status as SocietyStatusKey],
  };
};

export const setupSocietySubscriptionMandate = async (userId: string, societyId: string) => {
  const membership = await prisma.membership.findFirst({
    where: { userId, societyId, deletedAt: null },
    select: { id: true },
  });
  if (!membership) throw createHttpError(403, "You are not a member of this society");

  return setupSubscriptionMandate(userId, societyId);
};

export const cancelSocietySubscription = async (
  userId: string,
  societyId: string,
  refundLatestPayment = true,
) => {
  return cancelSubscriptionAndRefund(userId, societyId, refundLatestPayment);
};

export const getSocietyBillingOverview = async (userId: string, societyId: string) => {
  const membership = await prisma.membership.findFirst({
    where: { userId, societyId, deletedAt: null },
    select: { id: true },
  });

  if (!membership) {
    throw createHttpError(403, "You are not a member of this society");
  }

  const society = await prisma.society.findUnique({
    where: { id: societyId },
    select: { id: true, name: true },
  });

  if (!society) throw createHttpError(404, "Society not found");

  const settings = await prisma.societyPlanSettings.findUnique({ where: { societyId } });
  const latestSubscription = await prisma.subscription.findFirst({
    where: { societyId },
    orderBy: { updatedAt: "desc" },
  });
  const transactions = await prisma.subscriptionTransaction.findMany({
    where: {
      subscription: {
        societyId,
      },
    },
    orderBy: { createdAt: "desc" },
  });

  const now = new Date();
  const trialEndDate = settings?.trialEndDate ?? null;
  const trialDaysRemaining = trialEndDate
    ? Math.ceil((trialEndDate.getTime() - now.getTime()) / (24 * 60 * 60 * 1000))
    : null;

  return {
    society: { id: society.id, name: society.name },
    trial: {
      endAt: trialEndDate,
      daysRemaining: trialDaysRemaining,
      isActive: trialEndDate ? trialEndDate.getTime() > now.getTime() : false,
    },
    setupFee: {
      enabled: settings?.setupFeeEnabled ?? true,
      amount: settings?.setupFeeAmount?.toString() ?? "50000",
      paid: settings?.setupFeePaid ?? false,
      paidAt: settings?.setupFeePaidAt ?? null,
      dueAt: trialEndDate,
      paymentId: settings?.setupFeePaymentId ?? null,
      waived: settings?.customOneTimeFeeWaived ?? false,
    },
    override: { enabled: settings?.developerOverrideEnabled ?? false },
    subscription: latestSubscription
      ? {
          status: latestSubscription.status,
          mandateStatus: latestSubscription.mandateStatus,
          isInGrace: latestSubscription.isInGrace,
          graceEndDate: latestSubscription.graceEndDate,
          nextBillingAt: latestSubscription.nextBillingAt,
          previousBillingAt: latestSubscription.previousBillingAt,
          razorpaySubId: latestSubscription.razorpaySubId,
        }
      : null,
    transactions: transactions.map((t: Prisma.SubscriptionTransactionModel) => ({
      id: t.id,
      amount: t.amount.toString(),
      status: t.status,
      isPaid: t.isPaid,
      billingDate: t.billingDate,
      paymentDate: t.paymentDate,
      paymentMethod: t.paymentMethod,
      paymentCycleCount: t.paymentCycleCount,
      razorpayPaymentId: t.razorpayPaymentId,
    })),
  };
};
