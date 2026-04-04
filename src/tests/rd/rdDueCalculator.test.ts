import { describe, expect, it } from "vitest";
import {
  Prisma,
  RdFineCalculationMethod,
  RecurringDepositInstallmentStatus,
} from "@/generated/prisma/client.js";
import {
  computeDueLines,
  fifoAllocatePayment,
  fifoAllocatePaymentWithFineSkip,
  isOverdue,
  sumMaxAllocatable,
  sumTotalDue,
} from "@/services/rdDueCalculator.js";

describe("rdDueCalculator", () => {
  const params = {
    monthlyAmount: new Prisma.Decimal(1000),
    fineCalculationMethod: RdFineCalculationMethod.FIXED_PER_STREAK_UNIT,
    fixedOverdueFineAmount: new Prisma.Decimal(20),
    fineRatePerHundred: new Prisma.Decimal(0),
    graceDays: 0,
    penaltyMultiplier: new Prisma.Decimal(1),
    penaltyStartMonth: 99,
  };

  it("detects overdue only after grace boundary", () => {
    const due = new Date("2026-01-10T00:00:00.000Z");
    expect(isOverdue(due, 0, new Date("2026-01-10T12:00:00.000Z"))).toBe(false);
    expect(isOverdue(due, 0, new Date("2026-01-11T00:00:00.000Z"))).toBe(true);
  });

  it("assigns highest missed-months streak to oldest overdue installment", () => {
    const lines = computeDueLines(
      [
        {
          id: "i1",
          monthIndex: 1,
          dueDate: new Date("2026-01-01T00:00:00.000Z"),
          principalAmount: new Prisma.Decimal(1000),
          paidPrincipal: new Prisma.Decimal(0),
        },
        {
          id: "i2",
          monthIndex: 2,
          dueDate: new Date("2026-02-01T00:00:00.000Z"),
          principalAmount: new Prisma.Decimal(1000),
          paidPrincipal: new Prisma.Decimal(0),
        },
        {
          id: "i3",
          monthIndex: 3,
          dueDate: new Date("2026-03-01T00:00:00.000Z"),
          principalAmount: new Prisma.Decimal(1000),
          paidPrincipal: new Prisma.Decimal(0),
        },
      ],
      params,
      new Date("2026-04-15T00:00:00.000Z"),
    );

    expect(lines.map((line) => line.missedMonths)).toEqual([3, 2, 1]);
    expect(lines[0]?.fine.toNumber()).toBe(60);
    expect(lines[1]?.fine.toNumber()).toBe(40);
    expect(lines[2]?.fine.toNumber()).toBe(20);
    expect(lines[0]?.status).toBe(RecurringDepositInstallmentStatus.OVERDUE);
  });

  it("allocates FIFO with principal-first then fine", () => {
    const lines = computeDueLines(
      [
        {
          id: "i1",
          monthIndex: 1,
          dueDate: new Date("2026-01-01T00:00:00.000Z"),
          principalAmount: new Prisma.Decimal(1000),
          paidPrincipal: new Prisma.Decimal(0),
        },
      ],
      params,
      new Date("2026-02-02T00:00:00.000Z"),
    );

    const allocation = fifoAllocatePayment(lines, new Prisma.Decimal(1010));
    expect(allocation.allocations[0]?.principalApplied.toNumber()).toBe(1000);
    expect(allocation.allocations[0]?.fineApplied.toNumber()).toBe(10);
  });

  it("supports fine-skip allocations with deferred fine deltas", () => {
    const lines = computeDueLines(
      [
        {
          id: "i1",
          monthIndex: 1,
          dueDate: new Date("2026-01-01T00:00:00.000Z"),
          principalAmount: new Prisma.Decimal(1000),
          paidPrincipal: new Prisma.Decimal(0),
        },
      ],
      params,
      new Date("2026-02-02T00:00:00.000Z"),
    );

    const allocation = fifoAllocatePaymentWithFineSkip(
      lines,
      new Prisma.Decimal(1000),
      undefined,
      new Set([1]),
    );
    expect(allocation.allocations[0]?.principalApplied.toNumber()).toBe(1000);
    expect(allocation.allocations[0]?.fineApplied.toNumber()).toBe(0);
    expect(allocation.deferredFineDeltas[0]?.deferredFineDelta.toNumber()).toBeGreaterThan(0);
  });

  it("computes aggregate allocatable and total due", () => {
    const lines = computeDueLines(
      [
        {
          id: "i1",
          monthIndex: 1,
          dueDate: new Date("2026-01-01T00:00:00.000Z"),
          principalAmount: new Prisma.Decimal(1000),
          paidPrincipal: new Prisma.Decimal(0),
        },
        {
          id: "i2",
          monthIndex: 2,
          dueDate: new Date("2026-03-01T00:00:00.000Z"),
          principalAmount: new Prisma.Decimal(1000),
          paidPrincipal: new Prisma.Decimal(1000),
        },
      ],
      params,
      new Date("2026-02-20T00:00:00.000Z"),
    );

    const totalDue = sumTotalDue(lines).toNumber();
    const maxAllocatableWithoutFineMonth1 = sumMaxAllocatable(
      lines,
      undefined,
      new Set([1]),
    ).toNumber();

    expect(totalDue).toBeGreaterThan(1000);
    expect(maxAllocatableWithoutFineMonth1).toBe(1000);
  });
});
