import { describe, expect, it } from "vitest";
import {
  createRdAccountSchema,
  createRdFineWaiveRequestSchema,
  createRdProjectTypeSchema,
  payRdSchema,
  previewRdPaymentSchema,
} from "@/zodValidationSchema/recurringDepositValidationSchema.js";

const validUuid = "7fef8f2b-0ee8-44b4-a36b-9e3ea8b3a8d1";
const validCuid = "cme0yh4oe0000h95i6ibz9a8k";

describe("recurringDepositValidationSchema", () => {
  it("requires fine config by selected calculation mode", () => {
    const result = createRdProjectTypeSchema.safeParse({
      body: {
        name: "RD Basic",
        duration: 12,
        minimumMonthlyAmount: 1000,
        maturityPerHundred: 10,
        fineCalculationMethod: "PROPORTIONAL_PER_HUNDRED",
        graceDays: 2,
      },
    });
    expect(result.success).toBe(false);
  });

  it("validates RD account payload", () => {
    const result = createRdAccountSchema.safeParse({
      body: {
        referrerMembershipId: validCuid,
        customer: {
          fullName: "Test Customer",
          phone: "9876543210",
        },
        nominees: [{ name: "Nominee 1", phone: "9876543211" }],
        rd: {
          projectTypeId: validUuid,
          monthlyAmount: 2000,
          startDate: "2026-01-10",
        },
      },
    });
    expect(result.success).toBe(true);
  });

  it("rejects selected fine skip policy without months", () => {
    const result = previewRdPaymentSchema.safeParse({
      params: { id: validUuid },
      body: {
        amount: 1000,
        skipFinePolicy: "selected",
      },
    });
    expect(result.success).toBe(false);
  });

  it("enforces payment metadata constraints for UPI", () => {
    const result = payRdSchema.safeParse({
      params: { id: validUuid },
      body: {
        amount: 1000,
        paymentMethod: "UPI",
      },
    });
    expect(result.success).toBe(false);
  });

  it("rejects fine waive payload when both ttlDays and expiresAt are provided", () => {
    const result = createRdFineWaiveRequestSchema.safeParse({
      params: { id: validUuid },
      body: {
        scopeType: "selected",
        months: [1, 2],
        ttlDays: 5,
        expiresAt: "2026-01-10",
      },
    });
    expect(result.success).toBe(false);
  });
});
