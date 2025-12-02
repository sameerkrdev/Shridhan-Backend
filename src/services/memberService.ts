import prisma from "@/config/prisma.js";
import type { Prisma } from "@/generated/prisma/client.js";

export const createFirstMember = async (data: Prisma.MemberCreateInput) => {
  try {
    const member = await prisma.member.findFirst({
      where: { phoneNumber: data.phoneNumber },
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
