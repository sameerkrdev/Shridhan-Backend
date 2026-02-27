import prisma from "@/config/prisma.js";
import logger from "@/config/logger.js";
import type { Prisma } from "@/generated/prisma/client.js";
import createHttpError from "http-errors";
import { randomUUID } from "node:crypto";
import {
  assignPermitRoleToMember,
  checkPermitPermission,
  deletePermitRole,
  ensurePermitTenant,
  syncSocietyResourceActions,
  toPermitRoleKey,
  toPermitUserKey,
  unassignPermitRoleFromMember,
  upsertPermitRole,
} from "@/services/permitAbacService.js";

const assertMemberSociety = (member: Prisma.MemberModel) => {
  if (!member.societyId) {
    throw createHttpError(400, "Selected society context is missing");
  }

  return member.societyId;
};

const ensureMemberPermitKey = async (member: Prisma.MemberModel) => {
  if (member.permitUserKey) {
    return member.permitUserKey;
  }

  const permitUserKey = toPermitUserKey(member);
  await prisma.member.update({
    where: { id: member.id },
    data: { permitUserKey },
  });
  return permitUserKey;
};

const getRolePermissionNames = async (roleId: string) => {
  const mappings = await prisma.societyRolePermission.findMany({
    where: { roleId },
    include: { permission: true },
  });

  return mappings.map((mapping) => mapping.permission.name);
};

const syncResourceActionsForSociety = async (societyId: string) => {
  const permissions = await prisma.societyPermission.findMany({
    where: { societyId },
    select: { name: true },
  });

  await syncSocietyResourceActions(permissions.map((permission) => permission.name));
};

const syncRoleToPermit = async (societyId: string, roleId: string) => {
  const role = await prisma.societyRole.findUnique({
    where: { id: roleId },
  });

  if (!role) {
    throw createHttpError(404, "Role not found");
  }

  const permissionNames = await getRolePermissionNames(roleId);
  await upsertPermitRole(societyId, role.permitRoleKey, role.name, permissionNames);
};

const syncSuperAdminRoleToPermit = async (societyId: string) => {
  const superAdminRole = await prisma.societyRole.findFirst({
    where: {
      societyId,
      name: "SUPER_ADMIN",
    },
  });

  if (!superAdminRole) {
    return;
  }

  const allPermissionNames = await prisma.societyPermission.findMany({
    where: { societyId },
    select: { name: true },
  });

  await upsertPermitRole(
    societyId,
    superAdminRole.permitRoleKey,
    superAdminRole.name,
    allPermissionNames.map((permission) => permission.name),
  );
};

const countSuperAdminAssignments = async (societyId: string) => {
  return prisma.societyMemberRole.count({
    where: {
      role: {
        societyId,
        name: "SUPER_ADMIN",
      },
    },
  });
};

const ensurePermissionsBelongToSociety = async (societyId: string, permissionIds: string[]) => {
  if (!permissionIds.length) {
    return;
  }

  const count = await prisma.societyPermission.count({
    where: {
      id: { in: permissionIds },
      societyId,
    },
  });

  if (count !== permissionIds.length) {
    throw createHttpError(400, "One or more permissions are invalid for this society");
  }
};

export const bootstrapSocietyAccessControl = async (
  society: { id: string; name: string },
  creatorMembership: Prisma.MemberModel,
) => {
  const permitTenantKey = await ensurePermitTenant(society.id, society.name);
  const creatorPermitKey = await ensureMemberPermitKey(creatorMembership);

  const role = await prisma.$transaction(async (tx) => {
    const updatedSociety = await tx.society.update({
      where: { id: society.id },
      data: { permitTenantKey },
    });

    const existingRole = await tx.societyRole.findFirst({
      where: { societyId: society.id, name: "SUPER_ADMIN" },
    });

    const superAdminRole =
      existingRole ??
      (await tx.societyRole.create({
        data: {
          societyId: society.id,
          name: "SUPER_ADMIN",
          description: "Bootstrap role with full access",
          isSystem: true,
          permitRoleKey: toPermitRoleKey("SUPER_ADMIN", randomUUID()),
          createdBy: creatorMembership.id,
        },
      }));

    await tx.societyMemberRole.upsert({
      where: {
        memberId_roleId: {
          memberId: creatorMembership.id,
          roleId: superAdminRole.id,
        },
      },
      create: {
        memberId: creatorMembership.id,
        roleId: superAdminRole.id,
      },
      update: {},
    });

    await tx.member.update({
      where: { id: creatorMembership.id },
      data: { role: "SUPER_ADMIN" },
    });

    logger.info({
      message: "Society bootstrap role persisted",
      societyId: updatedSociety.id,
      roleId: superAdminRole.id,
      memberId: creatorMembership.id,
    });

    return superAdminRole;
  });

  await upsertPermitRole(society.id, role.permitRoleKey, role.name, []);
  await assignPermitRoleToMember(society.id, role.permitRoleKey, creatorPermitKey);
};

export const listPermissions = async (actor: Prisma.MemberModel) => {
  const societyId = assertMemberSociety(actor);
  return prisma.societyPermission.findMany({
    where: { societyId },
    orderBy: { createdAt: "desc" },
  });
};

export const createPermission = async (
  actor: Prisma.MemberModel,
  payload: { name: string; description?: string | undefined },
) => {
  const societyId = assertMemberSociety(actor);

  const existing = await prisma.societyPermission.findFirst({
    where: { societyId, name: payload.name },
  });
  if (existing) {
    throw createHttpError(400, "Permission already exists in this society");
  }

  const permission = await prisma.societyPermission.create({
    data: {
      societyId,
      name: payload.name,
      ...(payload.description !== undefined && { description: payload.description }),
      permitPermissionKey: `permission:${randomUUID()}`,
      createdBy: actor.id,
      updatedBy: actor.id,
    },
  });

  try {
    await syncResourceActionsForSociety(societyId);
    await syncSuperAdminRoleToPermit(societyId);
  } catch (error) {
    await prisma.societyPermission.delete({ where: { id: permission.id } });
    throw error;
  }

  logger.info({
    message: "Society permission created",
    societyId,
    actorId: actor.id,
    permissionId: permission.id,
    permissionName: permission.name,
  });

  return permission;
};

export const updatePermission = async (
  actor: Prisma.MemberModel,
  permissionId: string,
  payload: { name?: string | undefined; description?: string | undefined },
) => {
  const societyId = assertMemberSociety(actor);

  const permission = await prisma.societyPermission.findFirst({
    where: { id: permissionId, societyId },
  });
  if (!permission) {
    throw createHttpError(404, "Permission not found");
  }

  if (payload.name && payload.name !== permission.name) {
    const existing = await prisma.societyPermission.findFirst({
      where: {
        societyId,
        name: payload.name,
      },
    });
    if (existing) {
      throw createHttpError(400, "Permission already exists in this society");
    }
  }

  const updatedPermission = await prisma.societyPermission.update({
    where: { id: permission.id },
    data: {
      ...(payload.name !== undefined && { name: payload.name }),
      ...(payload.description !== undefined && { description: payload.description }),
      updatedBy: actor.id,
    },
  });

  await syncResourceActionsForSociety(societyId);
  await syncSuperAdminRoleToPermit(societyId);

  const relatedRoleIds = await prisma.societyRolePermission.findMany({
    where: { permissionId: permission.id },
    select: { roleId: true },
  });

  await Promise.all(relatedRoleIds.map((relation) => syncRoleToPermit(societyId, relation.roleId)));

  logger.info({
    message: "Society permission updated",
    societyId,
    actorId: actor.id,
    permissionId: permission.id,
  });

  return updatedPermission;
};

export const deletePermission = async (actor: Prisma.MemberModel, permissionId: string) => {
  const societyId = assertMemberSociety(actor);

  const permission = await prisma.societyPermission.findFirst({
    where: { id: permissionId, societyId },
  });
  if (!permission) {
    throw createHttpError(404, "Permission not found");
  }

  const relatedRoleIds = await prisma.societyRolePermission.findMany({
    where: { permissionId: permission.id },
    select: { roleId: true },
  });

  await prisma.societyPermission.delete({
    where: { id: permission.id },
  });

  await syncResourceActionsForSociety(societyId);
  await syncSuperAdminRoleToPermit(societyId);
  await Promise.all(relatedRoleIds.map((relation) => syncRoleToPermit(societyId, relation.roleId)));

  logger.info({
    message: "Society permission deleted",
    societyId,
    actorId: actor.id,
    permissionId: permission.id,
  });
};

export const listRoles = async (actor: Prisma.MemberModel) => {
  const societyId = assertMemberSociety(actor);
  return prisma.societyRole.findMany({
    where: { societyId },
    include: {
      permissions: {
        include: {
          permission: true,
        },
      },
      members: {
        include: {
          member: {
            select: {
              id: true,
              name: true,
              phone: true,
              email: true,
            },
          },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });
};

export const createRole = async (
  actor: Prisma.MemberModel,
  payload: { name: string; description?: string | undefined; permissionIds: string[] },
) => {
  const societyId = assertMemberSociety(actor);
  await ensurePermissionsBelongToSociety(societyId, payload.permissionIds);

  const existingRole = await prisma.societyRole.findFirst({
    where: { societyId, name: payload.name },
  });
  if (existingRole) {
    throw createHttpError(400, "Role already exists in this society");
  }

  const role = await prisma.$transaction(async (tx) => {
    const createdRole = await tx.societyRole.create({
      data: {
        societyId,
        name: payload.name,
        ...(payload.description !== undefined && { description: payload.description }),
        isSystem: false,
        permitRoleKey: toPermitRoleKey(payload.name, randomUUID()),
        createdBy: actor.id,
        updatedBy: actor.id,
      },
    });

    if (payload.permissionIds.length) {
      await tx.societyRolePermission.createMany({
        data: payload.permissionIds.map((permissionId) => ({
          roleId: createdRole.id,
          permissionId,
        })),
      });
    }

    return createdRole;
  });

  await syncRoleToPermit(societyId, role.id);

  logger.info({
    message: "Society role created",
    societyId,
    actorId: actor.id,
    roleId: role.id,
  });

  return role;
};

export const updateRole = async (
  actor: Prisma.MemberModel,
  roleId: string,
  payload: {
    name?: string | undefined;
    description?: string | undefined;
    permissionIds?: string[] | undefined;
  },
) => {
  const societyId = assertMemberSociety(actor);
  const role = await prisma.societyRole.findFirst({
    where: { id: roleId, societyId },
  });

  if (!role) {
    throw createHttpError(404, "Role not found");
  }

  if (role.name === "SUPER_ADMIN" && payload.permissionIds) {
    throw createHttpError(400, "SUPER_ADMIN permissions cannot be modified");
  }

  if (payload.name && payload.name !== role.name) {
    const existing = await prisma.societyRole.findFirst({
      where: {
        societyId,
        name: payload.name,
      },
    });
    if (existing) {
      throw createHttpError(400, "Role already exists in this society");
    }
  }

  if (payload.permissionIds) {
    await ensurePermissionsBelongToSociety(societyId, payload.permissionIds);
  }

  const updatedRole = await prisma.$transaction(async (tx) => {
    const roleData = await tx.societyRole.update({
      where: { id: role.id },
      data: {
        ...(payload.name !== undefined && { name: payload.name }),
        ...(payload.description !== undefined && { description: payload.description }),
        updatedBy: actor.id,
      },
    });

    if (payload.permissionIds) {
      await tx.societyRolePermission.deleteMany({
        where: { roleId: role.id },
      });

      if (payload.permissionIds.length) {
        await tx.societyRolePermission.createMany({
          data: payload.permissionIds.map((permissionId) => ({
            roleId: role.id,
            permissionId,
          })),
        });
      }
    }

    return roleData;
  });

  await syncRoleToPermit(societyId, role.id);

  logger.info({
    message: "Society role updated",
    societyId,
    actorId: actor.id,
    roleId: role.id,
  });

  return updatedRole;
};

export const deleteRole = async (actor: Prisma.MemberModel, roleId: string) => {
  const societyId = assertMemberSociety(actor);
  const role = await prisma.societyRole.findFirst({
    where: { id: roleId, societyId },
  });
  if (!role) {
    throw createHttpError(404, "Role not found");
  }
  if (role.name === "SUPER_ADMIN") {
    throw createHttpError(400, "SUPER_ADMIN role cannot be deleted");
  }

  const assignments = await prisma.societyMemberRole.findMany({
    where: { roleId: role.id },
    include: { member: true },
  });

  await Promise.all(
    assignments.map(async (assignment) => {
      const permitUserKey = await ensureMemberPermitKey(assignment.member);
      await unassignPermitRoleFromMember(societyId, role.permitRoleKey, permitUserKey);
    }),
  );

  await deletePermitRole(societyId, role.permitRoleKey);

  await prisma.societyRole.delete({
    where: { id: role.id },
  });

  logger.info({
    message: "Society role deleted",
    societyId,
    actorId: actor.id,
    roleId: role.id,
  });
};

export const setRolePermissions = async (
  actor: Prisma.MemberModel,
  roleId: string,
  permissionIds: string[],
) => {
  const societyId = assertMemberSociety(actor);
  const role = await prisma.societyRole.findFirst({
    where: { id: roleId, societyId },
  });
  if (!role) {
    throw createHttpError(404, "Role not found");
  }
  if (role.name === "SUPER_ADMIN") {
    throw createHttpError(400, "SUPER_ADMIN permissions cannot be modified");
  }

  await ensurePermissionsBelongToSociety(societyId, permissionIds);

  await prisma.$transaction(async (tx) => {
    await tx.societyRolePermission.deleteMany({
      where: { roleId: role.id },
    });

    if (permissionIds.length) {
      await tx.societyRolePermission.createMany({
        data: permissionIds.map((permissionId) => ({
          roleId: role.id,
          permissionId,
        })),
      });
    }
  });

  await syncRoleToPermit(societyId, role.id);

  logger.info({
    message: "Role permission mapping updated",
    societyId,
    actorId: actor.id,
    roleId: role.id,
  });
};

export const listSocietyMembersWithRoles = async (actor: Prisma.MemberModel) => {
  const societyId = assertMemberSociety(actor);

  return prisma.member.findMany({
    where: { societyId },
    include: {
      assignedRoles: {
        include: {
          role: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });
};

export const assignRoleToMember = async (
  actor: Prisma.MemberModel,
  payload: { memberId: string; roleId: string },
) => {
  const societyId = assertMemberSociety(actor);
  const [member, role] = await Promise.all([
    prisma.member.findFirst({ where: { id: payload.memberId, societyId } }),
    prisma.societyRole.findFirst({ where: { id: payload.roleId, societyId } }),
  ]);

  if (!member || !role) {
    throw createHttpError(404, "Member or role not found");
  }

  const assignment = await prisma.societyMemberRole.upsert({
    where: {
      memberId_roleId: {
        memberId: member.id,
        roleId: role.id,
      },
    },
    create: {
      memberId: member.id,
      roleId: role.id,
    },
    update: {},
  });

  const permitUserKey = await ensureMemberPermitKey(member);
  await assignPermitRoleToMember(societyId, role.permitRoleKey, permitUserKey);

  logger.info({
    message: "Role assigned to member",
    societyId,
    actorId: actor.id,
    memberId: member.id,
    roleId: role.id,
  });

  return assignment;
};

export const removeRoleFromMember = async (
  actor: Prisma.MemberModel,
  payload: { memberId: string; roleId: string },
) => {
  const societyId = assertMemberSociety(actor);
  const assignment = await prisma.societyMemberRole.findFirst({
    where: {
      memberId: payload.memberId,
      roleId: payload.roleId,
      role: { societyId },
      member: { societyId },
    },
    include: {
      role: true,
      member: true,
    },
  });

  if (!assignment) {
    throw createHttpError(404, "Role assignment not found");
  }

  if (assignment.role.name === "SUPER_ADMIN") {
    const superAdminCount = await countSuperAdminAssignments(societyId);
    if (superAdminCount <= 1) {
      throw createHttpError(400, "Cannot remove last SUPER_ADMIN from society");
    }
  }

  await prisma.societyMemberRole.delete({
    where: { id: assignment.id },
  });

  const permitUserKey = await ensureMemberPermitKey(assignment.member);
  await unassignPermitRoleFromMember(societyId, assignment.role.permitRoleKey, permitUserKey);

  logger.info({
    message: "Role removed from member",
    societyId,
    actorId: actor.id,
    memberId: assignment.memberId,
    roleId: assignment.roleId,
  });
};

export const hasMemberPermission = async (actor: Prisma.MemberModel, permissionName: string) => {
  const societyId = assertMemberSociety(actor);
  const permitUserKey = await ensureMemberPermitKey(actor);
  return checkPermitPermission(societyId, permitUserKey, permissionName);
};
