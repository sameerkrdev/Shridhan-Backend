/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/require-await */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma, RdFineWaiveRequestStatus } from "@/generated/prisma/client.js";
import { prismaMock } from "@/tests/helpers/mock-prisma.js";
import { makeActorMembership, TEST_IDS } from "@/tests/helpers/fixtures.js";
import {
  approveRdFineWaiveRequest,
  createRdFineWaiveRequest,
  rejectRdFineWaiveRequest,
} from "@/services/rdFineWaiveService.js";
import { computeDueLines } from "@/services/rdDueCalculator.js";

const { logActivityMock, pushNotificationMock, sendEmailMock } = vi.hoisted(() => ({
  logActivityMock: vi.fn(),
  pushNotificationMock: vi.fn(),
  sendEmailMock: vi.fn(),
}));

vi.mock("@/services/activityService.js", () => ({
  logActivity: logActivityMock,
}));
vi.mock("@/services/firebaseNotificationService.js", () => ({
  pushRdWaiveNotificationsToFirestore: pushNotificationMock,
}));
vi.mock("@/services/emailService.js", () => ({
  sendRdFineWaiveEmail: sendEmailMock,
}));
vi.mock("@/services/rdDueCalculator.js", async () => {
  const actual = await vi.importActual("@/services/rdDueCalculator.js");
  return {
    ...actual,
    computeDueLines: vi.fn(),
  };
});
vi.mock("@/config/dotenv.js", () => ({
  default: {
    FRONTEND_URLS: "http://localhost:3000",
  },
}));

const computeDueLinesMock = vi.mocked(computeDueLines);

describe("rdFineWaiveService", () => {
  const actor = makeActorMembership() as any;

  beforeEach(() => {
    logActivityMock.mockReset();
    pushNotificationMock.mockReset();
    sendEmailMock.mockReset();
    computeDueLinesMock.mockReset();
  });

  it("requires months when selected scope is used", async () => {
    prismaMock.recurringDeposit.findFirst.mockResolvedValueOnce({
      id: TEST_IDS.rdId,
      status: "ACTIVE",
      customer: { fullName: "Customer 1" },
      installments: [],
    } as any);
    computeDueLinesMock.mockReturnValueOnce([]);

    await expect(
      createRdFineWaiveRequest(actor, TEST_IDS.rdId, {
        scopeType: "selected",
      }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("creates an auto-approved waive request", async () => {
    prismaMock.recurringDeposit.findFirst.mockResolvedValueOnce({
      id: TEST_IDS.rdId,
      status: "ACTIVE",
      monthlyAmount: new Prisma.Decimal(1000),
      fineCalculationMethodSnapshot: "FIXED_PER_STREAK_UNIT",
      fixedOverdueFineAmountSnapshot: new Prisma.Decimal(20),
      fineRatePerHundredSnapshot: new Prisma.Decimal(0),
      graceDaysSnapshot: 0,
      penaltyMultiplierSnapshot: new Prisma.Decimal(1),
      penaltyStartMonthSnapshot: 1,
      customer: { fullName: "Customer 1" },
      installments: [],
    } as any);
    computeDueLinesMock.mockReturnValueOnce([
      {
        installmentId: "i1",
        monthIndex: 1,
        remainingPrincipal: new Prisma.Decimal(1000),
        fine: new Prisma.Decimal(20),
        totalDue: new Prisma.Decimal(1020),
        overdue: true,
        missedMonths: 1,
        status: "OVERDUE",
      } as any,
    ]);
    prismaMock.societyRole.findMany.mockResolvedValueOnce([{ id: "r1" }] as any);
    prismaMock.membership.findMany.mockResolvedValueOnce([
      {
        id: "approver_1",
        user: { email: "approver@example.com", name: "Approver", id: "u2", phone: "9999999999" },
        role: { id: "r1", name: "admin" },
      },
    ] as any);
    prismaMock.$transaction.mockImplementationOnce(async (callback: any) => {
      const tx = {
        rdFineWaiveRequest: {
          create: vi.fn().mockResolvedValue({
            id: TEST_IDS.requestId,
            status: RdFineWaiveRequestStatus.APPROVED,
            reduceFromMaturity: false,
            reason: null,
            expiresAt: new Date(Date.now() + 86_400_000),
            months: [{ monthIndex: 1, waivedFineAmount: new Prisma.Decimal(20) }],
          }),
        },
      };
      return callback(tx);
    });

    const result = await createRdFineWaiveRequest(actor, TEST_IDS.rdId, {
      scopeType: "all",
      autoApprove: true,
    });

    expect(result.status).toBe(RdFineWaiveRequestStatus.APPROVED);
    expect(pushNotificationMock).toHaveBeenCalled();
    expect(sendEmailMock).toHaveBeenCalled();
  });

  it("approves a pending request", async () => {
    prismaMock.$transaction.mockImplementationOnce(async (callback: any) => {
      const tx = {
        rdFineWaiveRequest: {
          findFirst: vi.fn().mockResolvedValue({
            id: TEST_IDS.requestId,
            recurringDepositId: TEST_IDS.rdId,
            requestedByMembershipId: actor.id,
            status: RdFineWaiveRequestStatus.PENDING,
            expiresAt: new Date(Date.now() + 86_400_000),
            recurringDeposit: { customer: { fullName: "Customer 1" } },
            months: [{ monthIndex: 1, waivedFineAmount: new Prisma.Decimal(10) }],
          }),
          update: vi.fn().mockResolvedValue({
            id: TEST_IDS.requestId,
            recurringDepositId: TEST_IDS.rdId,
            status: RdFineWaiveRequestStatus.APPROVED,
            reduceFromMaturity: false,
            expiresAt: new Date(Date.now() + 86_400_000),
            months: [{ monthIndex: 1, waivedFineAmount: new Prisma.Decimal(10) }],
          }),
        },
      };
      return callback(tx);
    });
    prismaMock.societyRole.findMany.mockResolvedValueOnce([] as any);

    const result = await approveRdFineWaiveRequest(actor, TEST_IDS.requestId);
    expect(result.status).toBe(RdFineWaiveRequestStatus.APPROVED);
    expect(logActivityMock).toHaveBeenCalled();
  });

  it("rejects a pending request with rejection reason", async () => {
    prismaMock.$transaction.mockImplementationOnce(async (callback: any) => {
      const tx = {
        rdFineWaiveRequest: {
          findFirst: vi.fn().mockResolvedValue({
            id: TEST_IDS.requestId,
            recurringDepositId: TEST_IDS.rdId,
            requestedByMembershipId: actor.id,
            status: RdFineWaiveRequestStatus.PENDING,
            expiresAt: new Date(Date.now() + 86_400_000),
            recurringDeposit: { customer: { fullName: "Customer 1" } },
            months: [{ monthIndex: 1, waivedFineAmount: new Prisma.Decimal(10) }],
          }),
          update: vi.fn().mockResolvedValue({
            id: TEST_IDS.requestId,
            recurringDepositId: TEST_IDS.rdId,
            status: RdFineWaiveRequestStatus.REJECTED,
            reduceFromMaturity: false,
            rejectionReason: "policy mismatch",
            expiresAt: new Date(Date.now() + 86_400_000),
            months: [{ monthIndex: 1, waivedFineAmount: new Prisma.Decimal(10) }],
          }),
        },
      };
      return callback(tx);
    });
    prismaMock.societyRole.findMany.mockResolvedValueOnce([] as any);

    const result = await rejectRdFineWaiveRequest(actor, TEST_IDS.requestId, "policy mismatch");
    expect(result.status).toBe(RdFineWaiveRequestStatus.REJECTED);
    expect(logActivityMock).toHaveBeenCalled();
  });
});
