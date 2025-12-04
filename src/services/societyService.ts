import prisma from "@/config/prisma.js";
import type { Prisma } from "@/generated/prisma/client.js";
import createHttpError from "http-errors";

export const createSociety = async (data: Prisma.SocietyCreateInput) => {
  try {
    const society = await prisma.society.findFirst({
      where: { OR: [{ name: data.name }, { subDomainName: data.subDomainName }] },
    });

    if (society) {
      const error = createHttpError(400, "Society already exist");
      throw error;
    }

    const newMember = await prisma.society.create({
      data,
    });

    return newMember;
  } catch (error) {
    throw error;
  }
};
