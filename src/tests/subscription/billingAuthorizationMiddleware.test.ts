/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/unbound-method */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { billingAuthorizationMiddleware } from "@/middlewares/billingAuthorizationMiddleware.js";
import { prismaMock } from "@/tests/helpers/mock-prisma.js";
import { makeMembership, TEST_IDS } from "@/tests/helpers/fixtures.js";
import { evaluateSocietyBillingAccess } from "@/services/subscriptionLifecycleService.js";

vi.mock("@/services/subscriptionLifecycleService.js", async () => {
  const actual = await vi.importActual("@/services/subscriptionLifecycleService.js");
  return {
    ...actual,
    evaluateSocietyBillingAccess: vi.fn(),
  };
});

const evaluateSocietyBillingAccessMock = vi.mocked(evaluateSocietyBillingAccess);

describe("billingAuthorizationMiddleware", () => {
  beforeEach(() => {
    evaluateSocietyBillingAccessMock.mockResolvedValue({
      isAllowed: true,
      state: "SUBSCRIPTION_ACTIVE",
    });
  });

  it("rejects invalid query params", async () => {
    const req = { query: { societyId: "not-a-uuid" }, headers: {}, body: {}, params: {} } as any;
    const next = vi.fn();

    await billingAuthorizationMiddleware()(req, {} as any, next);

    expect(next).toHaveBeenCalledOnce();
    const err = next.mock.calls[0]?.[0] as { status?: number };
    expect(err.status).toBe(400);
  });

  it("rejects when no society context is present", async () => {
    const req = { query: {}, headers: {}, body: {}, params: {} } as any;
    const next = vi.fn();

    await billingAuthorizationMiddleware()(req, {} as any, next);

    const err = next.mock.calls[0]?.[0] as { status?: number };
    expect(err.status).toBe(403);
  });

  it("hydrates membership from prisma if missing", async () => {
    const req = {
      query: {},
      headers: {},
      body: { societyId: TEST_IDS.societyId },
      params: {},
      user: { id: TEST_IDS.userId },
    } as any;
    const next = vi.fn();
    prismaMock.membership.findFirst.mockResolvedValue(makeMembership() as any);

    await billingAuthorizationMiddleware()(req, {} as any, next);

    expect(prismaMock.membership.findFirst).toHaveBeenCalledWith({
      where: { userId: TEST_IDS.userId, societyId: TEST_IDS.societyId, deletedAt: null },
    });
    expect(req.membership).toMatchObject({ societyId: TEST_IDS.societyId });
    expect(next).toHaveBeenCalledWith();
  });

  it("rejects denied billing state", async () => {
    evaluateSocietyBillingAccessMock.mockResolvedValueOnce({
      isAllowed: false,
      state: "SUBSCRIPTION_PAYMENT_FAILED",
    });
    const req = {
      query: {},
      headers: {},
      body: { societyId: TEST_IDS.societyId },
      params: {},
    } as any;
    const next = vi.fn();

    await billingAuthorizationMiddleware()(req, {} as any, next);

    const err = next.mock.calls[0]?.[0] as { status?: number; message?: string };
    expect(err.status).toBe(403);
    expect(err.message).toContain("SUBSCRIPTION_PAYMENT_FAILED");
  });
});
