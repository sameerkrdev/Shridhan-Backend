import crypto from "node:crypto";
import createHttpError from "http-errors";
import {
  Prisma,
  SocietyStatus,
  SubscriptionStatus,
  MandateStatus,
  SubscriptionTransactionStatus,
  PaymentMethod,
} from "@/generated/prisma/client.js";
import prisma from "@/config/prisma.js";
import redisClient from "@/config/redis.js";
import env from "@/config/dotenv.js";
import logger from "@/config/logger.js";
import {
  billingGraceDays,
  billingTrialDays,
  createSubscriptionTransitionLog,
} from "@/services/subscriptionLifecycleService.js";
import {
  sendSetupFeePaidNotification,
  sendSubscriptionStateNotification,
} from "@/services/billingNotificationService.js";

interface RazorpayWebhookEvent {
  event: string;
  payload?: Record<string, unknown>;
  created_at?: number;
}

const WEBHOOK_IDEMPOTENCY_TTL_SECONDS = 60 * 60 * 24 * 7;

const webhookSecrets = [
  env.RAZORPAY_WEBHOOK_SECRET,
  ...env.RAZORPAY_WEBHOOK_OLD_SECRETS.split(",")
    .map((secret) => secret.trim())
    .filter((secret) => secret.length > 0),
];

const addDays = (value: Date, days: number) => {
  const output = new Date(value);
  output.setDate(output.getDate() + days);
  return output;
};

const toDecimalRupees = (amountInPaise?: number) => {
  if (!amountInPaise || Number.isNaN(amountInPaise)) {
    return new Prisma.Decimal(0);
  }
  return new Prisma.Decimal(amountInPaise).div(100);
};

const getNested = (value: unknown, path: string[]) => {
  let current: unknown = value;
  for (const segment of path) {
    if (!current || typeof current !== "object" || !(segment in current)) {
      return undefined;
    }
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
};

const extractSubscriptionId = (eventPayload: RazorpayWebhookEvent) => {
  const directSubscriptionId = getNested(eventPayload, ["payload", "subscription", "entity", "id"]);
  if (typeof directSubscriptionId === "string" && directSubscriptionId.length > 0) {
    return directSubscriptionId;
  }

  const invoiceSubscriptionId = getNested(eventPayload, [
    "payload",
    "invoice",
    "entity",
    "subscription_id",
  ]);
  if (typeof invoiceSubscriptionId === "string" && invoiceSubscriptionId.length > 0) {
    return invoiceSubscriptionId;
  }

  const paymentSubscriptionId = getNested(eventPayload, [
    "payload",
    "payment",
    "entity",
    "subscription_id",
  ]);
  if (typeof paymentSubscriptionId === "string" && paymentSubscriptionId.length > 0) {
    return paymentSubscriptionId;
  }

  const notesSubscriptionId = getNested(eventPayload, [
    "payload",
    "payment",
    "entity",
    "notes",
    "subscriptionId",
  ]);
  if (typeof notesSubscriptionId === "string" && notesSubscriptionId.length > 0) {
    return notesSubscriptionId;
  }

  return null;
};

const extractPaymentInfo = (eventPayload: RazorpayWebhookEvent) => {
  const paymentId = getNested(eventPayload, ["payload", "payment", "entity", "id"]);
  const amount = getNested(eventPayload, ["payload", "payment", "entity", "amount"]);
  const paymentMethod = getNested(eventPayload, ["payload", "payment", "entity", "method"]);

  return {
    paymentId: typeof paymentId === "string" ? paymentId : undefined,
    amountInPaise: typeof amount === "number" ? amount : undefined,
    method: typeof paymentMethod === "string" ? paymentMethod : undefined,
  };
};

const buildWebhookIdempotencyKey = (rawBody: Buffer, eventId?: string) => {
  if (eventId && eventId.trim().length > 0) {
    return `billing:webhook:razorpay:event:${eventId.trim()}`;
  }

  // Razorpay recommends idempotent processing; fallback to payload hash when event id is absent.
  const payloadHash = crypto.createHash("sha256").update(rawBody).digest("hex");
  return `billing:webhook:razorpay:payload:${payloadHash}`;
};

export const verifyRazorpaySignature = (rawBody: Buffer, signature: string) => {
  const normalizedSignature = signature.trim();
  const receivedBuffer = Buffer.from(normalizedSignature, "utf8");

  for (const webhookSecret of webhookSecrets) {
    const expectedSignature = crypto
      .createHmac("sha256", webhookSecret)
      .update(rawBody)
      .digest("hex");
    const expectedBuffer = Buffer.from(expectedSignature, "utf8");

    if (expectedBuffer.length !== receivedBuffer.length) {
      continue;
    }

    if (crypto.timingSafeEqual(expectedBuffer, receivedBuffer)) {
      return true;
    }
  }

  return false;
};

export const processRazorpayWebhook = async (args: {
  rawBody: Buffer;
  signature: string;
  eventId?: string;
}) => {
  let parsedEvent: RazorpayWebhookEvent;
  try {
    parsedEvent = JSON.parse(args.rawBody.toString("utf8")) as RazorpayWebhookEvent;
  } catch {
    throw createHttpError(400, "Invalid Razorpay webhook payload");
  }
  const idempotencyKey = buildWebhookIdempotencyKey(args.rawBody, args.eventId);

  logger.info({
    message: "Razorpay webhook received",
    eventId: args.eventId ?? null,
    eventType: parsedEvent.event,
  });

  const lock = await redisClient.set(
    idempotencyKey,
    "processed",
    "EX",
    WEBHOOK_IDEMPOTENCY_TTL_SECONDS,
    "NX",
  );
  if (!lock) {
    logger.info({
      message: "Razorpay webhook duplicate ignored",
      eventId: args.eventId,
    });
    return { duplicate: true };
  }

  try {
    if (
      parsedEvent.event === "payment.authorized" ||
      parsedEvent.event === "payment_link.expired" ||
      parsedEvent.event === "payment_link.paid" ||
      parsedEvent.event === "payment_link.partially_paid" ||
      parsedEvent.event === "payment_link.cancelled" ||
      parsedEvent.event === "order.paid"
    ) {
      logger.info({
        message: "Razorpay webhook event acknowledged with no state transition",
        eventId: args.eventId ?? null,
        eventType: parsedEvent.event,
      });
      return { duplicate: false };
    }

    const razorpaySubscriptionId = extractSubscriptionId(parsedEvent);
    if (!razorpaySubscriptionId) {
      logger.info({
        message: "Razorpay webhook has no subscription id; no subscription state transition",
        eventId: args.eventId ?? null,
        eventType: parsedEvent.event,
      });
      return { duplicate: false };
    }

    await prisma.$transaction(async (tx) => {
      const subscription = await tx.subscription.findUnique({
        where: { razorpaySubId: razorpaySubscriptionId },
      });

      if (!subscription) {
        logger.error({
          message: "Razorpay webhook subscription not found",
          eventId: args.eventId,
          razorpaySubscriptionId,
        });
        return;
      }

      const now = new Date();
      const paymentInfo = extractPaymentInfo(parsedEvent);

      if (
        parsedEvent.event === "subscription.authenticated" ||
        parsedEvent.event === "subscription.activated"
      ) {
        if (
          subscription.status === SubscriptionStatus.CANCELLED ||
          subscription.status === SubscriptionStatus.PAUSED
        ) {
          logger.warn({
            message: "Ignoring activation for non-resumable subscription state",
            eventId: args.eventId ?? null,
            subscriptionId: subscription.id,
            currentStatus: subscription.status,
          });
          return;
        }

        const settings = await tx.societyPlanSettings.findUnique({
          where: { societyId: subscription.societyId },
          select: { trialEndDate: true },
        });
        const trialEndDate = settings?.trialEndDate ?? addDays(now, billingTrialDays);

        await tx.subscription.update({
          where: { id: subscription.id },
          data: {
            status: SubscriptionStatus.ACTIVE,
            isActive: true,
            mandateStatus: MandateStatus.ACTIVE,
            mandateUpdatedAt: now,
            isInGrace: false,
            graceEndDate: null,
            nextBillingAt: trialEndDate,
          },
        });

        await tx.society.update({
          where: { id: subscription.societyId },
          data: { status: SocietyStatus.ACTIVE },
        });

        await createSubscriptionTransitionLog(tx, {
          subscriptionId: subscription.id,
          fromStatus: subscription.status,
          toStatus: SubscriptionStatus.ACTIVE,
          reason:
            parsedEvent.event === "subscription.authenticated"
              ? "WEBHOOK_SUBSCRIPTION_AUTHENTICATED"
              : "WEBHOOK_SUBSCRIPTION_ACTIVATED",
        });
        const society = await tx.society.findUnique({
          where: { id: subscription.societyId },
          select: { name: true },
        });
        if (society) {
          void sendSubscriptionStateNotification(
            subscription.societyId,
            society.name,
            parsedEvent.event === "subscription.authenticated"
              ? "Subscription Mandate Authenticated"
              : "Subscription Activated",
            "SUBSCRIPTION_ACTIVE",
          );
        }
        return;
      }

      if (parsedEvent.event === "subscription.resumed") {
        if (subscription.status === SubscriptionStatus.CANCELLED) {
          logger.warn({
            message: "Ignoring resume event for cancelled subscription",
            eventId: args.eventId ?? null,
            subscriptionId: subscription.id,
          });
          return;
        }

        await tx.subscription.update({
          where: { id: subscription.id },
          data: {
            status: SubscriptionStatus.ACTIVE,
            isActive: true,
            mandateStatus: MandateStatus.ACTIVE,
            mandateUpdatedAt: now,
            isInGrace: false,
            graceEndDate: null,
          },
        });

        await tx.society.update({
          where: { id: subscription.societyId },
          data: { status: SocietyStatus.ACTIVE },
        });

        await createSubscriptionTransitionLog(tx, {
          subscriptionId: subscription.id,
          fromStatus: subscription.status,
          toStatus: SubscriptionStatus.ACTIVE,
          reason: "WEBHOOK_SUBSCRIPTION_RESUMED",
        });
        const society = await tx.society.findUnique({
          where: { id: subscription.societyId },
          select: { name: true },
        });
        if (society) {
          void sendSubscriptionStateNotification(
            subscription.societyId,
            society.name,
            "Subscription Resumed",
            "SUBSCRIPTION_ACTIVE",
          );
        }
        return;
      }

      if (
        parsedEvent.event === "subscription.charged" ||
        parsedEvent.event === "payment.captured" ||
        parsedEvent.event === "invoice.paid"
      ) {
        if (subscription.status === SubscriptionStatus.CANCELLED) {
          logger.warn({
            message: "Ignoring charge success for cancelled subscription",
            eventId: args.eventId ?? null,
            subscriptionId: subscription.id,
          });
          return;
        }

        await tx.subscription.update({
          where: { id: subscription.id },
          data: {
            status: SubscriptionStatus.ACTIVE,
            isActive: true,
            isInGrace: false,
            graceEndDate: null,
            retryCount: 0,
            previousBillingAt: now,
            nextBillingAt: addDays(now, 30),
          },
        });

        if (paymentInfo.paymentId) {
          await tx.subscriptionTransaction.upsert({
            where: { razorpayPaymentId: paymentInfo.paymentId },
            update: {
              status: SubscriptionTransactionStatus.SUCCESS,
              isPaid: true,
              paymentDate: now,
            },
            create: {
              amount: toDecimalRupees(paymentInfo.amountInPaise ?? 0),
              status: SubscriptionTransactionStatus.SUCCESS,
              isPaid: true,
              razorpayPaymentId: paymentInfo.paymentId,
              billingDate: now,
              paymentDate: now,
              ...(paymentInfo.method === "upi" ? { paymentMethod: PaymentMethod.UPI } : {}),
              paymentCycleCount: subscription.retryCount + 1,
              subscriptionId: subscription.id,
            },
          });
        }

        const planSettings = await tx.societyPlanSettings.findUnique({
          where: { societyId: subscription.societyId },
          select: {
            setupFeeEnabled: true,
            setupFeePaid: true,
            customOneTimeFeeWaived: true,
            developerOverrideEnabled: true,
          },
        });

        const shouldMarkSetupFeePaid = Boolean(
          planSettings &&
          planSettings.setupFeeEnabled &&
          !planSettings.setupFeePaid &&
          !planSettings.customOneTimeFeeWaived &&
          !planSettings.developerOverrideEnabled &&
          subscription.oneTimeAddonApplied &&
          paymentInfo.paymentId,
        );

        if (shouldMarkSetupFeePaid) {
          await tx.societyPlanSettings.update({
            where: { societyId: subscription.societyId },
            data: {
              setupFeePaid: true,
              setupFeePaidAt: now,
              setupFeePaymentId: paymentInfo.paymentId!,
            },
          });

          const society = await tx.society.findUnique({
            where: { id: subscription.societyId },
            select: { name: true },
          });
          if (society) {
            void sendSetupFeePaidNotification(
              subscription.societyId,
              society.name,
              paymentInfo.paymentId!,
            );
          }

          logger.info({
            message: "Setup fee marked as paid from subscription charge",
            eventId: args.eventId ?? null,
            societyId: subscription.societyId,
            paymentId: paymentInfo.paymentId,
          });
        }

        await createSubscriptionTransitionLog(tx, {
          subscriptionId: subscription.id,
          fromStatus: subscription.status,
          toStatus: SubscriptionStatus.ACTIVE,
          reason: "WEBHOOK_RECURRING_CHARGE_SUCCESS",
        });
        const society = await tx.society.findUnique({
          where: { id: subscription.societyId },
          select: { name: true },
        });
        if (society) {
          void sendSubscriptionStateNotification(
            subscription.societyId,
            society.name,
            "Subscription Charge Successful",
            "SUBSCRIPTION_ACTIVE",
          );
        }
        return;
      }

      if (parsedEvent.event === "payment.failed" || parsedEvent.event === "subscription.pending") {
        if (
          subscription.status === SubscriptionStatus.CANCELLED ||
          subscription.status === SubscriptionStatus.PAUSED
        ) {
          logger.warn({
            message: "Ignoring late failure/pending event for terminal or paused subscription",
            eventId: args.eventId ?? null,
            subscriptionId: subscription.id,
            currentStatus: subscription.status,
            eventType: parsedEvent.event,
          });
          return;
        }

        const graceEndDate = addDays(now, billingGraceDays);

        await tx.subscription.update({
          where: { id: subscription.id },
          data: {
            status: SubscriptionStatus.PAYMENT_FAILED,
            isInGrace: true,
            graceEndDate,
            isActive: true,
            retryCount: subscription.retryCount + 1,
          },
        });

        await tx.subscriptionTransaction.create({
          data: {
            amount: toDecimalRupees(paymentInfo.amountInPaise ?? 0),
            status: SubscriptionTransactionStatus.FAILED,
            isPaid: false,
            ...(paymentInfo.paymentId ? { razorpayPaymentId: paymentInfo.paymentId } : {}),
            billingDate: now,
            ...(paymentInfo.method === "upi" ? { paymentMethod: PaymentMethod.UPI } : {}),
            paymentCycleCount: subscription.retryCount + 1,
            subscriptionId: subscription.id,
          },
        });

        await createSubscriptionTransitionLog(tx, {
          subscriptionId: subscription.id,
          fromStatus: subscription.status,
          toStatus: SubscriptionStatus.PAYMENT_FAILED,
          reason: "WEBHOOK_RECURRING_CHARGE_FAILED",
        });
        const society = await tx.society.findUnique({
          where: { id: subscription.societyId },
          select: { name: true },
        });
        if (society) {
          void sendSubscriptionStateNotification(
            subscription.societyId,
            society.name,
            "Recurring Payment Failed",
            "GRACE_ACTIVE",
          );
        }
        return;
      }

      if (
        parsedEvent.event === "subscription.halted" ||
        parsedEvent.event === "subscription.paused"
      ) {
        await tx.subscription.update({
          where: { id: subscription.id },
          data: {
            status: SubscriptionStatus.PAUSED,
            mandateStatus: MandateStatus.FAILED,
            mandateUpdatedAt: now,
            isActive: false,
            isInGrace: false,
            graceEndDate: null,
          },
        });

        await createSubscriptionTransitionLog(tx, {
          subscriptionId: subscription.id,
          fromStatus: subscription.status,
          toStatus: SubscriptionStatus.PAUSED,
          reason:
            parsedEvent.event === "subscription.paused"
              ? "WEBHOOK_SUBSCRIPTION_PAUSED"
              : "WEBHOOK_MANDATE_FAILED",
        });
        const society = await tx.society.findUnique({
          where: { id: subscription.societyId },
          select: { name: true },
        });
        if (society) {
          void sendSubscriptionStateNotification(
            subscription.societyId,
            society.name,
            "Subscription Paused",
            "SUBSCRIPTION_PAUSED",
          );
        }
        return;
      }

      if (
        parsedEvent.event === "subscription.cancelled" ||
        parsedEvent.event === "subscription.completed"
      ) {
        await tx.subscription.update({
          where: { id: subscription.id },
          data: {
            status: SubscriptionStatus.CANCELLED,
            isActive: false,
            isInGrace: false,
            graceEndDate: null,
          },
        });

        await createSubscriptionTransitionLog(tx, {
          subscriptionId: subscription.id,
          fromStatus: subscription.status,
          toStatus: SubscriptionStatus.CANCELLED,
          reason:
            parsedEvent.event === "subscription.completed"
              ? "WEBHOOK_SUBSCRIPTION_COMPLETED"
              : "WEBHOOK_SUBSCRIPTION_CANCELLED",
        });
        const society = await tx.society.findUnique({
          where: { id: subscription.societyId },
          select: { name: true },
        });
        if (society) {
          void sendSubscriptionStateNotification(
            subscription.societyId,
            society.name,
            "Subscription Cancelled",
            "SUBSCRIPTION_CANCELLED",
          );
        }
        return;
      }
    });

    logger.info({
      message: "Razorpay webhook processed",
      eventId: args.eventId,
      eventType: parsedEvent.event,
    });
    return { duplicate: false };
  } catch (error) {
    await redisClient.del(idempotencyKey);
    throw error;
  }
};

export const validateRazorpayWebhookOrThrow = (rawBody: Buffer, signature?: string) => {
  if (!signature) {
    throw createHttpError(400, "Missing Razorpay signature header");
  }
  if (!verifyRazorpaySignature(rawBody, signature)) {
    throw createHttpError(401, "Invalid Razorpay webhook signature");
  }
};
