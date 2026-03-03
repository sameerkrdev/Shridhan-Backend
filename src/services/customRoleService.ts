import prisma from "@/config/prisma.js";
import logger from "@/config/logger.js";
import type { Prisma } from "@/generated/prisma/client.js";
import createHttpError from "http-errors";
import { AVAILABLE_PERMISSION_KEYS, PERMISSION_CATALOG } from "@/constants/permissionCatalog.js";

const normalizeRoleName = (value: string) => value.trim();

const validatePermissions = (permissions: string[]) => {
  if (!permissions.length) {
    throw createHttpError(400, "At least one permission is required");
  }

  for (const permission of permissions) {
    if (!AVAILABLE_PERMISSION_KEYS.includes(permission)) {
      throw createHttpError(400, `Invalid permission: ${permission}`);
    }
  }
};

export const listSocietyCustomRoles = async (societyId: string) => {
  return prisma.societyRole.findMany({
    where: { societyId, isSystem: false },
    orderBy: { createdAt: "asc" },
  });
};

export const getSocietyRolePermissionMatrix = async (societyId: string) => {
  const [roles, memberships] = await Promise.all([
    prisma.societyRole.findMany({
      where: { societyId },
      orderBy: { createdAt: "asc" },
    }),
    prisma.membership.findMany({
      where: { societyId, deletedAt: null },
      select: { roleId: true },
    }),
  ]);
  const assignmentCountByRole = memberships.reduce<Record<string, number>>((acc, membership) => {
    acc[membership.roleId] = (acc[membership.roleId] ?? 0) + 1;
    return acc;
  }, {});

  return {
    permissionKeys: AVAILABLE_PERMISSION_KEYS,
    permissionCatalog: PERMISSION_CATALOG,
    roles: roles.map((role) => ({
      id: role.id,
      key: role.id,
      name: role.name,
      source: "db" as const,
      editable: role.name !== "OWNER",
      permissions: role.permissions,
      assignmentCount: assignmentCountByRole[role.id] ?? 0,
    })),
  };
};

export const createSocietyCustomRole = async (
  actor: Prisma.MembershipModel,
  payload: { name: string; description?: string; permissions: string[] },
) => {
  const roleName = normalizeRoleName(payload.name);
  if (!roleName) {
    throw createHttpError(400, "Role name is required");
  }
  const duplicate = await prisma.societyRole.findFirst({
    where: { societyId: actor.societyId, name: roleName },
    select: { id: true },
  });
  if (duplicate) {
    throw createHttpError(409, "Role name already exists in this society");
  }

  validatePermissions(payload.permissions);
  const normalizedPermissions = Array.from(new Set(payload.permissions));

  const role = await prisma.societyRole.create({
    data: {
      societyId: actor.societyId,
      name: roleName,
      permissions: normalizedPermissions,
      isSystem: false,
    },
  });

  logger.info({
    message: "Society custom role created",
    societyId: actor.societyId,
    roleId: role.id,
    actorUserId: actor.userId,
  });

  return role;
};

export const updateRolePermissions = async (
  actor: Prisma.MembershipModel,
  roleKey: string,
  permissions: string[],
) => {
  validatePermissions(permissions);
  const normalizedPermissions = Array.from(new Set(permissions));

  const targetRole = await prisma.societyRole.findFirst({
    where: { id: roleKey, societyId: actor.societyId },
    select: { id: true, name: true, isSystem: true },
  });
  if (!targetRole) {
    throw createHttpError(404, "Role not found");
  }
  if (targetRole.name === "OWNER") {
    const actorRole = await prisma.societyRole.findUnique({
      where: { id: actor.roleId },
      select: { name: true },
    });
    if (actorRole?.name !== "OWNER") {
      throw createHttpError(403, "Only owner can edit owner role");
    }
  }
  await prisma.societyRole.update({
    where: { id: targetRole.id },
    data: { permissions: normalizedPermissions },
  });

  logger.info({
    message: "Role permissions updated",
    societyId: actor.societyId,
    actorUserId: actor.userId,
    roleKey,
  });

  return {
    key: targetRole.id,
    permissions: normalizedPermissions,
  };
};

export const updateSocietyCustomRole = async (
  actor: Prisma.MembershipModel,
  roleId: string,
  payload: { name: string; description?: string; permissions: string[] },
) => {
  const existingRole = await prisma.societyRole.findFirst({
    where: { id: roleId, societyId: actor.societyId },
  });
  if (!existingRole) {
    throw createHttpError(404, "Custom role not found");
  }

  const roleName = normalizeRoleName(payload.name);
  if (!roleName) throw createHttpError(400, "Role name is required");
  if (existingRole.isSystem && existingRole.name !== roleName) {
    throw createHttpError(400, "This role name is reserved");
  }
  const duplicate = await prisma.societyRole.findFirst({
    where: {
      societyId: actor.societyId,
      name: roleName,
      id: { not: existingRole.id },
    },
    select: { id: true },
  });
  if (duplicate) {
    throw createHttpError(409, "Role name already exists in this society");
  }

  validatePermissions(payload.permissions);
  const normalizedPermissions = Array.from(new Set(payload.permissions));

  const updatedRole = await prisma.societyRole.update({
    where: { id: existingRole.id },
    data: {
      name: roleName,
      permissions: normalizedPermissions,
    },
  });

  logger.info({
    message: "Society custom role updated",
    societyId: actor.societyId,
    roleId: updatedRole.id,
    actorUserId: actor.userId,
  });

  return updatedRole;
};

export const deleteSocietyCustomRole = async (actor: Prisma.MembershipModel, roleId: string) => {
  const role = await prisma.societyRole.findFirst({
    where: { id: roleId, societyId: actor.societyId },
    select: { id: true, name: true, isSystem: true },
  });

  if (!role) {
    throw createHttpError(404, "Custom role not found");
  }
  if (role.isSystem) {
    throw createHttpError(400, "System roles cannot be deleted");
  }

  const assignmentCount = await prisma.membership.count({
    where: { roleId: role.id, deletedAt: null },
  });
  if (assignmentCount > 0) {
    throw createHttpError(400, "Cannot delete role with active members");
  }

  await prisma.societyRole.delete({ where: { id: role.id } });

  logger.info({
    message: "Society custom role deleted",
    societyId: actor.societyId,
    roleId: role.id,
    actorUserId: actor.userId,
  });
};

export const assignSocietyCustomRole = async (
  actor: Prisma.MembershipModel,
  roleId: string,
  membershipId: string,
) => {
  const role = await prisma.societyRole.findFirst({
    where: { id: roleId, societyId: actor.societyId },
  });
  if (!role) throw createHttpError(404, "Custom role not found");

  const membership = await prisma.membership.findFirst({
    where: { id: membershipId, societyId: actor.societyId, deletedAt: null },
  });
  if (!membership) throw createHttpError(404, "Membership not found");

  const assignment = await prisma.membership.update({
    where: { id: membership.id },
    data: { roleId: role.id },
  });

  logger.info({
    message: "Society custom role assigned",
    societyId: actor.societyId,
    roleId: role.id,
    membershipId: membership.id,
    actorUserId: actor.userId,
  });

  return assignment;
};

export const unassignSocietyCustomRole = async (
  actor: Prisma.MembershipModel,
  roleId: string,
  membershipId: string,
) => {
  const role = await prisma.societyRole.findFirst({
    where: { id: roleId, societyId: actor.societyId },
  });
  if (!role) throw createHttpError(404, "Custom role not found");

  const membership = await prisma.membership.findFirst({
    where: { id: membershipId, societyId: actor.societyId, deletedAt: null },
    select: { id: true },
  });
  if (!membership) throw createHttpError(404, "Membership not found");

  const fallbackRole = await prisma.societyRole.findFirst({
    where: { societyId: actor.societyId, name: "MEMBER" },
    select: { id: true },
  });
  if (!fallbackRole) {
    throw createHttpError(500, "Fallback role not configured");
  }
  await prisma.membership.update({
    where: { id: membership.id },
    data: { roleId: fallbackRole.id },
  });

  logger.info({
    message: "Society custom role unassigned",
    societyId: actor.societyId,
    roleId: role.id,
    membershipId: membership.id,
    actorUserId: actor.userId,
  });
};
