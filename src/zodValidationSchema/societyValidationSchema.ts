import { z } from "zod";

export const onboardSocietyValidationSchema = z.object({
  body: z.object({
    name: z.string().min(2, "Name is too short"),
    subDomainName: z
      .string()
      .min(3, "Subdomain must be at least 3 characters")
      .regex(/^[a-z0-9-]+$/, "Invalid subdomain format"),
    country: z.string().min(2, "Country is required"),
    state: z.string().min(2, "State is required"),
    city: z.string().min(2, "City is required"),
    zipcode: z.string().min(4, "Zip code is too short").max(10, "Zip code is too long"),
    logoUrl: z.url("Invalid logo URL"),
  }),
});

export type OnboardSocietyValidationSchema = z.infer<typeof onboardSocietyValidationSchema>;

export const resolveMemberSocietyValidationSchema = z.object({
  body: z.object({
    societyId: z.uuid(),
  }),
});

export type ResolveMemberSocietyValidationSchema = z.infer<
  typeof resolveMemberSocietyValidationSchema
>;

export const setupSubscriptionValidationSchema = z.object({
  body: z.object({
    societyId: z.uuid(),
  }),
});

export type SetupSubscriptionValidationSchema = z.infer<typeof setupSubscriptionValidationSchema>;

export const cancelSubscriptionValidationSchema = z.object({
  body: z.object({
    societyId: z.uuid(),
    refundLatestPayment: z.boolean().optional().default(true),
  }),
});

export type CancelSubscriptionValidationSchema = z.infer<typeof cancelSubscriptionValidationSchema>;

export const getSocietyBillingOverviewValidationSchema = z.object({
  params: z.object({
    societyId: z.uuid(),
  }),
});

export type GetSocietyBillingOverviewValidationSchema = z.infer<
  typeof getSocietyBillingOverviewValidationSchema
>;
