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
  createSubscriptionTransitionLog,
} from "@/services/subscriptionLifecycleService.js";
import {
  sendSetupFeeFailedNotification,
  sendSetupFeePaidNotification,
  sendSubscriptionStateNotification,
} from "@/services/billingNotificationService.js";

interface RazorpayWebhookEvent {
  event: string;
  payload?: Record<string, unknown>;
}

const WEBHOOK_IDEMPOTENCY_TTL_SECONDS = 60 * 60 * 24 * 7;

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

const extractSetupFeeInfo = (eventPayload: RazorpayWebhookEvent) => {
  const billingTypeFromPaymentLink = getNested(eventPayload, [
    "payload",
    "payment_link",
    "entity",
    "notes",
    "billingType",
  ]);
  const billingTypeFromPayment = getNested(eventPayload, [
    "payload",
    "payment",
    "entity",
    "notes",
    "billingType",
  ]);
  const societyIdFromPaymentLink = getNested(eventPayload, [
    "payload",
    "payment_link",
    "entity",
    "notes",
    "societyId",
  ]);
  const societyIdFromPayment = getNested(eventPayload, [
    "payload",
    "payment",
    "entity",
    "notes",
    "societyId",
  ]);
  const paymentId = getNested(eventPayload, ["payload", "payment", "entity", "id"]);

  const billingType =
    typeof billingTypeFromPaymentLink === "string"
      ? billingTypeFromPaymentLink
      : typeof billingTypeFromPayment === "string"
        ? billingTypeFromPayment
        : undefined;
  const societyId =
    typeof societyIdFromPaymentLink === "string"
      ? societyIdFromPaymentLink
      : typeof societyIdFromPayment === "string"
        ? societyIdFromPayment
        : undefined;

  return {
    isSetupFeeEvent: billingType === "setup_fee",
    societyId,
    paymentId: typeof paymentId === "string" ? paymentId : undefined,
  };
};

export const verifyRazorpaySignature = (rawBody: Buffer, signature: string) => {
  const expectedSignature = crypto
    .createHmac("sha256", env.RAZORPAY_WEBHOOK_SECRET)
    .update(rawBody)
    .digest("hex");

  const expectedBuffer = Buffer.from(expectedSignature, "utf8");
  const receivedBuffer = Buffer.from(signature, "utf8");

  if (expectedBuffer.length !== receivedBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(expectedBuffer, receivedBuffer);
};

export const processRazorpayWebhook = async (args: {
  rawBody: Buffer;
  signature: string;
  eventId: string;
}) => {
  const parsedEvent = JSON.parse(args.rawBody.toString("utf8")) as RazorpayWebhookEvent;
  const idempotencyKey = `billing:webhook:razorpay:${args.eventId}`;

  logger.info({
    message: "Razorpay webhook received",
    eventId: args.eventId,
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
    const setupFeeInfo = extractSetupFeeInfo(parsedEvent);
    if (
      setupFeeInfo.isSetupFeeEvent &&
      (parsedEvent.event === "payment_link.paid" || parsedEvent.event === "payment.captured")
    ) {
      if (!setupFeeInfo.societyId || !setupFeeInfo.paymentId) {
        logger.error({
          message: "Setup fee event missing society or payment id",
          eventId: args.eventId,
          eventType: parsedEvent.event,
        });
        return { duplicate: false };
      }

      await prisma.societyPlanSettings.update({
        where: { societyId: setupFeeInfo.societyId },
        data: {
          setupFeePaid: true,
          setupFeePaidAt: new Date(),
          setupFeePaymentId: setupFeeInfo.paymentId,
        },
      });
      const society = await prisma.society.findUnique({
        where: { id: setupFeeInfo.societyId },
        select: { name: true },
      });
      if (society) {
        void sendSetupFeePaidNotification(
          setupFeeInfo.societyId,
          society.name,
          setupFeeInfo.paymentId,
        );
      }

      logger.info({
        message: "Setup fee marked as paid",
        eventId: args.eventId,
        societyId: setupFeeInfo.societyId,
        paymentId: setupFeeInfo.paymentId,
      });
      return { duplicate: false };
    }

    if (
      setupFeeInfo.isSetupFeeEvent &&
      (parsedEvent.event === "payment_link.cancelled" || parsedEvent.event === "payment.failed")
    ) {
      logger.info({
        message: "Setup fee payment failed/cancelled",
        eventId: args.eventId,
        societyId: setupFeeInfo.societyId,
      });
      if (setupFeeInfo.societyId) {
        const society = await prisma.society.findUnique({
          where: { id: setupFeeInfo.societyId },
          select: { name: true },
        });
        if (society) {
          void sendSetupFeeFailedNotification(setupFeeInfo.societyId, society.name);
        }
      }
      return { duplicate: false };
    }

    const razorpaySubscriptionId = extractSubscriptionId(parsedEvent);
    if (!razorpaySubscriptionId) {
      logger.error({
        message: "Razorpay webhook missing subscription id",
        eventId: args.eventId,
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

      if (parsedEvent.event === "subscription.activated") {
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

        await tx.societyPlanSettings.updateMany({
          where: { societyId: subscription.societyId },
          data: { graceUntil: null },
        });

        await createSubscriptionTransitionLog(tx, {
          subscriptionId: subscription.id,
          fromStatus: subscription.status,
          toStatus: SubscriptionStatus.ACTIVE,
          reason: "WEBHOOK_SUBSCRIPTION_ACTIVATED",
        });
        const society = await tx.society.findUnique({
          where: { id: subscription.societyId },
          select: { name: true },
        });
        if (society) {
          void sendSubscriptionStateNotification(
            subscription.societyId,
            society.name,
            "Subscription Activated",
            "SUBSCRIPTION_ACTIVE",
          );
        }
        return;
      }

      if (
        parsedEvent.event === "subscription.charged" ||
        parsedEvent.event === "payment.captured"
      ) {
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

        await tx.societyPlanSettings.updateMany({
          where: { societyId: subscription.societyId },
          data: { graceUntil: null },
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

        await tx.societyPlanSettings.updateMany({
          where: { societyId: subscription.societyId },
          data: { graceUntil: graceEndDate },
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

      if (parsedEvent.event === "subscription.halted") {
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

        await tx.societyPlanSettings.updateMany({
          where: { societyId: subscription.societyId },
          data: { graceUntil: null },
        });

        await createSubscriptionTransitionLog(tx, {
          subscriptionId: subscription.id,
          fromStatus: subscription.status,
          toStatus: SubscriptionStatus.PAUSED,
          reason: "WEBHOOK_MANDATE_FAILED",
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

      if (parsedEvent.event === "subscription.cancelled") {
        await tx.subscription.update({
          where: { id: subscription.id },
          data: {
            status: SubscriptionStatus.CANCELLED,
            isActive: false,
            isInGrace: false,
            graceEndDate: null,
          },
        });

        await tx.societyPlanSettings.updateMany({
          where: { societyId: subscription.societyId },
          data: { graceUntil: null },
        });

        await createSubscriptionTransitionLog(tx, {
          subscriptionId: subscription.id,
          fromStatus: subscription.status,
          toStatus: SubscriptionStatus.CANCELLED,
          reason: "WEBHOOK_SUBSCRIPTION_CANCELLED",
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
