import prisma from "@/config/prisma.js";
import type { Prisma } from "@/generated/prisma/client.js";
import createHttpError from "http-errors";
import { generateTokenPair } from "@/services/authTokenService.js";

type AuthRouteIntent = "CREATE_NEW_SOCIETY" | "SOCIETY_SELECTOR";

interface MembershipSummary {
  membershipId: string;
  societyId: string;
  role: string;
  roleId: string;
  permissions: string[];
  status: string;
  societyName: string;
  societyStatus: string;
}

const mapMemberships = (
  memberships: (Prisma.MembershipModel & {
    society: { id: string; name: string; status: string };
    role: { name: string; permissions: string[] };
  })[],
): MembershipSummary[] => {
  return memberships.map((m) => ({
    membershipId: m.id,
    societyId: m.societyId,
    role: m.role.name,
    roleId: m.roleId,
    permissions: m.role.permissions,
    status: m.status,
    societyName: m.society.name,
    societyStatus: m.society.status,
  }));
};

export const createFirstUser = async (data: {
  name: string;
  phone: string;
  email: string;
}): Promise<{
  user: { id: string; name: string; phone: string; email: string | null; avatar: string | null };
  accessToken: string;
  refreshToken: string;
  routeIntent: AuthRouteIntent;
  memberships: MembershipSummary[];
}> => {
  const existingUser = await prisma.user.findFirst({
    where: {
      OR: [{ phone: data.phone }, { email: data.email }],
    },
  });

  if (existingUser) {
    const { accessToken, refreshToken } = await generateTokenPair(existingUser.id);
    const memberships = await prisma.membership.findMany({
      where: { userId: existingUser.id, deletedAt: null },
      include: {
        society: { select: { id: true, name: true, status: true } },
        role: { select: { name: true, permissions: true } },
      },
    });

    return {
      user: {
        id: existingUser.id,
        name: existingUser.name,
        phone: existingUser.phone,
        email: existingUser.email,
        avatar: existingUser.avatar,
      },
      accessToken,
      refreshToken,
      routeIntent: memberships.length > 0 ? "SOCIETY_SELECTOR" : "CREATE_NEW_SOCIETY",
      memberships: mapMemberships(memberships),
    };
  }

  const createdUser = await prisma.user.create({
    data: {
      name: data.name,
      phone: data.phone,
      email: data.email,
    },
  });

  const { accessToken, refreshToken } = await generateTokenPair(createdUser.id);

  return {
    user: {
      id: createdUser.id,
      name: createdUser.name,
      phone: createdUser.phone,
      email: createdUser.email,
      avatar: createdUser.avatar,
    },
    accessToken,
    refreshToken,
    routeIntent: "CREATE_NEW_SOCIETY",
    memberships: [],
  };
};

export const loginUser = async (
  phone: string,
): Promise<{
  user: { id: string; name: string; phone: string; email: string | null; avatar: string | null };
  accessToken: string;
  refreshToken: string;
  routeIntent: AuthRouteIntent;
  memberships: MembershipSummary[];
}> => {
  const user = await prisma.user.findUnique({ where: { phone } });

  if (!user) {
    throw createHttpError(404, "User doesn't exist", { details: { phone } });
  }

  const { accessToken, refreshToken } = await generateTokenPair(user.id);

  const memberships = await prisma.membership.findMany({
    where: { userId: user.id, deletedAt: null },
    include: {
      society: { select: { id: true, name: true, status: true } },
      role: { select: { name: true, permissions: true } },
    },
  });

  return {
    user: {
      id: user.id,
      name: user.name,
      phone: user.phone,
      email: user.email,
      avatar: user.avatar,
    },
    accessToken,
    refreshToken,
    routeIntent: memberships.length > 0 ? "SOCIETY_SELECTOR" : "CREATE_NEW_SOCIETY",
    memberships: mapMemberships(memberships),
  };
};

export const checkUserPhoneExists = async (phone: string): Promise<boolean> => {
  const user = await prisma.user.findUnique({
    where: { phone },
    select: { id: true },
  });
  return Boolean(user);
};

export const getSessionPayload = async (
  userId: string,
): Promise<{
  user: {
    id: string;
    name: string;
    phone: string;
    email: string | null;
    avatar: string | null;
  };
  routeIntent: AuthRouteIntent;
  memberships: MembershipSummary[];
} | null> => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, phone: true, email: true, avatar: true },
  });

  if (!user) return null;

  const memberships = await prisma.membership.findMany({
    where: { userId: user.id, deletedAt: null },
    include: {
      society: { select: { id: true, name: true, status: true } },
      role: { select: { name: true, permissions: true } },
    },
  });

  return {
    user,
    routeIntent: memberships.length > 0 ? "SOCIETY_SELECTOR" : "CREATE_NEW_SOCIETY",
    memberships: mapMemberships(memberships),
  };
};
