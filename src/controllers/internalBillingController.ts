import type { NextFunction, Response } from "express";
import type { IUpdateSocietyBillingPolicyRequest } from "@/types/internalBilling.js";
import { updateSocietyBillingPolicy } from "@/services/subscriptionLifecycleService.js";

export const patchSocietyBillingPolicy = async (
  req: IUpdateSocietyBillingPolicyRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const updated = await updateSocietyBillingPolicy(req.params.societyId, {
      ...(req.body.developerOverrideEnabled !== undefined && {
        developerOverrideEnabled: req.body.developerOverrideEnabled,
      }),
      ...(req.body.setupFeeEnabled !== undefined && { setupFeeEnabled: req.body.setupFeeEnabled }),
      ...(req.body.setupFeeAmount !== undefined && { setupFeeAmount: req.body.setupFeeAmount }),
      ...(req.body.customOneTimeFeeEnabled !== undefined && {
        customOneTimeFeeEnabled: req.body.customOneTimeFeeEnabled,
      }),
      ...(req.body.customOneTimeFeeAmount !== undefined && {
        customOneTimeFeeAmount: req.body.customOneTimeFeeAmount,
      }),
      ...(req.body.customOneTimeFeeWaived !== undefined && {
        customOneTimeFeeWaived: req.body.customOneTimeFeeWaived,
      }),
      ...(req.body.customSubscriptionEnabled !== undefined && {
        customSubscriptionEnabled: req.body.customSubscriptionEnabled,
      }),
      ...(req.body.customSubscriptionAmount !== undefined && {
        customSubscriptionAmount: req.body.customSubscriptionAmount,
      }),
      ...(req.body.customSubscriptionWaived !== undefined && {
        customSubscriptionWaived: req.body.customSubscriptionWaived,
      }),
      setByDeveloperId: req.body.setByDeveloperId,
      setReason: req.body.setReason,
    });
    res.json({ policy: updated });
  } catch (error) {
    next(error);
  }
};

export const approveSocietyBillingOverride = async (
  req: IUpdateSocietyBillingPolicyRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const updated = await updateSocietyBillingPolicy(req.params.societyId, {
      developerOverrideEnabled: true,
      customOneTimeFeeWaived: true,
      customSubscriptionWaived: true,
      setByDeveloperId: req.body.setByDeveloperId,
      setReason: req.body.setReason,
    });

    res.json({ policy: updated });
  } catch (error) {
    next(error);
  }
};
