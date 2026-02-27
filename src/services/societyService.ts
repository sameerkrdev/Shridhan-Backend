import { SocietyStatus } from "@/generated/prisma/client.js";
import prisma from "@/config/prisma.js";
import logger from "@/config/logger.js";
import type { Prisma } from "@/generated/prisma/client.js";
import createHttpError from "http-errors";
import { bootstrapSocietyAccessControl } from "@/services/accessControlService.js";

type SocietyStatusKey = "CREATED" | "PERMIT_PENDING" | "RAZORPAY_PENDING" | "ACTIVE";

const statusRouteMap: Record<SocietyStatusKey, string> = {
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
    const existingSociety = await prisma.society.findFirst({
      where: { OR: [{ name: data.name }, { subDomainName: data.subDomainName }] },
    });

    if (existingSociety) {
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

    let society = payload.society;
    try {
      await bootstrapSocietyAccessControl(payload.society, payload.membership);
      society = await prisma.society.update({
        where: { id: payload.society.id },
        data: { status: SocietyStatus.RAZORPAY_PENDING },
      });

      logger.info({
        message: "Society bootstrap completed",
        societyId: payload.society.id,
        memberId: payload.membership.id,
      });
    } catch (error) {
      society = await prisma.society.update({
        where: { id: payload.society.id },
        data: { status: SocietyStatus.PERMIT_PENDING },
      });

      logger.error({
        message: "Society bootstrap failed",
        societyId: payload.society.id,
        memberId: payload.membership.id,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }

    return { society, membership: payload.membership };
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
        status: (membership.society?.status ?? "CREATED") as SocietyStatusKey,
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
      nextRoute: statusRouteMap[membership.society.status as SocietyStatusKey],
    };
  } catch (error) {
    throw error;
  }
};

export const setupSocietyPermitRules = async (phone: string, societyId: string) => {
  try {
    const membership = await prisma.member.findFirst({
      where: {
        phone,
        societyId,
      },
      include: {
        society: true,
      },
    });

    if (!membership || !membership.society) {
      throw createHttpError(403, "You are not a member of this society");
    }

    await bootstrapSocietyAccessControl(membership.society, membership);

    const updatedSociety = await prisma.society.update({
      where: { id: membership.society.id },
      data: { status: SocietyStatus.RAZORPAY_PENDING },
    });

    logger.info({
      message: "Permit rules setup completed",
      societyId: membership.society.id,
      memberId: membership.id,
    });

    return {
      societyId: updatedSociety.id,
      status: updatedSociety.status,
      nextRoute: statusRouteMap[updatedSociety.status as SocietyStatusKey],
    };
  } catch (error) {
    logger.error({
      message: "Permit rules setup failed",
      societyId,
      error: error instanceof Error ? error.message : "Unknown error",
    });
    throw error;
  }
};
