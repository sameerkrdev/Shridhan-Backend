import prisma from "@/config/prisma.js";
import type { Prisma } from "@/generated/prisma/client.js";
import createHttpError from "http-errors";

export const createFirstMember = async (data: Prisma.MemberCreateInput) => {
  try {
    const member = await prisma.member.findFirst({
      where: { phone: data.phone },
    });

    if (member && !member?.societyId) {
      throw new Error("User already exist but not assoicated with any society");
    }

    const newMember = await prisma.member.create({
      data,
    });

    return newMember;
  } catch (error) {
    throw error;
  }
};

export const loginMember = async (phone: string, societyId: string) => {
  try {
    const member = await prisma.member.findFirst({
      where: { phone, societyId },
    });

    if (!member) {
      const error = createHttpError(404, "Member doesn't exists", {
        details: { phone, societyId },
      });
      throw error;
    }

    return member;
  } catch (error) {
    throw error;
  }
};
