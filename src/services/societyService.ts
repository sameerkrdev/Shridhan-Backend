import prisma from "@/config/prisma.js";
import type { Prisma } from "@/generated/prisma/client.js";
import createHttpError from "http-errors";

type SocietyStatus = "CREATED" | "PERMIT_PENDING" | "RAZORPAY_PENDING" | "ACTIVE";

const statusRouteMap: Record<SocietyStatus, string> = {
  CREATED: "/onboarding/permit",
  PERMIT_PENDING: "/onboarding/permit",
  RAZORPAY_PENDING: "/onboarding/razorpay",
  ACTIVE: "/",
};

export const createSociety = async (
  data: Prisma.SocietyCreateInput,
  creator: Prisma.MemberModel,
) => {
  try {
    const society = await prisma.society.findFirst({
      where: { OR: [{ name: data.name }, { subDomainName: data.subDomainName }] },
    });

    if (society) {
      const error = createHttpError(400, "Society already exist");
      throw error;
    }

    const payload = await prisma.$transaction(async (tx) => {
      const createdSociety = await tx.society.create({
        data,
      });

      let membership: Prisma.MemberModel;
      if (!creator.societyId) {
        membership = await tx.member.update({
          where: { id: creator.id },
          data: {
            societyId: createdSociety.id,
            role: "SUPER_ADMIN",
            updatedBy: creator.id,
          },
        });
      } else {
        membership = await tx.member.create({
          data: {
            name: creator.name,
            phone: creator.phone,
            email: creator.email,
            role: "SUPER_ADMIN",
            societyId: createdSociety.id,
            createdBy: creator.id,
            updatedBy: creator.id,
          },
        });
      }

      return { society: createdSociety, membership };
    });

    return payload;
  } catch (error) {
    throw error;
  }
};

export const getMemberSocieties = async (phone: string) => {
  try {
    const memberships = await prisma.member.findMany({
      where: { phone, societyId: { not: null } },
      include: {
        society: {
          select: {
            id: true,
            name: true,
            subDomainName: true,
            status: true,
          },
        },
      },
    });

    return memberships
      .filter((membership) => membership.society)
      .map((membership) => ({
        memberId: membership.id,
        role: membership.role,
        societyId: membership.societyId!,
        societyName: membership.society?.name ?? "",
        subDomainName: membership.society?.subDomainName ?? "",
        status: (membership.society?.status ?? "CREATED") as SocietyStatus,
      }));
  } catch (error) {
    throw error;
  }
};

export const resolveMemberSociety = async (phone: string, societyId: string) => {
  try {
    const membership = await prisma.member.findFirst({
      where: {
        phone,
        societyId,
      },
      include: {
        society: {
          select: {
            id: true,
            name: true,
            subDomainName: true,
            status: true,
          },
        },
      },
    });

    if (!membership || !membership.society) {
      throw createHttpError(403, "You are not a member of this society");
    }

    return {
      memberId: membership.id,
      societyId: membership.society.id,
      societyName: membership.society.name,
      subDomainName: membership.society.subDomainName,
      status: membership.society.status,
      role: membership.role,
      nextRoute: statusRouteMap[membership.society.status as SocietyStatus],
    };
  } catch (error) {
    throw error;
  }
};
