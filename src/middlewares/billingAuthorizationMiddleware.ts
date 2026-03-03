import type { Request, Response, NextFunction } from "express";
import createHttpError from "http-errors";
import type { IAuthorizedRequest } from "@/types/authType.js";
import { evaluateSocietyBillingAccess } from "@/services/subscriptionLifecycleService.js";

export const billingAuthorizationMiddleware = () => {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      const authorizedReq = req as IAuthorizedRequest;
      const societyId = authorizedReq.membership?.societyId;

      if (!societyId) {
        throw createHttpError(403, "Society context missing for billing validation");
      }

      const evaluation = await evaluateSocietyBillingAccess(societyId);

      if (!evaluation.isAllowed) {
        throw createHttpError(403, `Billing access denied: ${evaluation.state}`);
      }

      next();
    } catch (error) {
      next(error);
    }
  };
};
