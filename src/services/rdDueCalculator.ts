import {
  Prisma,
  RecurringDepositInstallmentStatus,
  RdFineCalculationMethod,
} from "@/generated/prisma/client.js";

/**
 * Fine model (server-side only):
 * - Overdue when currentDate is after the end of the grace period (dueDate + graceDays, date-only).
 * - Within each maximal contiguous block of overdue installments (each with remaining principal > 0),
 *   ordered by monthIndex: block length N, oldest installment gets missedMonths = N, next N-1, …,
 *   newest overdue in the block gets 1 (oldest carries the highest streak multiplier).
 * - Two base-fine modes (see RdFineCalculationMethod):
 *   - FIXED_PER_STREAK_UNIT: baseFine = fixedOverdueFineAmount (does not scale with monthly amount).
 *   - PROPORTIONAL_PER_HUNDRED: baseFine = (monthlyAmount / 100) * fineRatePerHundred.
 * - fine = baseFine * missedMonths; if missedMonths >= penaltyStartMonth, multiply whole fine by penaltyMultiplier.
 * - Payment allocation: principal first, then fine (FIFO across months).
 *
 * Example — fixed base ₹20, three consecutive overdue months, no penalty multiplier:
 *   Month1: fine = 20×3 = ₹60; month2: 20×2 = ₹40; month3: 20×1 = ₹20.
 *
 * Rounding: Prisma.Decimal throughout.
 */

export interface RdDueParams {
  monthlyAmount: Prisma.Decimal;
  fineCalculationMethod: RdFineCalculationMethod;
  /** Required when fineCalculationMethod is FIXED_PER_STREAK_UNIT */
  fixedOverdueFineAmount: Prisma.Decimal | null;
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

function resolveBaseFine(params: RdDueParams): Prisma.Decimal {
  if (params.fineCalculationMethod === RdFineCalculationMethod.FIXED_PER_STREAK_UNIT) {
    return params.fixedOverdueFineAmount ?? new Prisma.Decimal(0);
  }
  return params.monthlyAmount.div(100).mul(params.fineRatePerHundred);
}

/**
 * For each contiguous block of overdue installments with remaining > 0, assign missedMonths:
 * oldest in block gets N, then N-1, …, newest gets 1.
 */
function assignMissedMonthsOldestFirst(
  sorted: InstallmentInput[],
  remainingById: Map<string, Prisma.Decimal>,
  overdueById: Map<string, boolean>,
): Map<string, number> {
  const missed = new Map<string, number>();
  let idx = 0;
  while (idx < sorted.length) {
    const inst = sorted[idx]!;
    const remaining = remainingById.get(inst.id) ?? new Prisma.Decimal(0);
    const overdue = overdueById.get(inst.id) ?? false;
    if (remaining.lte(0) || !overdue) {
      missed.set(inst.id, 0);
      idx += 1;
      continue;
    }
    const start = idx;
    while (idx < sorted.length) {
      const i = sorted[idx]!;
      const r = remainingById.get(i.id) ?? new Prisma.Decimal(0);
      const o = overdueById.get(i.id) ?? false;
      if (r.lte(0) || !o) break;
      idx += 1;
    }
    const n = idx - start;
    for (let k = 0; k < n; k += 1) {
      const id = sorted[start + k]!.id;
      missed.set(id, n - k);
    }
  }
  return missed;
}

export function computeDueLines(
  installments: InstallmentInput[],
  params: RdDueParams,
  currentDate: Date,
): DueLine[] {
  const sorted = [...installments].sort((a, b) => a.monthIndex - b.monthIndex);
  const remainingById = new Map<string, Prisma.Decimal>();
  const overdueById = new Map<string, boolean>();

  for (const inst of sorted) {
    const remaining = Prisma.Decimal.max(
      inst.principalAmount.sub(inst.paidPrincipal),
      new Prisma.Decimal(0),
    );
    remainingById.set(inst.id, remaining);
    overdueById.set(
      inst.id,
      remaining.gt(0) && isOverdue(inst.dueDate, params.graceDays, currentDate),
    );
  }

  const missedMonthsById = assignMissedMonthsOldestFirst(sorted, remainingById, overdueById);
  const baseFine = resolveBaseFine(params);
  const lines: DueLine[] = [];

  for (const inst of sorted) {
    const remaining = remainingById.get(inst.id) ?? new Prisma.Decimal(0);

    if (remaining.lte(0)) {
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

    const overdue = overdueById.get(inst.id) ?? false;
    const missedMonths = missedMonthsById.get(inst.id) ?? 0;

    let fine = new Prisma.Decimal(0);
    if (overdue && missedMonths > 0) {
      fine = baseFine.mul(missedMonths);
      if (missedMonths >= params.penaltyStartMonth) {
        fine = fine.mul(params.penaltyMultiplier);
      }
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

export interface FifoDeferredFineDelta {
  installmentId: string;
  monthIndex: number;
  deferredFineDelta: Prisma.Decimal;
}

function getOrderedDueLines(lines: DueLine[], monthFilter?: number[]): DueLine[] {
  const allowed = monthFilter ? new Set(monthFilter) : null;
  return [...lines]
    .filter((l) => l.totalDue.gt(0))
    .filter((l) => (allowed ? allowed.has(l.monthIndex) : true))
    .sort((a, b) => a.monthIndex - b.monthIndex);
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
  const ordered = getOrderedDueLines(lines, monthFilter);

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

export function sumMaxAllocatable(
  lines: DueLine[],
  monthFilter?: number[],
  skipFineMonthIndices?: Set<number>,
): Prisma.Decimal {
  const skipSet = skipFineMonthIndices ?? new Set<number>();
  return getOrderedDueLines(lines, monthFilter).reduce((sum, line) => {
    if (skipSet.has(line.monthIndex)) {
      return sum.add(line.remainingPrincipal);
    }
    return sum.add(line.totalDue);
  }, new Prisma.Decimal(0));
}

export function fifoAllocatePaymentWithFineSkip(
  lines: DueLine[],
  paymentAmount: Prisma.Decimal,
  monthFilter?: number[],
  skipFineMonthIndices?: Set<number>,
): {
  allocations: FifoAllocation[];
  deferredFineDeltas: FifoDeferredFineDelta[];
  unallocated: Prisma.Decimal;
} {
  const skipSet = skipFineMonthIndices ?? new Set<number>();
  const ordered = getOrderedDueLines(lines, monthFilter);
  let remaining = paymentAmount;
  const allocations: FifoAllocation[] = [];
  const deferredFineDeltas: FifoDeferredFineDelta[] = [];

  for (const line of ordered) {
    if (remaining.lte(0)) break;

    const skipFine = skipSet.has(line.monthIndex);
    const pApply = remaining.lt(line.remainingPrincipal) ? remaining : line.remainingPrincipal;
    remaining = remaining.sub(pApply);

    let fApply = new Prisma.Decimal(0);
    if (!skipFine && remaining.gt(0) && line.fine.gt(0)) {
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

    if (skipFine && pApply.gte(line.remainingPrincipal) && line.fine.gt(0)) {
      deferredFineDeltas.push({
        installmentId: line.installmentId,
        monthIndex: line.monthIndex,
        deferredFineDelta: line.fine,
      });
    }
  }

  return { allocations, deferredFineDeltas, unallocated: remaining };
}

export function sumTotalDue(lines: DueLine[], monthFilter?: number[]): Prisma.Decimal {
  const allowed = monthFilter ? new Set(monthFilter) : null;
  return lines
    .filter((l) => l.totalDue.gt(0))
    .filter((l) => (allowed ? allowed.has(l.monthIndex) : true))
    .reduce((s, l) => s.add(l.totalDue), new Prisma.Decimal(0));
}
