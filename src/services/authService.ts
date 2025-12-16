import prisma from "@/config/prisma.js";
import type { Prisma } from "@/generated/prisma/client.js";
import createHttpError from "http-errors";
import { generateTokenPair } from "./authTokenService.js";

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

    const { accessToken, refreshToken } = await generateTokenPair(newMember.id);

    return { newMember, accessToken, refreshToken };
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

    const { accessToken, refreshToken } = await generateTokenPair(member.id);

    return { member, accessToken, refreshToken };
  } catch (error) {
    throw error;
  }
};
