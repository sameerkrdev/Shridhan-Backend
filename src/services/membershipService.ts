import prisma from "@/config/prisma.js";
import logger from "@/config/logger.js";
import type { Prisma } from "@/generated/prisma/client.js";
import createHttpError from "http-errors";

const assertMembership = (req: { membership?: Prisma.MembershipModel }) => {
  if (!req.membership) {
    throw createHttpError(400, "Society context is missing. Provide x-society-id header.");
  }
  return req.membership;
};

const isSubset = (candidate: string[], source: string[]) => {
  const sourceSet = new Set(source);
  return candidate.every((permission) => sourceSet.has(permission));
};

const getMembershipWithRole = async (membershipId: string) => {
  const membership = await prisma.membership.findUnique({
    where: { id: membershipId },
    include: {
      role: { select: { id: true, name: true, permissions: true, isSystem: true } },
    },
  });
  if (!membership) throw createHttpError(404, "Membership not found");
  return membership;
};

const getActiveOwnerCount = async (societyId: string) => {
  return prisma.membership.count({
    where: {
      societyId,
      deletedAt: null,
      role: { name: "OWNER" },
    },
  });
};

export const searchGlobalUser = async (query: string) => {
  const user = await prisma.user.findFirst({
    where: {
      OR: [{ email: query }, { phone: query }],
    },
    select: { id: true, name: true, email: true, phone: true, avatar: true },
  });

  return user;
};

export const addMemberToSociety = async (
  actor: Prisma.MembershipModel,
  payload: {
    emailOrPhone?: string;
    userId?: string;
    name?: string;
    email: string;
    phone?: string;
    roleId: string;
  },
) => {
  const [actorMembership, targetRole] = await Promise.all([
    getMembershipWithRole(actor.id),
    prisma.societyRole.findFirst({
      where: { id: payload.roleId, societyId: actor.societyId },
    }),
  ]);
  if (!targetRole) {
    throw createHttpError(400, "Invalid role for selected society");
  }
  if (!isSubset(targetRole.permissions, actorMembership.role.permissions)) {
    throw createHttpError(403, "You cannot assign a role with higher permissions than your own");
  }

  let userId = payload.userId;

  if (!userId && payload.emailOrPhone) {
    const existing = await prisma.user.findFirst({
      where: { OR: [{ email: payload.emailOrPhone }, { phone: payload.emailOrPhone }] },
    });
    if (existing) {
      userId = existing.id;
    }
  }

  if (!userId) {
    if (!payload.name || !payload.phone || !payload.email) {
      throw createHttpError(400, "Name, email and phone are required to create a new user");
    }

    const existingByPhone = await prisma.user.findUnique({ where: { phone: payload.phone } });
    if (existingByPhone) {
      userId = existingByPhone.id;
    } else {
      const newUser = await prisma.user.create({
        data: {
          name: payload.name,
          phone: payload.phone,
          email: payload.email,
        },
      });
      userId = newUser.id;
    }
  }

  const existingMembership = await prisma.membership.findUnique({
    where: { userId_societyId: { userId, societyId: actor.societyId } },
  });

  if (existingMembership && !existingMembership.deletedAt) {
    throw createHttpError(400, "User is already a member of this society");
  }

  const membership = existingMembership
    ? await prisma.membership.update({
        where: { id: existingMembership.id },
        data: {
          roleId: payload.roleId,
          status: "active",
          deletedAt: null,
        },
      })
    : await prisma.membership.create({
        data: {
          userId,
          societyId: actor.societyId,
          roleId: payload.roleId,
          status: "active",
        },
      });

  logger.info({
    message: "Member added to society",
    societyId: actor.societyId,
    actorUserId: actor.userId,
    targetUserId: userId,
    roleId: payload.roleId,
  });

  return prisma.membership.findUniqueOrThrow({
    where: { id: membership.id },
    include: {
      user: { select: { id: true, name: true, email: true, phone: true, avatar: true } },
      role: { select: { id: true, name: true, permissions: true, isSystem: true } },
    },
  });
};

export const listSocietyMembers = async (societyId: string, includeDeleted = false) => {
  return prisma.membership.findMany({
    where: includeDeleted ? { societyId } : { societyId, deletedAt: null },
    include: {
      user: { select: { id: true, name: true, email: true, phone: true, avatar: true } },
      role: { select: { id: true, name: true, permissions: true, isSystem: true } },
    },
    orderBy: { joinedAt: "asc" },
  });
};

export const getMembershipDetail = async (membershipId: string, societyId: string) => {
  const membership = await prisma.membership.findFirst({
    where: { id: membershipId, societyId, deletedAt: null },
    include: {
      user: { select: { id: true, name: true, email: true, phone: true, avatar: true } },
      role: { select: { id: true, name: true, permissions: true, isSystem: true } },
    },
  });

  if (!membership) {
    throw createHttpError(404, "Membership not found");
  }

  return membership;
};

export const updateMembershipRole = async (
  actor: Prisma.MembershipModel,
  membershipId: string,
  newRoleId: string,
) => {
  const [actorMembership, target, newRole] = await Promise.all([
    getMembershipWithRole(actor.id),
    getMembershipWithRole(membershipId),
    prisma.societyRole.findFirst({
      where: { id: newRoleId, societyId: actor.societyId },
    }),
  ]);

  if (target.societyId !== actor.societyId) {
    throw createHttpError(403, "Membership not found");
  }
  if (target.deletedAt) {
    throw createHttpError(404, "Membership not found");
  }
  if (!newRole) {
    throw createHttpError(404, "Role not found");
  }

  if (!isSubset(newRole.permissions, actorMembership.role.permissions)) {
    throw createHttpError(403, "Cannot assign role with permissions higher than your own");
  }

  if (target.role.name === "OWNER") {
    const ownerCount = await getActiveOwnerCount(actor.societyId);
    if (ownerCount <= 1 && newRole.name !== "OWNER") {
      throw createHttpError(400, "Cannot downgrade the last owner");
    }
  }

  if (actor.id === target.id && target.role.name === "OWNER" && newRole.name !== "OWNER") {
    const ownerCount = await getActiveOwnerCount(actor.societyId);
    if (ownerCount <= 1) {
      throw createHttpError(400, "Cannot demote yourself as the last owner");
    }
  }

  const updated = await prisma.membership.update({
    where: { id: target.id },
    data: { roleId: newRole.id },
    include: {
      user: { select: { id: true, name: true, email: true, phone: true, avatar: true } },
      role: { select: { id: true, name: true, permissions: true, isSystem: true } },
    },
  });

  logger.info({
    message: "Membership role updated",
    societyId: actor.societyId,
    actorUserId: actor.userId,
    targetMembershipId: target.id,
    oldRoleId: target.roleId,
    newRoleId,
  });

  return updated;
};

export const updateMembershipStatus = async (
  actor: Prisma.MembershipModel,
  membershipId: string,
  newStatus: "active" | "suspended",
) => {
  const target = await prisma.membership.findFirst({
    where: { id: membershipId, societyId: actor.societyId, deletedAt: null },
  });

  if (!target) throw createHttpError(404, "Membership not found");
  if (target.id === actor.id) {
    throw createHttpError(400, "You cannot suspend or activate your own membership");
  }

  const updated = await prisma.membership.update({
    where: { id: target.id },
    data: { status: newStatus },
    include: {
      user: { select: { id: true, name: true, email: true, phone: true, avatar: true } },
      role: { select: { id: true, name: true, permissions: true, isSystem: true } },
    },
  });

  logger.info({
    message: "Membership status updated",
    societyId: actor.societyId,
    actorUserId: actor.userId,
    targetMembershipId: target.id,
    newStatus,
  });

  return updated;
};

export const removeMembership = async (actor: Prisma.MembershipModel, membershipId: string) => {
  const target = await prisma.membership.findFirst({
    where: { id: membershipId, societyId: actor.societyId, deletedAt: null },
    include: { role: { select: { name: true } } },
  });

  if (!target) throw createHttpError(404, "Membership not found");
  if (target.id === actor.id) {
    throw createHttpError(400, "You cannot remove your own membership");
  }

  if (target.role.name === "OWNER") {
    const ownerCount = await getActiveOwnerCount(actor.societyId);
    if (ownerCount <= 1) {
      throw createHttpError(400, "Cannot remove the last owner");
    }
  }

  await prisma.membership.update({
    where: { id: target.id },
    data: { deletedAt: new Date() },
  });

  logger.info({
    message: "Membership removed (soft delete)",
    societyId: actor.societyId,
    actorUserId: actor.userId,
    targetMembershipId: target.id,
  });
};

export const leaveOwnMembership = async (actor: Prisma.MembershipModel) => {
  const actorMembership = await prisma.membership.findFirst({
    where: { id: actor.id, deletedAt: null },
    include: { role: { select: { name: true } } },
  });

  if (!actorMembership) throw createHttpError(404, "Membership not found");

  if (actorMembership.role.name === "OWNER") {
    const ownerCount = await getActiveOwnerCount(actor.societyId);
    if (ownerCount <= 1) {
      throw createHttpError(400, "Cannot leave society as the last owner");
    }
  }

  await prisma.membership.update({
    where: { id: actorMembership.id },
    data: { deletedAt: new Date() },
  });

  logger.info({
    message: "Member left society (soft delete)",
    societyId: actor.societyId,
    actorUserId: actor.userId,
    targetMembershipId: actorMembership.id,
  });
};

export const getAssignableRoleOptions = async (actor: Prisma.MembershipModel) => {
  const actorMembership = await getMembershipWithRole(actor.id);
  const roles = await prisma.societyRole.findMany({
    where: { societyId: actor.societyId },
    select: { id: true, name: true, permissions: true, isSystem: true },
    orderBy: { createdAt: "asc" },
  });
  const assignableRoles = roles.filter((role) =>
    isSubset(role.permissions, actorMembership.role.permissions),
  );

  return {
    baseRoles: assignableRoles
      .filter((role) => role.isSystem)
      .map((role) => ({
        id: role.id,
        key: role.id,
        name: role.name,
        type: "base" as const,
      })),
    customRoles: assignableRoles
      .filter((role) => !role.isSystem)
      .map((role) => ({
        id: role.id,
        key: role.id,
        name: role.name,
        type: "custom" as const,
      })),
  };
};

export { assertMembership };
