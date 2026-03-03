import createHttpError from "http-errors";
import { Prisma, MandateStatus, SubscriptionStatus } from "@/generated/prisma/client.js";
import prisma from "@/config/prisma.js";
import env from "@/config/dotenv.js";
import razorpayClient from "@/config/razorpay.js";

const BILLING_PERIOD_DAYS = 30;
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
  const trialEndDate = addDays(startedAt, BILLING_PERIOD_DAYS);

  return tx.societyPlanSettings.upsert({
    where: { societyId },
    update: {
      isTrialUsed: true,
      trialEndDate,
      setupFeeDueAt: trialEndDate,
    },
    create: {
      societyId,
      isTrialUsed: true,
      trialEndDate,
      setupFeeDueAt: trialEndDate,
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
  | "SETUP_FEE_PENDING"
  | "SUBSCRIPTION_ACTIVE"
  | "GRACE_ACTIVE"
  | "TRIAL_EXPIRED"
  | "GRACE_EXPIRED"
  | "SUBSCRIPTION_PAUSED"
  | "SUBSCRIPTION_CANCELLED"
  | "SUBSCRIPTION_INACTIVE"
  | "SUBSCRIPTION_PAYMENT_FAILED"
  | "SUBSCRIPTION_EXPIRED"
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

  if (
    settings &&
    settings.setupFeeEnabled &&
    !settings.customOneTimeFeeWaived &&
    !settings.setupFeePaid
  ) {
    return { isAllowed: false, state: "SETUP_FEE_PENDING" };
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

  if (subscription.status === SubscriptionStatus.EXPIRED) {
    return { isAllowed: false, state: "SUBSCRIPTION_EXPIRED" };
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
  const membership = await prisma.membership.findFirst({
    where: { userId, societyId, deletedAt: null },
    include: { society: true, user: true },
  });

  if (!membership || !membership.society) {
    throw createHttpError(403, "You are not a member of this society");
  }

  const { user: memberUser } = membership;

  const planSettings = await prisma.societyPlanSettings.findUnique({
    where: { societyId },
  });

  if (!planSettings?.planId) {
    throw createHttpError(
      400,
      "Razorpay planId is not configured for this society. Contact developer support.",
    );
  }

  if (
    planSettings.setupFeeEnabled &&
    !planSettings.customOneTimeFeeWaived &&
    !planSettings.setupFeePaid
  ) {
    throw createHttpError(403, "Setup fee payment is required before subscription setup");
  }

  const existingPending = await prisma.subscription.findFirst({
    where: {
      societyId,
      status: SubscriptionStatus.PENDING_ACTIVATION,
    },
    orderBy: { updatedAt: "desc" },
  });

  if (existingPending) {
    return {
      keyId: env.RAZORPAY_KEY_ID,
      razorpaySubscriptionId: existingPending.razorpaySubId,
      razorpayCustomerId: existingPending.customerId,
      status: existingPending.status,
    };
  }

  const customer = await razorpayClient.customers.create({
    name: memberUser.name,
    contact: memberUser.phone,
    ...(memberUser.email ? { email: memberUser.email } : {}),
    notes: {
      societyId,
      membershipId: membership.id,
    },
  });
  const customerId = (customer as { id: string }).id;

  const startAt = planSettings.trialEndDate ?? addDays(new Date(), BILLING_PERIOD_DAYS);
  const subscriptionRequest = await razorpayClient.subscriptions.create({
    plan_id: planSettings.planId,
    customer_notify: 1,
    quantity: 1,
    total_count: 120,
    start_at: toEpochSeconds(startAt),
    notes: {
      societyId,
      membershipId: membership.id,
    },
  });
  const razorpaySubscriptionId = (subscriptionRequest as { id: string }).id;

  const now = new Date();
  const nextBillingAt = planSettings.trialEndDate ?? addDays(now, BILLING_PERIOD_DAYS);

  const savedSubscription = await prisma.subscription.create({
    data: {
      planId: planSettings.planId,
      customerId,
      razorpaySubId: razorpaySubscriptionId,
      planName: planSettings.planName ?? "Society Subscription",
      planAmount:
        (planSettings.customSubscriptionEnabled ? planSettings.customSubscriptionAmount : null) ??
        planSettings.planAmount ??
        new Prisma.Decimal(0),
      billingPeriod: BILLING_PERIOD_DAYS,
      currency: planSettings.currency ?? "INR",
      status: SubscriptionStatus.PENDING_ACTIVATION,
      startDate: now,
      nextBillingAt,
      isActive: false,
      mandateStatus: MandateStatus.PENDING,
      maxRetries: 3,
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
  };
};

export const createSetupFeePaymentLink = async (userId: string, societyId: string) => {
  const membership = await prisma.membership.findFirst({
    where: { userId, societyId, deletedAt: null },
    include: { society: true, user: true },
  });

  if (!membership || !membership.society) {
    throw createHttpError(403, "You are not a member of this society");
  }

  const { user: memberUser } = membership;

  const planSettings = await prisma.societyPlanSettings.findUnique({
    where: { societyId },
  });

  if (!planSettings) {
    throw createHttpError(404, "Society billing settings not found");
  }

  if (planSettings.customOneTimeFeeWaived || !planSettings.setupFeeEnabled) {
    return {
      setupFeeWaived: true,
      setupFeePaid: true,
      paymentLinkUrl: null,
      amount: "0.00",
      currency: "INR",
    };
  }

  if (planSettings.setupFeePaid) {
    return {
      setupFeeWaived: false,
      setupFeePaid: true,
      paymentLinkUrl: planSettings.setupFeePaymentLinkUrl,
      amount: resolveEffectiveSetupFeeAmount(planSettings).toFixed(2),
      currency: "INR",
    };
  }

  const effectiveAmount = resolveEffectiveSetupFeeAmount(planSettings);
  const amountInPaise = toPaise(effectiveAmount);

  const paymentLinkResponse = await razorpayClient.paymentLink.create({
    amount: amountInPaise,
    currency: "INR",
    accept_partial: false,
    description: `Shridhan setup fee for ${membership.society.name}`,
    customer: {
      name: memberUser.name,
      contact: memberUser.phone,
      ...(memberUser.email ? { email: memberUser.email } : {}),
    },
    notify: {
      sms: true,
      email: Boolean(memberUser.email),
    },
    notes: {
      billingType: "setup_fee",
      societyId,
      membershipId: membership.id,
    },
  });

  const paymentLinkId = (paymentLinkResponse as unknown as { id: string }).id;
  const paymentLinkUrl = (paymentLinkResponse as unknown as { short_url?: string }).short_url ?? "";

  await prisma.societyPlanSettings.update({
    where: { societyId },
    data: {
      setupFeeDueAt: planSettings.setupFeeDueAt ?? planSettings.trialEndDate,
      setupFeePaymentLinkId: paymentLinkId,
      ...(paymentLinkUrl ? { setupFeePaymentLinkUrl: paymentLinkUrl } : {}),
    },
  });

  return {
    setupFeeWaived: false,
    setupFeePaid: false,
    paymentLinkUrl,
    paymentLinkId,
    amount: effectiveAmount.toFixed(2),
    currency: "INR",
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
    customSubscriptionPlanId?: string;
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
      ...(payload.customSubscriptionPlanId !== undefined && {
        customSubscriptionPlanId: payload.customSubscriptionPlanId,
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

export const billingProvider = BILLING_PROVIDER;
export const billingGraceDays = GRACE_PERIOD_DAYS;
