import { describe, expect, it } from "vitest";
import {
  createMisAccountSchema,
  createMisProjectTypeSchema,
  payMisInterestSchema,
  requestMisDocumentUploadUrlSchema,
} from "@/zodValidationSchema/misValidationSchema.js";

const validUuid = "7fef8f2b-0ee8-44b4-a36b-9e3ea8b3a8d1";
const validCuid = "cme0yh4oe0000h95i6ibz9a8k";

describe("misValidationSchema", () => {
  it("rejects monthly payout method without payout config", () => {
    const result = createMisProjectTypeSchema.safeParse({
      body: {
        name: "MIS A",
        duration: 12,
        minimumAmount: 1000,
        calculationMethod: "MONTHLY_PAYOUT_PER_HUNDRED",
      },
    });
    expect(result.success).toBe(false);
  });

  it("validates MIS account payload with conditional UPI payment fields", () => {
    const result = createMisAccountSchema.safeParse({
      body: {
        referrerMembershipId: validCuid,
        customer: {
          fullName: "Test Customer",
          phone: "9876543210",
        },
        nominees: [{ name: "Nom 1", phone: "9876543211" }],
        mis: {
          projectTypeId: validUuid,
          depositAmount: 5000,
          startDate: "2026-01-01",
        },
        payment: {
          amount: 5000,
          paymentMethod: "UPI",
          transactionId: "upi_1",
          upiId: "test@upi",
        },
      },
    });
    expect(result.success).toBe(true);
  });

  it("rejects duplicate nominee phones", () => {
    const result = createMisAccountSchema.safeParse({
      body: {
        referrerMembershipId: validCuid,
        customer: {
          fullName: "Test Customer",
          phone: "9876543210",
        },
        nominees: [
          { name: "Nom 1", phone: "9876543211" },
          { name: "Nom 2", phone: "9876543211" },
        ],
        mis: {
          projectTypeId: validUuid,
          depositAmount: 5000,
          startDate: "2026-01-01",
        },
      },
    });
    expect(result.success).toBe(false);
  });

  it("rejects pay-interest when both month and months are provided", () => {
    const result = payMisInterestSchema.safeParse({
      params: { id: validUuid },
      body: {
        month: 1,
        months: [1],
        amount: 100,
      },
    });
    expect(result.success).toBe(false);
  });

  it("validates request upload URL contract", () => {
    const result = requestMisDocumentUploadUrlSchema.safeParse({
      params: { id: validUuid },
      body: {
        fileName: "doc.pdf",
        displayName: "Aadhaar",
      },
    });
    expect(result.success).toBe(true);
  });
});
