import { z } from "zod";

export const createFirstMemberValidationSchema = z.object({
  body: z.object({
    name: z.string().min(2, "Name is too short"),
    phoneNumber: z.string().min(10, "Phone is required"),
    email: z.email("Invalid email"),
  }),
});

export type CreateFirstMemberValidationSchema = z.infer<typeof createFirstMemberValidationSchema>;
