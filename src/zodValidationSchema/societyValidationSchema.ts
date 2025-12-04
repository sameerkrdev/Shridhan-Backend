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
    // TODO: remove the createdBy
    createdBy: z.uuid(),
  }),
});

export type OnboardSocietyValidationSchema = z.infer<typeof onboardSocietyValidationSchema>;
