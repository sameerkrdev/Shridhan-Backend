import { z } from "zod";

export const updateUserProfileValidationSchema = z.object({
  body: z.object({
    name: z.string().min(2, "Name is too short").optional(),
    phone: z.string().min(10, "Phone is required").optional(),
    avatar: z.string().url("Invalid avatar URL").optional(),
  }),
});

export type UpdateUserProfileValidationSchema = z.infer<typeof updateUserProfileValidationSchema>;
