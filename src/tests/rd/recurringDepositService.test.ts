/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call, @typescript-eslint/require-await */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma, RdFineCalculationMethod } from "@/generated/prisma/client.js";
import { prismaMock } from "@/tests/helpers/mock-prisma.js";
import { makeActorMembership } from "@/tests/helpers/fixtures.js";
import {
  addMonths,
  computeExpectedMaturityPayout,
  createRdAccount,
  createRdProjectType,
  softDeleteRdProjectType,
} from "@/services/recurringDepositService.js";

const { logActivityMock } = vi.hoisted(() => ({
  logActivityMock: vi.fn(),
}));

vi.mock("@/services/activityService.js", () => ({
  logActivity: logActivityMock,
}));

vi.mock("@/services/rdFineWaiveService.js", () => ({
  approveRdFineWaiveRequest: vi.fn(),
  createRdFineWaiveRequest: vi.fn(),
  listPendingRdFineWaiveRequests: vi.fn(),
  listRdFineWaiveRequests: vi.fn(),
  rejectRdFineWaiveRequest: vi.fn(),
}));

describe("recurringDepositService", () => {
  const actor = makeActorMembership() as any;

  beforeEach(() => {
    logActivityMock.mockReset();
  });

  it("adds months while preserving date semantics", () => {
    const base = new Date("2026-01-15T00:00:00.000Z");
    const result = addMonths(base, 3);
    expect(result.toISOString()).toBe("2026-04-15T00:00:00.000Z");
  });

  it("computes expected maturity payout from principal and maturity rate", () => {
    const payout = computeExpectedMaturityPayout(
      new Prisma.Decimal(1000),
      12,
      new Prisma.Decimal(10),
    );
    expect(payout.toNumber()).toBe(13200);
  });

  it("creates RD project type in fixed fine mode", async () => {
    const createMock = vi.fn().mockResolvedValue({ id: "rd_pt_1", name: "RD Gold" });
    prismaMock.$transaction.mockImplementationOnce(async (callback: any) => {
      const tx = {
        recurringDepositProjectType: {
          create: createMock,
        },
      };
      return callback(tx);
    });

    const result = await createRdProjectType(actor, {
      name: "RD Gold",
      duration: 24,
      minimumMonthlyAmount: 1000,
      maturityPerHundred: 12,
      fineCalculationMethod: RdFineCalculationMethod.FIXED_PER_STREAK_UNIT,
      fixedOverdueFineAmount: 20,
      fineRatePerHundred: 0,
      graceDays: 5,
    });

    expect(result).toMatchObject({ id: "rd_pt_1", name: "RD Gold" });
    expect(createMock).toHaveBeenCalledOnce();
    expect(logActivityMock).toHaveBeenCalledOnce();
  });

  it("rejects soft-delete when RD project type does not exist", async () => {
    prismaMock.recurringDepositProjectType.findFirst.mockResolvedValueOnce(null);

    await expect(softDeleteRdProjectType(actor, "unknown")).rejects.toMatchObject({ status: 404 });
  });

  it("validates monthly amount on RD account creation", async () => {
    await expect(
      createRdAccount(actor, {
        referrerMembershipId: "cme0yh4oe0000h95i6ibz9a8k",
        customer: {
          fullName: "Test",
          phone: "9876543210",
        },
        nominees: [{ name: "Nominee", phone: "9876543211" }],
        rd: {
          projectTypeId: "7fef8f2b-0ee8-44b4-a36b-9e3ea8b3a8d1",
          monthlyAmount: 0,
          startDate: new Date(),
        },
      }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("requires at least one nominee for RD account creation", async () => {
    await expect(
      createRdAccount(actor, {
        referrerMembershipId: "cme0yh4oe0000h95i6ibz9a8k",
        customer: {
          fullName: "Test",
          phone: "9876543210",
        },
        nominees: [],
        rd: {
          projectTypeId: "7fef8f2b-0ee8-44b4-a36b-9e3ea8b3a8d1",
          monthlyAmount: 1000,
          startDate: new Date(),
        },
      }),
    ).rejects.toMatchObject({ status: 400 });
  });
});
