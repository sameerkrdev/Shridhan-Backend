import { SocietyStatus } from "@/generated/prisma/client.js";
import {
  createSociety,
  getMemberSocieties,
  resolveMemberSociety,
} from "@/services/societyService.js";
import type {
  IOnboardSocietyRequest,
  IResolveMemberSocietyRequest,
  ISocietyMemberRequest,
} from "@/types/society.js";
import type { Response, NextFunction } from "express";

export const onboardSociety = async (
  req: IOnboardSocietyRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { name, subDomainName, country, state, city, zipcode, logoUrl } = req.body;

    const payload = await createSociety(
      {
        name,
        subDomainName,
        country,
        state,
        city,
        zipcode,
        logoUrl,
        status: SocietyStatus.CREATED,
        createdBy: req.member.id,
      },
      req.member,
    );

    // permit pre-defined role creation and first user ko full accesss

    // razorpay payment url

    res.json(payload);
  } catch (error) {
    next(error);
  }
};

export const listMemberSocieties = async (
  req: ISocietyMemberRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const societies = await getMemberSocieties(req.member.phone);
    res.json({ societies });
  } catch (error) {
    next(error);
  }
};

export const resolveSelectedSociety = async (
  req: IResolveMemberSocietyRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { societyId } = req.body;
    const result = await resolveMemberSociety(req.member.phone, societyId);

    res.json(result);
  } catch (error) {
    next(error);
  }
};
