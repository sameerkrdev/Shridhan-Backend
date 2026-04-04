import prisma from "@/config/prisma.js";
import createHttpError from "http-errors";
import logger from "@/config/logger.js";

export const getUserProfile = async (userId: string) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, email: true, phone: true, avatar: true },
  });

  if (!user) throw createHttpError(404, "User not found");
  return user;
};

export const getUserMemberships = async (userId: string) => {
  const memberships = await prisma.membership.findMany({
    where: { userId, deletedAt: null },
    select: {
      id: true,
      societyId: true,
      roleId: true,
      status: true,
      joinedAt: true,
    },
    orderBy: { joinedAt: "asc" },
  });

  const [societies, roles, ownerMemberships] = await Promise.all([
    prisma.society.findMany({
      where: { id: { in: memberships.map((membership) => membership.societyId) } },
      select: { id: true, name: true },
    }),
    prisma.societyRole.findMany({
      where: { id: { in: memberships.map((membership) => membership.roleId) } },
      select: { id: true, name: true },
    }),
    prisma.membership.findMany({
      where: {
        societyId: { in: memberships.map((membership) => membership.societyId) },
        deletedAt: null,
        role: { name: "OWNER" },
      },
      select: { societyId: true },
    }),
  ]);

  const societyMap = new Map(societies.map((society) => [society.id, society]));
  const roleMap = new Map(roles.map((role) => [role.id, role]));
  const ownerCountBySociety = ownerMemberships.reduce<Record<string, number>>((acc, membership) => {
    acc[membership.societyId] = (acc[membership.societyId] ?? 0) + 1;
    return acc;
  }, {});

  return memberships.map((membership) => ({
    membershipId: membership.id,
    societyId: membership.societyId,
    societyName: societyMap.get(membership.societyId)?.name ?? "Unknown Society",
    roleId: membership.roleId,
    role: roleMap.get(membership.roleId)?.name ?? "Unknown Role",
    status: membership.status,
    joinedAt: membership.joinedAt,
    canLeave: !(
      (roleMap.get(membership.roleId)?.name ?? "Unknown Role") === "OWNER" &&
      (ownerCountBySociety[membership.societyId] ?? 0) <= 1
    ),
  }));
};

export const updateUserProfile = async (
  userId: string,
  payload: { name?: string; phone?: string; avatar?: string },
) => {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw createHttpError(404, "User not found");

  if (payload.phone && payload.phone !== user.phone) {
    const existing = await prisma.user.findUnique({ where: { phone: payload.phone } });
    if (existing) {
      throw createHttpError(400, "Phone number already in use");
    }
  }

  const updated = await prisma.user.update({
    where: { id: userId },
    data: {
      ...(payload.name !== undefined && { name: payload.name }),
      ...(payload.phone !== undefined && { phone: payload.phone }),
      ...(payload.avatar !== undefined && { avatar: payload.avatar }),
    },
    select: { id: true, name: true, email: true, phone: true, avatar: true },
  });

  logger.info({ message: "User profile updated", userId });

  return updated;
};
