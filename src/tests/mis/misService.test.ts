/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call, @typescript-eslint/require-await */
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  Prisma,
  MisCalculationMethod,
  ServiceStatus,
  TransactionType,
} from "@/generated/prisma/client.js";
import { prismaMock } from "@/tests/helpers/mock-prisma.js";
import { makeActorMembership } from "@/tests/helpers/fixtures.js";
import {
  addMisDeposit,
  createMisProjectType,
  payMisInterest,
  returnMisPrincipal,
} from "@/services/misService.js";

const { logActivityMock } = vi.hoisted(() => ({
  logActivityMock: vi.fn(),
}));

vi.mock("@/services/activityService.js", () => ({
  logActivity: logActivityMock,
}));

vi.mock("@/services/r2StorageService.js", () => ({
  buildMisDocumentObjectKey: vi.fn().mockReturnValue("obj-key"),
  generateMisDocumentUploadUrl: vi.fn().mockResolvedValue("https://upload-url"),
  getMisDocumentPublicUrl: vi.fn().mockReturnValue("https://public-url"),
}));

describe("misService", () => {
  const actor = makeActorMembership() as any;

  beforeEach(() => {
    logActivityMock.mockReset();
  });

  it("requires calculation-specific fields while creating project type", async () => {
    await expect(
      createMisProjectType(actor, {
        name: "MIS Standard",
        duration: 12,
        minimumAmount: 5000,
        calculationMethod: MisCalculationMethod.MONTHLY_PAYOUT_PER_HUNDRED,
      }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("creates project type and logs activity", async () => {
    const txCreate = vi.fn().mockResolvedValue({
      id: "pt_1",
      name: "MIS Premium",
    });
    prismaMock.$transaction.mockImplementationOnce(async (callback: any) => {
      const tx = {
        monthlyInterestSchemeProjectType: { create: txCreate },
      };
      return callback(tx);
    });

    const result = await createMisProjectType(actor, {
      name: "MIS Premium",
      duration: 24,
      minimumAmount: 10000,
      calculationMethod: MisCalculationMethod.ANNUAL_INTEREST_RATE,
      annualInterestRate: 9.5,
    });

    expect(result).toMatchObject({ id: "pt_1", name: "MIS Premium" });
    expect(txCreate).toHaveBeenCalledOnce();
    expect(logActivityMock).toHaveBeenCalledOnce();
  });

  it("rejects non-positive deposit payment", async () => {
    await expect(
      addMisDeposit(actor, "mis_1", {
        amount: 0,
      }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("blocks additional deposits on closed account", async () => {
    prismaMock.$transaction.mockImplementationOnce(async (callback: any) => {
      const tx = {
        monthlyInterestScheme: {
          findFirst: vi.fn().mockResolvedValue({
            id: "mis_1",
            status: ServiceStatus.CLOSED,
            transactions: [],
          }),
        },
      };
      return callback(tx);
    });

    await expect(
      addMisDeposit(actor, "mis_1", {
        amount: 1000,
      }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("activates account once deposit amount is fully paid", async () => {
    const updateMock = vi.fn();
    prismaMock.$transaction.mockImplementationOnce(async (callback: any) => {
      const tx = {
        monthlyInterestScheme: {
          findFirst: vi.fn().mockResolvedValue({
            id: "mis_1",
            status: ServiceStatus.PENDING_DEPOSIT,
            depositAmount: new Prisma.Decimal(1000),
            transactions: [{ amount: new Prisma.Decimal(400) }],
          }),
          update: updateMock,
        },
        monthlyInterestSchemeTransaction: {
          create: vi.fn().mockResolvedValue({ id: "txn_1" }),
        },
      };
      return callback(tx);
    });

    await addMisDeposit(actor, "mis_1", {
      amount: 600,
      paymentMethod: "CASH",
    });

    expect(updateMock).toHaveBeenCalledOnce();
  });

  it("rejects interest payout without month information", async () => {
    prismaMock.$transaction.mockImplementationOnce(async (callback: any) => {
      const tx = {
        monthlyInterestScheme: {
          findFirst: vi.fn().mockResolvedValue({
            id: "mis_1",
            status: ServiceStatus.ACTIVE,
            monthlyInterest: new Prisma.Decimal(100),
            projectType: { duration: 12 },
            transactions: [],
          }),
        },
      };
      return callback(tx);
    });

    await expect(
      payMisInterest(actor, "mis_1", {
        amount: 100,
      }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("pays selected interest month by converting expected rows", async () => {
    const updateMock = vi.fn();
    prismaMock.$transaction.mockImplementationOnce(async (callback: any) => {
      const tx = {
        monthlyInterestScheme: {
          findFirst: vi.fn().mockResolvedValue({
            id: "mis_1",
            status: ServiceStatus.ACTIVE,
            monthlyInterest: new Prisma.Decimal(100),
            projectType: { duration: 12 },
            transactions: [
              {
                id: "e1",
                amount: new Prisma.Decimal(100),
                month: 1,
                isExpected: true,
                type: TransactionType.INTEREST_PAYOUT,
              },
            ],
          }),
        },
        monthlyInterestSchemeTransaction: {
          update: updateMock,
        },
      };
      return callback(tx);
    });

    const result = await payMisInterest(actor, "mis_1", {
      month: 1,
      amount: 100,
      paymentMethod: "UPI",
      transactionId: "upitx1",
      upiId: "test@upi",
    });

    expect(result).toEqual({ success: true });
    expect(updateMock).toHaveBeenCalledOnce();
  });

  it("returns principal only after maturity date", async () => {
    prismaMock.$transaction.mockImplementationOnce(async (callback: any) => {
      const tx = {
        monthlyInterestScheme: {
          findFirst: vi.fn().mockResolvedValue({
            id: "mis_1",
            status: ServiceStatus.ACTIVE,
            maturityDate: new Date(Date.now() + 86_400_000),
            transactions: [],
          }),
        },
      };
      return callback(tx);
    });

    await expect(returnMisPrincipal(actor, "mis_1", {})).rejects.toMatchObject({ status: 400 });
  });

  it("creates principal return transaction and closes MIS account", async () => {
    const updateMock = vi.fn();
    const createMock = vi.fn().mockResolvedValue({ id: "txn_return_1" });
    prismaMock.$transaction.mockImplementationOnce(async (callback: any) => {
      const tx = {
        monthlyInterestScheme: {
          findFirst: vi.fn().mockResolvedValue({
            id: "mis_1",
            status: ServiceStatus.ACTIVE,
            maturityDate: new Date(Date.now() - 86_400_000),
            transactions: [],
            depositAmount: new Prisma.Decimal(5000),
          }),
          update: updateMock,
        },
        monthlyInterestSchemeTransaction: {
          create: createMock,
        },
      };
      return callback(tx);
    });

    await returnMisPrincipal(actor, "mis_1", { paymentMethod: "CASH" });

    expect(createMock).toHaveBeenCalledOnce();
    expect(updateMock).toHaveBeenCalledOnce();
  });
});
