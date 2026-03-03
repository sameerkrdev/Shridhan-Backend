import { z } from "zod";

export const createFirstUserValidationSchema = z.object({
  body: z.object({
    name: z.string().min(2, "Name is too short"),
    phone: z.string().min(10, "Phone is required"),
    email: z.email("Invalid email"),
  }),
});

export type CreateFirstUserValidationSchema = z.infer<typeof createFirstUserValidationSchema>;

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

export const userExistsValidationSchema = z.object({
  body: z.object({
    phone: z.string().min(10, "Phone is required"),
  }),
});

export type UserExistsValidationSchema = z.infer<typeof userExistsValidationSchema>;
