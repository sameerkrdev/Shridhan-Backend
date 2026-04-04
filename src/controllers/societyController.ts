import { SocietyStatus } from "@/generated/prisma/client.js";
import {
  cancelSocietySubscription,
  createSociety,
  getSocietyBillingOverview,
  getMemberSocieties,
  resolveMemberSociety,
  setupSocietySubscriptionMandate,
} from "@/services/societyService.js";
import type {
  IOnboardSocietyRequest,
  IResolveMemberSocietyRequest,
  ISetupSubscriptionRequest,
  IGetSocietyBillingOverviewRequest,
  ISocietyUserRequest,
  ICancelSubscriptionRequest,
} from "@/types/society.js";
import type { Response, NextFunction } from "express";

export const onboardSociety = async (
  req: IOnboardSocietyRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { name, country, state, city, zipcode, logoUrl } = req.body;

    const payload = await createSociety(
      {
        name,
        country,
        state,
        city,
        zipcode,
        logoUrl,
        status: SocietyStatus.CREATED,
        createdBy: req.user.id,
      },
      req.user,
    );

    res.json({
      ...payload,
      mandateSetup: null,
    });
  } catch (error) {
    next(error);
  }
};

export const listMemberSocieties = async (
  req: ISocietyUserRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const memberships = await getMemberSocieties(req.user.id);
    res.json({ memberships });
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
    const result = await resolveMemberSociety(req.user.id, societyId);
    res.json(result);
  } catch (error) {
    next(error);
  }
};

export const setupSubscription = async (
  req: ISetupSubscriptionRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const result = await setupSocietySubscriptionMandate(req.user.id, req.body.societyId);
    res.json(result);
  } catch (error) {
    next(error);
  }
};

export const getBillingOverview = async (
  req: IGetSocietyBillingOverviewRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const result = await getSocietyBillingOverview(req.user.id, req.params.societyId);
    res.json(result);
  } catch (error) {
    next(error);
  }
};

export const cancelSubscription = async (
  req: ICancelSubscriptionRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const result = await cancelSocietySubscription(
      req.user.id,
      req.body.societyId,
      req.body.refundLatestPayment,
    );
    res.json(result);
  } catch (error) {
    next(error);
  }
};
