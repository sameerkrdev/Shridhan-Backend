import { SocietyStatus } from "@/generated/prisma/client.js";
import { createSociety } from "@/services/societyService.js";
import type { IOnboardSocietyRequest } from "@/types/society.js";
import type { Response, NextFunction } from "express";

export const onboardSociety = async (
  req: IOnboardSocietyRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { name, subDomainName, country, state, city, zipcode, logoUrl } = req.body;

    const member = await createSociety({
      name,
      subDomainName,
      country,
      state,
      city,
      zipcode,
      logoUrl,
      status: SocietyStatus.CREATED,
      createdBy: req.member.id,
    });

    res.json(member);
  } catch (error) {
    next(error);
  }
};
