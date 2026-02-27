import prisma from "@/config/prisma.js";
import type { Prisma } from "@/generated/prisma/client.js";
import createHttpError from "http-errors";
import { generateTokenPair } from "@/services/authTokenService.js";

type AuthRouteIntent = "CREATE_NEW_SOCIETY" | "SOCIETY_SELECTOR";

interface MemberSocietySummary {
  memberId: string;
  societyId: string;
  role: string;
  societyName: string;
  subDomainName: string;
  status: string;
}

const mapMemberSocieties = (
  members: (Prisma.MemberModel & {
    society: {
      id: string;
      name: string;
      subDomainName: string;
      status: string;
    } | null;
  })[],
) => {
  return members
    .filter((member) => member.societyId && member.society)
    .map(
      (member): MemberSocietySummary => ({
        memberId: member.id,
        societyId: member.societyId!,
        role: member.role,
        societyName: member.society?.name ?? "",
        subDomainName: member.society?.subDomainName ?? "",
        status: member.society?.status ?? "",
      }),
    );
};

export const createFirstMember = async (
  data: Prisma.MemberCreateInput,
): Promise<{
  member: Prisma.MemberModel;
  accessToken: string;
  refreshToken: string;
  routeIntent: AuthRouteIntent;
  societies: MemberSocietySummary[];
}> => {
  try {
    const existingMembers = await prisma.member.findMany({
      where: {
        OR: [{ phone: data.phone }, ...(data.email ? [{ email: data.email }] : [])],
      },
    });

    if (existingMembers.length > 0) {
      const sessionMember = existingMembers[0] as Prisma.MemberModel;
      const { accessToken, refreshToken } = await generateTokenPair(sessionMember.id);
      const memberships = await prisma.member.findMany({
        where: { phone: sessionMember.phone, societyId: { not: null } },
        include: { society: true },
      });

      return {
        member: sessionMember,
        accessToken,
        refreshToken,
        routeIntent: "SOCIETY_SELECTOR",
        societies: mapMemberSocieties(memberships),
      };
    }

    const createdMember = await prisma.member.create({
      data: {
        ...data,
        role: "SUPER_ADMIN",
      },
    });

    const { accessToken, refreshToken } = await generateTokenPair(createdMember.id);

    return {
      member: createdMember,
      accessToken,
      refreshToken,
      routeIntent: "CREATE_NEW_SOCIETY",
      societies: [],
    };
  } catch (error) {
    throw error;
  }
};

export const loginMember = async (
  phone: string,
): Promise<{
  member: Prisma.MemberModel;
  accessToken: string;
  refreshToken: string;
  routeIntent: AuthRouteIntent;
  societies: MemberSocietySummary[];
}> => {
  try {
    const members = await prisma.member.findMany({
      where: { phone },
      include: { society: true },
    });

    if (!members.length) {
      const error = createHttpError(404, "Member doesn't exists", {
        details: { phone },
      });
      throw error;
    }

    const sessionMember = members[0] as Prisma.MemberModel & { society: unknown };
    const { society: _society, ...member } = sessionMember; // eslint-disable-line @typescript-eslint/no-unused-vars
    const { accessToken, refreshToken } = await generateTokenPair(sessionMember.id);

    return {
      member,
      accessToken,
      refreshToken,
      routeIntent: "SOCIETY_SELECTOR",
      societies: mapMemberSocieties(members),
    };
  } catch (error) {
    throw error;
  }
};

export const checkMemberPhoneExists = async (phone: string): Promise<boolean> => {
  try {
    const member = await prisma.member.findFirst({
      where: { phone },
      select: { id: true },
    });

    return Boolean(member);
  } catch (error) {
    throw error;
  }
};
