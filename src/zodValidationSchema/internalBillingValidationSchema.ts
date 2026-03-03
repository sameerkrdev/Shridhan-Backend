import { z } from "zod";

export const updateSocietyBillingPolicyValidationSchema = z.object({
  params: z.object({
    societyId: z.uuid(),
  }),
  body: z.object({
    developerOverrideEnabled: z.boolean().optional(),
    setupFeeEnabled: z.boolean().optional(),
    setupFeeAmount: z.number().positive().optional(),
    customOneTimeFeeEnabled: z.boolean().optional(),
    customOneTimeFeeAmount: z.number().positive().optional(),
    customOneTimeFeeWaived: z.boolean().optional(),
    customSubscriptionEnabled: z.boolean().optional(),
    customSubscriptionPlanId: z.string().min(1).optional(),
    customSubscriptionAmount: z.number().positive().optional(),
    customSubscriptionWaived: z.boolean().optional(),
    setByDeveloperId: z.string().min(1),
    setReason: z.string().min(3),
  }),
});

export type UpdateSocietyBillingPolicyValidationSchema = z.infer<
  typeof updateSocietyBillingPolicyValidationSchema
>;
