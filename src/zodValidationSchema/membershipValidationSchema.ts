import { z } from "zod";

const membershipStatusEnum = z.enum(["active", "suspended"]);
const idSchema = z.string().min(1, "Invalid id");

const customRoleBodySchema = z.object({
  name: z.string().min(2, "Role name is required").max(50),
  permissions: z.array(z.string().min(1)).min(1, "At least one permission is required"),
});

export const searchUserValidationSchema = z.object({
  body: z.object({
    query: z.string().min(1, "Search query is required"),
  }),
});

export const listMembersValidationSchema = z.object({
  query: z.object({
    includeDeleted: z.enum(["true", "false"]).optional().default("false"),
  }),
});

export const addMemberValidationSchema = z.object({
  body: z.object({
    userId: idSchema.optional(),
    emailOrPhone: z.string().optional(),
    name: z.string().min(2).optional(),
    email: z.email("Invalid email"),
    phone: z.string().min(10).optional(),
    roleId: idSchema,
  }),
});

export const updateRoleValidationSchema = z.object({
  body: z.object({
    roleId: idSchema,
  }),
});

export const updateStatusValidationSchema = z.object({
  body: z.object({
    status: membershipStatusEnum,
  }),
});

export const createCustomRoleValidationSchema = z.object({
  body: customRoleBodySchema,
});

export const updateCustomRoleValidationSchema = z.object({
  body: customRoleBodySchema,
});

export const assignCustomRoleValidationSchema = z.object({
  body: z.object({
    membershipId: idSchema,
  }),
});

export const updateMatrixRolePermissionsValidationSchema = z.object({
  body: z.object({
    permissions: z.array(z.string().min(1)).min(1, "At least one permission is required"),
  }),
});

export type SearchUserValidationSchema = z.infer<typeof searchUserValidationSchema>;
export type ListMembersValidationSchema = z.infer<typeof listMembersValidationSchema>;
export type AddMemberValidationSchema = z.infer<typeof addMemberValidationSchema>;
export type UpdateRoleValidationSchema = z.infer<typeof updateRoleValidationSchema>;
export type UpdateStatusValidationSchema = z.infer<typeof updateStatusValidationSchema>;
export type CreateCustomRoleValidationSchema = z.infer<typeof createCustomRoleValidationSchema>;
export type UpdateCustomRoleValidationSchema = z.infer<typeof updateCustomRoleValidationSchema>;
export type AssignCustomRoleValidationSchema = z.infer<typeof assignCustomRoleValidationSchema>;
export type UpdateMatrixRolePermissionsValidationSchema = z.infer<
  typeof updateMatrixRolePermissionsValidationSchema
>;
