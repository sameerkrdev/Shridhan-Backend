import { describe, expect, it } from "vitest";
import {
  cancelSubscriptionValidationSchema,
  getSocietyBillingOverviewValidationSchema,
  setupSubscriptionValidationSchema,
} from "@/zodValidationSchema/societyValidationSchema.js";
import { TEST_IDS } from "@/tests/helpers/fixtures.js";

describe("societyValidationSchema", () => {
  it("validates setup subscription payload", () => {
    const result = setupSubscriptionValidationSchema.safeParse({
      body: { societyId: TEST_IDS.societyId },
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid setup subscription payload", () => {
    const result = setupSubscriptionValidationSchema.safeParse({
      body: { societyId: "invalid" },
    });
    expect(result.success).toBe(false);
  });

  it("defaults refundLatestPayment for cancellation", () => {
    const result = cancelSubscriptionValidationSchema.parse({
      body: { societyId: TEST_IDS.societyId },
    });
    expect(result.body.refundLatestPayment).toBe(true);
  });

  it("requires uuid for billing overview path params", () => {
    const result = getSocietyBillingOverviewValidationSchema.safeParse({
      params: { societyId: "abc" },
    });
    expect(result.success).toBe(false);
  });
});
