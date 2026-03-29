import { Prisma, RecurringDepositInstallmentStatus } from "@/generated/prisma/client.js";

/**
 * Fine model (server-side only):
 * - Overdue when currentDate is after the end of the grace period (dueDate + graceDays, date-only).
 * - Streak: increments for consecutive overdue installments with remaining principal; resets when
 *   an installment is fully paid or is not yet overdue (still within grace / before due).
 * - baseFine = (monthlyAmount / 100) * fineRatePerHundred
 * - fine = baseFine * missedMonths; if missedMonths >= penaltyStartMonth, multiply by penaltyMultiplier.
 * - Within a bucket, payment applies principal first, then fine (FIFO across months).
 *
 * -------------------------------------------------------------------------------------------------
 * Numerical examples (₹, illustrative — same formulas as code above)
 *
 * Common inputs: monthlyAmount = ₹5,000; fineRatePerHundred = 2
 *   → baseFine = (5000 / 100) × 2 = ₹100 per streak step (before penalty multiplier).
 *
 * Example A — On time, no fine
 *   Installment due 1 Mar; graceDays = 7; “today” = 5 Mar → not overdue (still in grace window).
 *   remaining = ₹5,000, fine = ₹0, totalDue = ₹5,000, status PENDING or PARTIAL if partly paid.
 *
 * Example B — Partial payment, not overdue
 *   Same as A, member pays ₹2,000 toward principal only.
 *   remaining = ₹3,000, fine = ₹0, totalDue = ₹3,000, status PARTIAL.
 *
 * Example C — Two consecutive overdue months (assume “today” is after grace for both; graceDays = 0
 *   for simpler dates). penaltyStartMonth = 2, penaltyMultiplier = 1.5
 *   Month 1: streak = 1, fine = 100 × 1 = ₹100 (1 < 2 → no multiplier) → totalDue = 5000 + 100.
 *   Month 2: streak = 2, raw fine = 100 × 2 = ₹200; 2 >= 2 → fine = 200 × 1.5 = ₹300 → totalDue = 5300.
 *   Sum to clear both: ₹5,100 + ₹5,300 = ₹10,400.
 *
 * Example D — FIFO lump sum (same as C)
 *   Payment ₹10,400: month 1 takes ₹5,000 principal + ₹100 fine; month 2 takes ₹5,000 + ₹300; done.
 *   Payment ₹5,100: clears month 1 entirely; month 2 still has ₹5,000 principal + ₹300 fine outstanding.
 *
 * Example E — Scoped months only (monthFilter [1, 2])
 *   maxDue and FIFO consider only installments 1 and 2; same allocation order within that set.
 *
 * Rounding: all money uses Prisma.Decimal; display strings may show 2 decimal places in API/UI.
 */

export interface RdDueParams {
  monthlyAmount: Prisma.Decimal;
  fineRatePerHundred: Prisma.Decimal;
  graceDays: number;
  penaltyMultiplier: Prisma.Decimal;
  penaltyStartMonth: number;
}

export interface InstallmentInput {
  id: string;
  monthIndex: number;
  dueDate: Date;
  principalAmount: Prisma.Decimal;
  paidPrincipal: Prisma.Decimal;
}

export interface DueLine {
  installmentId: string;
  monthIndex: number;
  remainingPrincipal: Prisma.Decimal;
  fine: Prisma.Decimal;
  totalDue: Prisma.Decimal;
  overdue: boolean;
  missedMonths: number;
  status: RecurringDepositInstallmentStatus;
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function addCalendarDays(d: Date, days: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + days);
  return x;
}

/** Last day of the grace window (inclusive). Overdue strictly after this calendar day. */
export function endOfGracePeriod(dueDate: Date, graceDays: number): Date {
  return startOfDay(addCalendarDays(dueDate, graceDays));
}

export function isOverdue(dueDate: Date, graceDays: number, currentDate: Date): boolean {
  return startOfDay(currentDate) > endOfGracePeriod(dueDate, graceDays);
}

export function computeDueLines(
  installments: InstallmentInput[],
  params: RdDueParams,
  currentDate: Date,
): DueLine[] {
  const sorted = [...installments].sort((a, b) => a.monthIndex - b.monthIndex);
  let streak = 0;
  const lines: DueLine[] = [];

  for (const inst of sorted) {
    const remaining = Prisma.Decimal.max(
      inst.principalAmount.sub(inst.paidPrincipal),
      new Prisma.Decimal(0),
    );

    if (remaining.lte(0)) {
      streak = 0;
      lines.push({
        installmentId: inst.id,
        monthIndex: inst.monthIndex,
        remainingPrincipal: new Prisma.Decimal(0),
        fine: new Prisma.Decimal(0),
        totalDue: new Prisma.Decimal(0),
        overdue: false,
        missedMonths: 0,
        status: RecurringDepositInstallmentStatus.PAID,
      });
      continue;
    }

    const overdue = isOverdue(inst.dueDate, params.graceDays, currentDate);

    let fine = new Prisma.Decimal(0);
    let missedMonths = 0;

    if (overdue) {
      streak += 1;
      missedMonths = streak;
      const baseFine = params.monthlyAmount.div(100).mul(params.fineRatePerHundred);
      fine = baseFine.mul(missedMonths);
      if (missedMonths >= params.penaltyStartMonth) {
        fine = fine.mul(params.penaltyMultiplier);
      }
    } else {
      streak = 0;
    }

    const totalDue = remaining.add(fine);

    let status: RecurringDepositInstallmentStatus;
    if (overdue) {
      status = RecurringDepositInstallmentStatus.OVERDUE;
    } else if (inst.paidPrincipal.gt(0)) {
      status = RecurringDepositInstallmentStatus.PARTIAL;
    } else {
      status = RecurringDepositInstallmentStatus.PENDING;
    }

    lines.push({
      installmentId: inst.id,
      monthIndex: inst.monthIndex,
      remainingPrincipal: remaining,
      fine,
      totalDue,
      overdue,
      missedMonths,
      status,
    });
  }

  return lines;
}

export interface FifoAllocation {
  installmentId: string;
  monthIndex: number;
  principalApplied: Prisma.Decimal;
  fineApplied: Prisma.Decimal;
}

/**
 * FIFO across installments (by monthIndex). Within each installment: principal first, then fine.
 * Only lines with totalDue > 0 are considered; optionally restrict to monthIndices.
 */
export function fifoAllocatePayment(
  lines: DueLine[],
  paymentAmount: Prisma.Decimal,
  monthFilter?: number[],
): { allocations: FifoAllocation[]; unallocated: Prisma.Decimal } {
  const allowed = new Set(monthFilter);
  const ordered = [...lines]
    .filter((l) => l.totalDue.gt(0))
    .filter((l) => (monthFilter === undefined ? true : allowed.has(l.monthIndex)))
    .sort((a, b) => a.monthIndex - b.monthIndex);

  let remaining = paymentAmount;
  const allocations: FifoAllocation[] = [];

  for (const line of ordered) {
    if (remaining.lte(0)) break;

    let pApply = remaining.lt(line.remainingPrincipal) ? remaining : line.remainingPrincipal;
    remaining = remaining.sub(pApply);

    let fApply = new Prisma.Decimal(0);
    if (remaining.gt(0) && line.fine.gt(0)) {
      fApply = remaining.lt(line.fine) ? remaining : line.fine;
      remaining = remaining.sub(fApply);
    }

    if (pApply.gt(0) || fApply.gt(0)) {
      allocations.push({
        installmentId: line.installmentId,
        monthIndex: line.monthIndex,
        principalApplied: pApply,
        fineApplied: fApply,
      });
    }
  }

  return { allocations, unallocated: remaining };
}

export function sumTotalDue(lines: DueLine[], monthFilter?: number[]): Prisma.Decimal {
  const allowed = monthFilter ? new Set(monthFilter) : null;
  return lines
    .filter((l) => l.totalDue.gt(0))
    .filter((l) => (allowed ? allowed.has(l.monthIndex) : true))
    .reduce((s, l) => s.add(l.totalDue), new Prisma.Decimal(0));
}
