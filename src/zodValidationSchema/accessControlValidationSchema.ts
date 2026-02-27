import { z } from "zod";

const nameSchema = z
  .string()
  .trim()
  .min(3, "Name is too short")
  .max(80, "Name is too long")
  .regex(/^[a-z][a-z0-9_]*$/, "Name must be snake_case");

export const createPermissionValidationSchema = z.object({
  body: z.object({
    name: nameSchema,
    description: z.string().trim().max(300).optional(),
  }),
});

export const updatePermissionValidationSchema = z.object({
  body: z.object({
    name: nameSchema.optional(),
    description: z.string().trim().max(300).optional(),
  }),
});

export const createRoleValidationSchema = z.object({
  body: z.object({
    name: nameSchema,
    description: z.string().trim().max(300).optional(),
    permissionIds: z.array(z.uuid()).default([]),
  }),
});

export const updateRoleValidationSchema = z.object({
  body: z.object({
    name: nameSchema.optional(),
    description: z.string().trim().max(300).optional(),
    permissionIds: z.array(z.uuid()).optional(),
  }),
});

export const rolePermissionMapValidationSchema = z.object({
  body: z.object({
    permissionIds: z.array(z.uuid()),
  }),
});

export const assignMemberRoleValidationSchema = z.object({
  body: z.object({
    memberId: z.uuid(),
    roleId: z.uuid(),
  }),
});

export const removeMemberRoleValidationSchema = z.object({
  body: z.object({
    memberId: z.uuid(),
    roleId: z.uuid(),
  }),
});

export type CreatePermissionValidationSchema = z.infer<typeof createPermissionValidationSchema>;
export type UpdatePermissionValidationSchema = z.infer<typeof updatePermissionValidationSchema>;
export type CreateRoleValidationSchema = z.infer<typeof createRoleValidationSchema>;
export type UpdateRoleValidationSchema = z.infer<typeof updateRoleValidationSchema>;
export type RolePermissionMapValidationSchema = z.infer<typeof rolePermissionMapValidationSchema>;
export type AssignMemberRoleValidationSchema = z.infer<typeof assignMemberRoleValidationSchema>;
export type RemoveMemberRoleValidationSchema = z.infer<typeof removeMemberRoleValidationSchema>;
