/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */
import crypto from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  validateRazorpayWebhookOrThrow,
  verifyRazorpaySignature,
  processRazorpayWebhook,
} from "@/services/razorpayWebhookService.js";
import { TEST_IDS, decimal } from "@/tests/helpers/fixtures.js";
import { prismaMock } from "@/tests/helpers/mock-prisma.js";
import { SubscriptionStatus } from "@/generated/prisma/client.js";

const {
  redisMock,
  createTransitionLogMock,
  sendSubscriptionStateNotificationMock,
  sendSetupFeePaidNotificationMock,
} = vi.hoisted(() => ({
  redisMock: {
    set: vi.fn(),
    del: vi.fn(),
  },
  createTransitionLogMock: vi.fn(),
  sendSubscriptionStateNotificationMock: vi.fn(),
  sendSetupFeePaidNotificationMock: vi.fn(),
}));

vi.mock("@/config/redis.js", () => ({ default: redisMock }));
vi.mock("@/config/dotenv.js", () => ({
  default: {
    RAZORPAY_WEBHOOK_SECRET: "secret-current",
    RAZORPAY_WEBHOOK_OLD_SECRETS: "old-secret-1,old-secret-2",
  },
}));
vi.mock("@/config/logger.js", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("@/services/subscriptionLifecycleService.js", () => ({
  billingGraceDays: 30,
  billingTrialDays: 60,
  createSubscriptionTransitionLog: createTransitionLogMock,
}));
vi.mock("@/services/billingNotificationService.js", () => ({
  sendSubscriptionStateNotification: sendSubscriptionStateNotificationMock,
  sendSetupFeePaidNotification: sendSetupFeePaidNotificationMock,
}));

describe("razorpayWebhookService", () => {
  beforeEach(() => {
    redisMock.set.mockReset();
    redisMock.del.mockReset();
    createTransitionLogMock.mockReset();
    sendSubscriptionStateNotificationMock.mockReset();
    sendSetupFeePaidNotificationMock.mockReset();
  });

  it("accepts valid signatures from configured secret set", () => {
    const payload = Buffer.from(JSON.stringify({ event: "subscription.activated" }));
    const sig = crypto.createHmac("sha256", "secret-current").update(payload).digest("hex");

    expect(verifyRazorpaySignature(payload, sig)).toBe(true);
  });

  it("throws when signature header is missing", () => {
    const payload = Buffer.from("{}");
    expect(() => validateRazorpayWebhookOrThrow(payload)).toThrowError(
      "Missing Razorpay signature header",
    );
  });

  it("returns duplicate when idempotency lock is not acquired", async () => {
    redisMock.set.mockResolvedValueOnce(null);
    const payload = Buffer.from(JSON.stringify({ event: "subscription.activated" }));

    const result = await processRazorpayWebhook({
      rawBody: payload,
      signature: "irrelevant-in-tests",
      eventId: "evt_1",
    });

    expect(result).toEqual({ duplicate: true });
  });

  it("processes subscription.authenticated into active state transition", async () => {
    redisMock.set.mockResolvedValueOnce("OK");
    const payload = Buffer.from(
      JSON.stringify({
        event: "subscription.authenticated",
        payload: {
          subscription: {
            entity: { id: TEST_IDS.razorpaySubId },
          },
        },
      }),
    );
    prismaMock.$transaction.mockImplementationOnce(async (callback: any) => {
      const tx = {
        subscription: {
          findUnique: vi.fn().mockResolvedValue({
            id: TEST_IDS.subscriptionId,
            societyId: TEST_IDS.societyId,
            status: SubscriptionStatus.PENDING_ACTIVATION,
            retryCount: 0,
          }),
          update: vi.fn(),
        },
        societyPlanSettings: {
          findUnique: vi
            .fn()
            .mockResolvedValue({ trialEndDate: new Date("2026-12-01T00:00:00.000Z") }),
        },
        society: {
          update: vi.fn(),
          findUnique: vi.fn().mockResolvedValue({ name: "Test Society" }),
        },
        subscriptionTransaction: {
          upsert: vi.fn(),
          create: vi.fn(),
        },
      };
      await callback(tx);
      return null;
    });

    const result = await processRazorpayWebhook({
      rawBody: payload,
      signature: "ignored",
      eventId: "evt_2",
    });

    expect(result).toEqual({ duplicate: false });
    expect(createTransitionLogMock).toHaveBeenCalledOnce();
    expect(sendSubscriptionStateNotificationMock).toHaveBeenCalled();
  });

  it("creates failed transaction and grace state on payment.failed", async () => {
    redisMock.set.mockResolvedValueOnce("OK");
    const payload = Buffer.from(
      JSON.stringify({
        event: "payment.failed",
        payload: {
          payment: {
            entity: {
              id: TEST_IDS.razorpayPaymentId,
              amount: 25000,
              method: "upi",
              subscription_id: TEST_IDS.razorpaySubId,
            },
          },
        },
      }),
    );
    const txCreate = vi.fn();
    const txUpdate = vi.fn();
    prismaMock.$transaction.mockImplementationOnce(async (callback: any) => {
      const tx = {
        subscription: {
          findUnique: vi.fn().mockResolvedValue({
            id: TEST_IDS.subscriptionId,
            societyId: TEST_IDS.societyId,
            status: SubscriptionStatus.ACTIVE,
            retryCount: 0,
          }),
          update: txUpdate,
        },
        societyPlanSettings: { findUnique: vi.fn() },
        society: { update: vi.fn(), findUnique: vi.fn().mockResolvedValue({ name: "S1" }) },
        subscriptionTransaction: {
          create: txCreate,
          upsert: vi.fn(),
        },
      };
      await callback(tx);
      return null;
    });

    await processRazorpayWebhook({
      rawBody: payload,
      signature: "ignored",
      eventId: "evt_3",
    });

    expect(txUpdate).toHaveBeenCalledOnce();
    expect(txCreate).toHaveBeenCalledOnce();
    expect(txCreate.mock.calls[0]?.[0]?.data.amount).toEqual(decimal(250));
  });

  it("releases idempotency key on processing error", async () => {
    redisMock.set.mockResolvedValueOnce("OK");
    prismaMock.$transaction.mockRejectedValueOnce(new Error("transaction failure"));
    const payload = Buffer.from(
      JSON.stringify({
        event: "subscription.activated",
        payload: {
          subscription: {
            entity: { id: TEST_IDS.razorpaySubId },
          },
        },
      }),
    );

    await expect(
      processRazorpayWebhook({
        rawBody: payload,
        signature: "ignored",
        eventId: "evt_4",
      }),
    ).rejects.toThrow("transaction failure");

    expect(redisMock.del).toHaveBeenCalledOnce();
  });

  it("throws on invalid webhook payload", async () => {
    await expect(
      processRazorpayWebhook({
        rawBody: Buffer.from("{not-json"),
        signature: "ignored",
      }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("handles charge success and setup fee paid flow", async () => {
    redisMock.set.mockResolvedValueOnce("OK");
    const payload = Buffer.from(
      JSON.stringify({
        event: "payment.captured",
        payload: {
          payment: {
            entity: {
              id: TEST_IDS.razorpayPaymentId,
              amount: 50000,
              method: "upi",
              subscription_id: TEST_IDS.razorpaySubId,
            },
          },
        },
      }),
    );

    prismaMock.$transaction.mockImplementationOnce(async (callback: any) => {
      const tx = {
        subscription: {
          findUnique: vi.fn().mockResolvedValue({
            id: TEST_IDS.subscriptionId,
            societyId: TEST_IDS.societyId,
            status: SubscriptionStatus.PAYMENT_FAILED,
            retryCount: 1,
            oneTimeAddonApplied: true,
          }),
          update: vi.fn(),
        },
        societyPlanSettings: {
          findUnique: vi.fn().mockResolvedValue({
            setupFeeEnabled: true,
            setupFeePaid: false,
            customOneTimeFeeWaived: false,
            developerOverrideEnabled: false,
          }),
          update: vi.fn(),
        },
        society: {
          update: vi.fn(),
          findUnique: vi.fn().mockResolvedValue({ name: "Test Society" }),
        },
        subscriptionTransaction: {
          upsert: vi.fn(),
          create: vi.fn(),
        },
      };
      await callback(tx);
      return null;
    });

    await processRazorpayWebhook({
      rawBody: payload,
      signature: "ignored",
      eventId: "evt_5",
    });

    expect(sendSetupFeePaidNotificationMock).toHaveBeenCalled();
    expect(sendSubscriptionStateNotificationMock).toHaveBeenCalled();
  });
});
