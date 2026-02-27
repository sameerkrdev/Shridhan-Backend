import { z } from "zod";

export const createFirstMemberValidationSchema = z.object({
  body: z.object({
    name: z.string().min(2, "Name is too short"),
    phone: z.string().min(10, "Phone is required"),
    email: z.email("Invalid email"),
    // TODO: remove the role
    role: z.string(),
  }),
});

export type CreateFirstMemberValidationSchema = z.infer<typeof createFirstMemberValidationSchema>;

export const loginValidationSchema = z.object({
  body: z.object({
    phone: z.string().min(10, "Phone is required"),
  }),
});

export type LoginValidationSchema = z.infer<typeof loginValidationSchema>;

export const refreshValidationSchema = z.object({
  body: z.object({
    refreshToken: z.string().min(1, "Refresh token is required").optional(),
  }),
});

export type RefreshValidationSchema = z.infer<typeof refreshValidationSchema>;

export const memberExistsValidationSchema = z.object({
  body: z.object({
    phone: z.string().min(10, "Phone is required"),
  }),
});

export type MemberExistsValidationSchema = z.infer<typeof memberExistsValidationSchema>;
