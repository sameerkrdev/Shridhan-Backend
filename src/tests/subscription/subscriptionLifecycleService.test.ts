/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/unbound-method */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MandateStatus, Prisma, SubscriptionStatus } from "@/generated/prisma/client.js";
import { prismaMock } from "@/tests/helpers/mock-prisma.js";
import { TEST_IDS, makeMembership } from "@/tests/helpers/fixtures.js";
import {
  cancelSubscriptionAndRefund,
  evaluateSocietyBillingAccess,
  initializeSocietyTrial,
  setupSubscriptionMandate,
  updateSocietyBillingPolicy,
} from "@/services/subscriptionLifecycleService.js";

const { razorpayMock } = vi.hoisted(() => ({
  razorpayMock: {
    subscriptions: {
      fetch: vi.fn(),
      create: vi.fn(),
      cancel: vi.fn(),
    },
    customers: {
      create: vi.fn(),
    },
    payments: {
      refund: vi.fn(),
    },
  },
}));

vi.mock("@/config/razorpay.js", () => ({
  default: razorpayMock,
}));

vi.mock("@/config/dotenv.js", () => ({
  default: {
    RAZORPAY_PLAN_ID: "plan_test_123",
    RAZORPAY_KEY_ID: "key_test_123",
  },
}));

vi.mock("@/config/logger.js", () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe("subscriptionLifecycleService", () => {
  beforeEach(() => {
    razorpayMock.customers.create.mockReset();
    razorpayMock.subscriptions.create.mockReset();
    razorpayMock.subscriptions.fetch.mockReset();
    razorpayMock.subscriptions.cancel.mockReset();
    razorpayMock.payments.refund.mockReset();
  });

  it("initializes a society trial with trial window", async () => {
    const tx = { societyPlanSettings: { upsert: vi.fn() } };
    const startedAt = new Date("2026-01-01T00:00:00.000Z");

    await initializeSocietyTrial(tx as any, TEST_IDS.societyId, startedAt);

    expect(tx.societyPlanSettings.upsert).toHaveBeenCalledOnce();
    const payload = tx.societyPlanSettings.upsert.mock.calls[0]?.[0];
    expect(payload.where.societyId).toBe(TEST_IDS.societyId);
    expect(payload.create.trialStartDate).toEqual(startedAt);
    expect(payload.create.trialEndDate).toEqual(new Date("2026-03-02T00:00:00.000Z"));
  });

  it("returns trial expired when no subscription exists", async () => {
    prismaMock.societyPlanSettings.findUnique.mockResolvedValueOnce({
      trialEndDate: new Date("2025-01-01T00:00:00.000Z"),
      developerOverrideEnabled: false,
      customSubscriptionWaived: false,
    } as any);
    prismaMock.subscription.findFirst.mockResolvedValueOnce(null);

    const result = await evaluateSocietyBillingAccess(TEST_IDS.societyId);

    expect(result).toEqual({ isAllowed: false, state: "TRIAL_EXPIRED" });
  });

  it("marks grace as expired and blocks access when grace window passed", async () => {
    const expiredGrace = new Date(Date.now() - 86_400_000);
    prismaMock.societyPlanSettings.findUnique.mockResolvedValueOnce(null);
    prismaMock.subscription.findFirst.mockResolvedValueOnce({
      id: TEST_IDS.subscriptionId,
      status: SubscriptionStatus.PAYMENT_FAILED,
      isInGrace: true,
      graceEndDate: expiredGrace,
      isActive: true,
    } as any);

    prismaMock.$transaction.mockImplementationOnce(async (callback: any) => {
      const tx = {
        subscription: {
          findUnique: vi.fn().mockResolvedValue({
            id: TEST_IDS.subscriptionId,
            status: SubscriptionStatus.PAYMENT_FAILED,
            isInGrace: true,
            graceEndDate: expiredGrace,
          }),
          update: vi.fn(),
        },
        subscriptionStateTransition: {
          create: vi.fn(),
        },
      };
      await callback(tx);
      return null;
    });

    const result = await evaluateSocietyBillingAccess(TEST_IDS.societyId);
    expect(result).toEqual({ isAllowed: false, state: "GRACE_EXPIRED" });
  });

  it("reuses existing pending mandate instead of creating a new one", async () => {
    prismaMock.membership.findFirst.mockResolvedValueOnce({
      ...makeMembership(),
      society: { id: TEST_IDS.societyId, name: "Test Society" },
      user: { id: TEST_IDS.userId, name: "Test User", phone: "9876543210", email: "a@b.com" },
    } as any);
    prismaMock.societyPlanSettings.upsert.mockResolvedValueOnce({
      trialEndDate: null,
      setupFeeEnabled: true,
      setupFeePaid: false,
      customOneTimeFeeWaived: false,
      developerOverrideEnabled: false,
      customOneTimeFeeEnabled: false,
      customOneTimeFeeAmount: null,
      setupFeeAmount: new Prisma.Decimal(50000),
      customSubscriptionEnabled: false,
      customSubscriptionAmount: null,
    } as any);
    prismaMock.subscription.findFirst.mockResolvedValueOnce({
      id: TEST_IDS.subscriptionId,
      razorpaySubId: TEST_IDS.razorpaySubId,
      customerId: "cust_existing",
      status: SubscriptionStatus.PENDING_ACTIVATION,
    } as any);
    razorpayMock.subscriptions.fetch.mockResolvedValueOnce({
      id: TEST_IDS.razorpaySubId,
      short_url: "https://rzp.io/pending",
    });

    const result = await setupSubscriptionMandate(TEST_IDS.userId, TEST_IDS.societyId);

    expect(result.razorpaySubscriptionId).toBe(TEST_IDS.razorpaySubId);
    expect(result.razorpaySubscriptionShortUrl).toBe("https://rzp.io/pending");
    expect(razorpayMock.subscriptions.create).not.toHaveBeenCalled();
  });

  it("updates billing policy with decimal conversions", async () => {
    prismaMock.societyPlanSettings.findUnique.mockResolvedValueOnce({
      societyId: TEST_IDS.societyId,
    } as any);
    prismaMock.societyPlanSettings.update.mockResolvedValueOnce({
      societyId: TEST_IDS.societyId,
    } as any);

    await updateSocietyBillingPolicy(TEST_IDS.societyId, {
      setByDeveloperId: "dev_1",
      setReason: "policy test",
      setupFeeAmount: 4999,
      customSubscriptionAmount: 1999,
      customOneTimeFeeAmount: 2500,
    });

    expect(prismaMock.societyPlanSettings.update).toHaveBeenCalledOnce();
    const [call] = prismaMock.societyPlanSettings.update.mock.calls;
    expect(call).toBeDefined();
    const payload = call![0];
    expect(payload.data.setupFeeAmount).toBeInstanceOf(Prisma.Decimal);
    expect(payload.data.customSubscriptionAmount).toBeInstanceOf(Prisma.Decimal);
  });

  it("cancels subscription and marks status cancelled without refund", async () => {
    prismaMock.membership.findFirst.mockResolvedValueOnce({ id: TEST_IDS.membershipId } as any);
    prismaMock.subscription.findFirst.mockResolvedValueOnce({
      id: TEST_IDS.subscriptionId,
      razorpaySubId: TEST_IDS.razorpaySubId,
      status: SubscriptionStatus.ACTIVE,
    } as any);
    razorpayMock.subscriptions.cancel.mockResolvedValueOnce({});
    prismaMock.$transaction.mockImplementationOnce(async (callback: any) => {
      const tx = {
        subscription: {
          findUnique: vi.fn().mockResolvedValue({
            id: TEST_IDS.subscriptionId,
            status: SubscriptionStatus.ACTIVE,
          }),
          update: vi.fn(),
        },
        subscriptionStateTransition: {
          create: vi.fn(),
        },
      };
      await callback(tx);
      return null;
    });

    const result = await cancelSubscriptionAndRefund(TEST_IDS.userId, TEST_IDS.societyId, false);

    expect(result.cancelled).toBe(true);
    expect(result.refunded).toBe(false);
    expect(razorpayMock.subscriptions.cancel).toHaveBeenCalledWith(TEST_IDS.razorpaySubId, 0);
    expect(razorpayMock.payments.refund).not.toHaveBeenCalled();
  });

  it("throws if user is not a society member for mandate setup", async () => {
    prismaMock.membership.findFirst.mockResolvedValueOnce(null);

    await expect(
      setupSubscriptionMandate(TEST_IDS.userId, TEST_IDS.societyId),
    ).rejects.toMatchObject({
      status: 403,
    });
  });

  it("throws if user is not a society member for cancellation", async () => {
    prismaMock.membership.findFirst.mockResolvedValueOnce(null);

    await expect(
      cancelSubscriptionAndRefund(TEST_IDS.userId, TEST_IDS.societyId),
    ).rejects.toMatchObject({
      status: 403,
    });
  });

  it("sets cancellation mandate to failed status semantics", async () => {
    prismaMock.membership.findFirst.mockResolvedValueOnce({ id: TEST_IDS.membershipId } as any);
    prismaMock.subscription.findFirst.mockResolvedValueOnce({
      id: TEST_IDS.subscriptionId,
      razorpaySubId: TEST_IDS.razorpaySubId,
      status: SubscriptionStatus.ACTIVE,
    } as any);
    razorpayMock.subscriptions.cancel.mockResolvedValueOnce({});
    const updateMock = vi.fn();
    prismaMock.$transaction.mockImplementationOnce(async (callback: any) => {
      const tx = {
        subscription: {
          findUnique: vi.fn().mockResolvedValue({
            id: TEST_IDS.subscriptionId,
            status: SubscriptionStatus.ACTIVE,
          }),
          update: updateMock,
        },
        subscriptionStateTransition: {
          create: vi.fn(),
        },
      };
      await callback(tx);
      return null;
    });

    await cancelSubscriptionAndRefund(TEST_IDS.userId, TEST_IDS.societyId, false);
    const payload = updateMock.mock.calls[0]?.[0]?.data;
    expect(payload.status).toBe(SubscriptionStatus.CANCELLED);
    expect(payload.mandateStatus).toBe(MandateStatus.FAILED);
  });
});
