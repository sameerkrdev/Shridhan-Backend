import createHttpError from "http-errors";
import {
  Prisma,
  MandateStatus,
  SubscriptionStatus,
  SubscriptionTransactionStatus,
} from "@/generated/prisma/client.js";
import prisma from "@/config/prisma.js";
import env from "@/config/dotenv.js";
import razorpayClient from "@/config/razorpay.js";
import logger from "@/config/logger.js";

const TRIAL_PERIOD_DAYS = 60;
const SUBSCRIPTION_BILLING_PERIOD_DAYS = 30;
const GRACE_PERIOD_DAYS = 30;
const BILLING_PROVIDER = "razorpay";
const DEFAULT_SETUP_FEE_AMOUNT = new Prisma.Decimal(50000);

interface TrialPersistenceClient {
  societyPlanSettings: {
    upsert: typeof prisma.societyPlanSettings.upsert;
  };
}

interface TransitionClient {
  subscriptionStateTransition: {
    create: typeof prisma.subscriptionStateTransition.create;
  };
}

const addDays = (value: Date, days: number) => {
  const output = new Date(value);
  output.setDate(output.getDate() + days);
  return output;
};

const toEpochSeconds = (value: Date) => Math.floor(value.getTime() / 1000);
const toPaise = (amount: Prisma.Decimal) => Number(amount.mul(100).toFixed(0));
const RAZORPAY_API_TIMEOUT_MS = 20_000;

const withTimeout = async <T>(promise: Promise<T>, timeoutMs: number, timeoutMessage: string) => {
  let timeoutId: NodeJS.Timeout | null = null;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(createHttpError(504, timeoutMessage));
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
};

const resolveEffectiveSetupFeeAmount = (settings: {
  customOneTimeFeeEnabled: boolean;
  customOneTimeFeeAmount: Prisma.Decimal | null;
  setupFeeAmount: Prisma.Decimal;
}) => {
  if (settings.customOneTimeFeeEnabled && settings.customOneTimeFeeAmount) {
    return settings.customOneTimeFeeAmount;
  }
  return settings.setupFeeAmount ?? DEFAULT_SETUP_FEE_AMOUNT;
};

export const initializeSocietyTrial = async (
  tx: TrialPersistenceClient,
  societyId: string,
  startedAt: Date = new Date(),
) => {
  const trialEndDate = addDays(startedAt, TRIAL_PERIOD_DAYS);

  return tx.societyPlanSettings.upsert({
    where: { societyId },
    update: {
      trialStartDate: startedAt,
      trialEndDate,
    },
    create: {
      societyId,
      trialStartDate: startedAt,
      trialEndDate,
      setupFeeAmount: DEFAULT_SETUP_FEE_AMOUNT,
    },
  });
};

export const createSubscriptionTransitionLog = async (
  tx: TransitionClient,
  args: {
    subscriptionId: string;
    fromStatus: SubscriptionStatus;
    toStatus: SubscriptionStatus;
    reason: string;
  },
) => {
  return tx.subscriptionStateTransition.create({
    data: {
      subscriptionId: args.subscriptionId,
      fromStatus: args.fromStatus,
      toStatus: args.toStatus,
      reason: args.reason,
    },
  });
};

type BillingAccessState =
  | "DEVELOPER_OVERRIDE"
  | "SUBSCRIPTION_WAIVED"
  | "TRIAL_ACTIVE"
  | "SUBSCRIPTION_ACTIVE"
  | "GRACE_ACTIVE"
  | "TRIAL_EXPIRED"
  | "GRACE_EXPIRED"
  | "SUBSCRIPTION_PAUSED"
  | "SUBSCRIPTION_CANCELLED"
  | "SUBSCRIPTION_INACTIVE"
  | "SUBSCRIPTION_PAYMENT_FAILED"
  | "SUBSCRIPTION_PENDING_ACTIVATION"
  | "SUBSCRIPTION_REQUIRED";

export interface BillingAccessEvaluation {
  isAllowed: boolean;
  state: BillingAccessState;
}

export const evaluateSocietyBillingAccess = async (
  societyId: string,
): Promise<BillingAccessEvaluation> => {
  const now = new Date();
  const settings = await prisma.societyPlanSettings.findUnique({
    where: { societyId },
  });

  if (settings?.developerOverrideEnabled) {
    return { isAllowed: true, state: "DEVELOPER_OVERRIDE" };
  }

  if (settings?.trialEndDate && settings.trialEndDate.getTime() >= now.getTime()) {
    return { isAllowed: true, state: "TRIAL_ACTIVE" };
  }

  if (settings?.customSubscriptionWaived) {
    return { isAllowed: true, state: "SUBSCRIPTION_WAIVED" };
  }

  const subscription = await prisma.subscription.findFirst({
    where: { societyId },
    orderBy: { updatedAt: "desc" },
  });

  if (!subscription) {
    return { isAllowed: false, state: "TRIAL_EXPIRED" };
  }

  if (subscription.isInGrace && subscription.graceEndDate) {
    if (subscription.graceEndDate.getTime() >= now.getTime()) {
      return { isAllowed: true, state: "GRACE_ACTIVE" };
    }

    await prisma.$transaction(async (tx) => {
      const currentSubscription = await tx.subscription.findUnique({
        where: { id: subscription.id },
      });

      if (!currentSubscription) {
        return;
      }

      if (
        currentSubscription.isInGrace &&
        currentSubscription.graceEndDate &&
        currentSubscription.graceEndDate.getTime() < now.getTime()
      ) {
        await tx.subscription.update({
          where: { id: subscription.id },
          data: {
            isInGrace: false,
            graceEndDate: null,
            status: SubscriptionStatus.PAUSED,
            isActive: false,
          },
        });

        await createSubscriptionTransitionLog(tx, {
          subscriptionId: subscription.id,
          fromStatus: currentSubscription.status,
          toStatus: SubscriptionStatus.PAUSED,
          reason: "GRACE_PERIOD_EXPIRED",
        });
      }
    });

    return { isAllowed: false, state: "GRACE_EXPIRED" };
  }

  if (subscription.status === SubscriptionStatus.ACTIVE && subscription.isActive) {
    return { isAllowed: true, state: "SUBSCRIPTION_ACTIVE" };
  }

  if (subscription.status === SubscriptionStatus.PAUSED) {
    return { isAllowed: false, state: "SUBSCRIPTION_PAUSED" };
  }

  if (subscription.status === SubscriptionStatus.CANCELLED) {
    return { isAllowed: false, state: "SUBSCRIPTION_CANCELLED" };
  }

  if (subscription.status === SubscriptionStatus.PAYMENT_FAILED) {
    return { isAllowed: false, state: "SUBSCRIPTION_PAYMENT_FAILED" };
  }

  if (subscription.status === SubscriptionStatus.PENDING_ACTIVATION) {
    return { isAllowed: false, state: "SUBSCRIPTION_PENDING_ACTIVATION" };
  }

  return { isAllowed: false, state: "SUBSCRIPTION_REQUIRED" };
};

export const setupSubscriptionMandate = async (userId: string, societyId: string) => {
  logger.info({
    message: "Setup subscription mandate initiated",
    userId,
    societyId,
  });

  const membership = await prisma.membership.findFirst({
    where: { userId, societyId, deletedAt: null },
    include: { society: true, user: true },
  });

  if (!membership || !membership.society) {
    throw createHttpError(403, "You are not a member of this society");
  }

  const { user: memberUser } = membership;

  const planSettings = await prisma.societyPlanSettings.upsert({
    where: { societyId },
    update: {},
    create: { societyId },
  });

  if (!env.RAZORPAY_PLAN_ID) {
    throw createHttpError(
      400,
      "Razorpay planId is not configured in environment. Contact developer support.",
    );
  }
  const razorpayPlanId = String(env.RAZORPAY_PLAN_ID);

  const existingPending = await prisma.subscription.findFirst({
    where: {
      societyId,
      status: SubscriptionStatus.PENDING_ACTIVATION,
    },
    orderBy: { updatedAt: "desc" },
  });

  if (existingPending) {
    let razorpaySubscriptionShortUrl: string | null = null;
    try {
      const existingSubscription = await withTimeout(
        razorpayClient.subscriptions.fetch(existingPending.razorpaySubId),
        RAZORPAY_API_TIMEOUT_MS,
        "Razorpay subscription fetch timed out",
      );
      const shortUrl = (existingSubscription as { short_url?: string | null }).short_url;
      razorpaySubscriptionShortUrl = shortUrl ?? null;
    } catch (error) {
      logger.warn({
        message: "Failed to fetch Razorpay short url for existing pending subscription",
        societyId,
        subscriptionId: existingPending.id,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }

    return {
      keyId: env.RAZORPAY_KEY_ID,
      razorpaySubscriptionId: existingPending.razorpaySubId,
      razorpayCustomerId: existingPending.customerId,
      status: existingPending.status,
      razorpaySubscriptionShortUrl,
    };
  }

  let customerId = `pending_${membership.id}`;
  try {
    logger.info({
      message: "Creating Razorpay customer for subscription mandate",
      societyId,
      membershipId: membership.id,
    });
    const customer = await withTimeout(
      razorpayClient.customers.create({
        name: memberUser.name,
        contact: memberUser.phone,
        ...(memberUser.email ? { email: memberUser.email } : {}),
        notes: {
          societyId,
          membershipId: membership.id,
        },
      }),
      RAZORPAY_API_TIMEOUT_MS,
      "Razorpay customer creation timed out",
    );
    customerId = (customer as { id: string }).id;
  } catch (error) {
    logger.warn({
      message: "Razorpay customer creation failed; continuing with subscription setup",
      societyId,
      membershipId: membership.id,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }

  const now = new Date();
  const startAt =
    planSettings.trialEndDate && planSettings.trialEndDate.getTime() > now.getTime()
      ? planSettings.trialEndDate
      : now;
  const oneTimeAddonEnabled =
    planSettings.setupFeeEnabled &&
    !planSettings.setupFeePaid &&
    !planSettings.customOneTimeFeeWaived &&
    !planSettings.developerOverrideEnabled;
  const oneTimeAddonAmount = resolveEffectiveSetupFeeAmount(planSettings);
  logger.info({
    message: "Creating Razorpay subscription for mandate",
    societyId,
    customerId,
  });
  const subscriptionRequest = await withTimeout(
    razorpayClient.subscriptions.create({
      plan_id: razorpayPlanId,
      customer_notify: 1,
      quantity: 1,
      total_count: 120,
      start_at: toEpochSeconds(startAt),
      ...(oneTimeAddonEnabled
        ? {
            addons: [
              {
                item: {
                  name: "Shridhan one-time onboarding fee",
                  amount: toPaise(oneTimeAddonAmount),
                  currency: "INR",
                },
              },
            ],
          }
        : {}),
      notes: {
        societyId,
        membershipId: membership.id,
        oneTimeAddonApplied: oneTimeAddonEnabled ? "true" : "false",
        oneTimeAddonAmount: oneTimeAddonEnabled ? oneTimeAddonAmount.toFixed(2) : "0.00",
      },
    }),
    RAZORPAY_API_TIMEOUT_MS,
    "Razorpay subscription creation timed out",
  );
  const razorpaySubscriptionId = (subscriptionRequest as { id: string }).id;
  const resolvedCustomerId = (subscriptionRequest as { customer_id?: string | null }).customer_id;
  const razorpaySubscriptionShortUrl =
    (subscriptionRequest as { short_url?: string | null }).short_url ?? null;
  if (resolvedCustomerId) {
    customerId = resolvedCustomerId;
  }

  const nextBillingAt = startAt;

  const savedSubscription = await prisma.subscription.create({
    data: {
      planId: razorpayPlanId,
      customerId,
      razorpaySubId: razorpaySubscriptionId,
      planName: "Society Subscription",
      planAmount:
        (planSettings.customSubscriptionEnabled ? planSettings.customSubscriptionAmount : null) ??
        new Prisma.Decimal(0),
      billingPeriod: SUBSCRIPTION_BILLING_PERIOD_DAYS,
      currency: "INR",
      oneTimeAddonApplied: oneTimeAddonEnabled,
      oneTimeAddonAmount: oneTimeAddonEnabled ? oneTimeAddonAmount : null,
      status: SubscriptionStatus.PENDING_ACTIVATION,
      startDate: now,
      nextBillingAt,
      isActive: false,
      mandateStatus: MandateStatus.PENDING,
      societyId,
    },
  });

  await prisma.subscriptionStateTransition.create({
    data: {
      subscriptionId: savedSubscription.id,
      fromStatus: SubscriptionStatus.PENDING_ACTIVATION,
      toStatus: SubscriptionStatus.PENDING_ACTIVATION,
      reason: "MANDATE_SETUP_INITIATED",
    },
  });

  return {
    keyId: env.RAZORPAY_KEY_ID,
    razorpaySubscriptionId,
    razorpayCustomerId: customerId,
    status: savedSubscription.status,
    razorpaySubscriptionShortUrl,
  };
};

export const updateSocietyBillingPolicy = async (
  societyId: string,
  payload: {
    developerOverrideEnabled?: boolean;
    setupFeeEnabled?: boolean;
    setupFeeAmount?: number;
    customOneTimeFeeEnabled?: boolean;
    customOneTimeFeeAmount?: number;
    customOneTimeFeeWaived?: boolean;
    customSubscriptionEnabled?: boolean;
    customSubscriptionAmount?: number;
    customSubscriptionWaived?: boolean;
    setByDeveloperId: string;
    setReason: string;
  },
) => {
  const existing = await prisma.societyPlanSettings.findUnique({
    where: { societyId },
  });

  if (!existing) {
    throw createHttpError(404, "Society billing settings not found");
  }

  return prisma.societyPlanSettings.update({
    where: { societyId },
    data: {
      ...(payload.developerOverrideEnabled !== undefined && {
        developerOverrideEnabled: payload.developerOverrideEnabled,
      }),
      ...(payload.setupFeeEnabled !== undefined && { setupFeeEnabled: payload.setupFeeEnabled }),
      ...(payload.setupFeeAmount !== undefined && {
        setupFeeAmount: new Prisma.Decimal(payload.setupFeeAmount),
      }),
      ...(payload.customOneTimeFeeEnabled !== undefined && {
        customOneTimeFeeEnabled: payload.customOneTimeFeeEnabled,
      }),
      ...(payload.customOneTimeFeeAmount !== undefined && {
        customOneTimeFeeAmount: new Prisma.Decimal(payload.customOneTimeFeeAmount),
      }),
      ...(payload.customOneTimeFeeWaived !== undefined && {
        customOneTimeFeeWaived: payload.customOneTimeFeeWaived,
      }),
      ...(payload.customSubscriptionEnabled !== undefined && {
        customSubscriptionEnabled: payload.customSubscriptionEnabled,
      }),
      ...(payload.customSubscriptionAmount !== undefined && {
        customSubscriptionAmount: new Prisma.Decimal(payload.customSubscriptionAmount),
      }),
      ...(payload.customSubscriptionWaived !== undefined && {
        customSubscriptionWaived: payload.customSubscriptionWaived,
      }),
      billingPolicySetByDeveloperId: payload.setByDeveloperId,
      billingPolicySetReason: payload.setReason,
      billingPolicyUpdatedAt: new Date(),
    },
  });
};

export const cancelSubscriptionAndRefund = async (
  userId: string,
  societyId: string,
  refundLatestPayment = true,
) => {
  const membership = await prisma.membership.findFirst({
    where: { userId, societyId, deletedAt: null },
    select: { id: true },
  });

  if (!membership) {
    throw createHttpError(403, "You are not a member of this society");
  }

  const subscription = await prisma.subscription.findFirst({
    where: {
      societyId,
      status: { not: SubscriptionStatus.CANCELLED },
    },
    orderBy: { updatedAt: "desc" },
  });

  if (!subscription) {
    throw createHttpError(404, "No active or pending subscription found");
  }

  const cancelledAt = new Date();
  await withTimeout(
    razorpayClient.subscriptions.cancel(subscription.razorpaySubId, 0),
    RAZORPAY_API_TIMEOUT_MS,
    "Razorpay subscription cancellation timed out",
  );

  let refunded = false;
  let refundId: string | null = null;
  let refundedPaymentId: string | null = null;

  if (refundLatestPayment) {
    const latestPaidTransaction = await prisma.subscriptionTransaction.findFirst({
      where: {
        subscriptionId: subscription.id,
        status: SubscriptionTransactionStatus.SUCCESS,
        razorpayPaymentId: { not: null },
        razorpayRefundId: null,
      },
      orderBy: { paymentDate: "desc" },
    });

    if (latestPaidTransaction?.razorpayPaymentId) {
      const refundResponse = (await withTimeout(
        razorpayClient.payments.refund(latestPaidTransaction.razorpayPaymentId, {
          notes: {
            societyId,
            subscriptionId: subscription.id,
            reason: "MANUAL_SUBSCRIPTION_CANCELLATION",
          },
        }),
        RAZORPAY_API_TIMEOUT_MS,
        "Razorpay payment refund timed out",
      )) as { id: string };

      refundId = refundResponse.id;
      refundedPaymentId = latestPaidTransaction.razorpayPaymentId;
      refunded = true;

      await prisma.subscriptionTransaction.update({
        where: { id: latestPaidTransaction.id },
        data: {
          status: "REFUNDED",
          razorpayRefundId: refundId,
          refundDate: cancelledAt,
        },
      });
    }
  }

  await prisma.$transaction(async (tx) => {
    const current = await tx.subscription.findUnique({ where: { id: subscription.id } });
    if (!current || current.status === SubscriptionStatus.CANCELLED) {
      return;
    }

    await tx.subscription.update({
      where: { id: subscription.id },
      data: {
        status: SubscriptionStatus.CANCELLED,
        isActive: false,
        mandateStatus: MandateStatus.FAILED,
        mandateUpdatedAt: cancelledAt,
        isInGrace: false,
        graceEndDate: null,
      },
    });

    await createSubscriptionTransitionLog(tx, {
      subscriptionId: subscription.id,
      fromStatus: current.status,
      toStatus: SubscriptionStatus.CANCELLED,
      reason: "MANUAL_CANCELLATION_AND_REFUND",
    });
  });

  return {
    cancelled: true,
    refunded,
    refundId,
    refundedPaymentId,
  };
};

export const billingProvider = BILLING_PROVIDER;
export const billingGraceDays = GRACE_PERIOD_DAYS;
export const billingTrialDays = TRIAL_PERIOD_DAYS;
