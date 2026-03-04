import type { Request, Response, NextFunction } from "express";
import createHttpError from "http-errors";
import type { IAuthorizedRequest } from "@/types/authType.js";
import { evaluateSocietyBillingAccess } from "@/services/subscriptionLifecycleService.js";
import prisma from "@/config/prisma.js";
import { z } from "zod";

const societyQuerySchema = z
  .object({
    societyId: z.uuid().optional(),
  })
  .loose();

export const billingAuthorizationMiddleware = () => {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      const authorizedReq = req as IAuthorizedRequest;
      const validatedQuery = societyQuerySchema.safeParse(req.query);
      if (!validatedQuery.success) {
        throw createHttpError(400, "Invalid query parameters");
      }

      const societyId =
        authorizedReq.membership?.societyId ??
        (req.headers["x-society-id"] as string | undefined) ??
        validatedQuery.data.societyId ??
        (typeof (req.body as { societyId?: unknown })?.societyId === "string"
          ? (req.body as { societyId: string }).societyId
          : undefined) ??
        (typeof req.params.societyId === "string" ? req.params.societyId : undefined);

      if (!societyId) {
        throw createHttpError(403, "Society context missing for billing validation");
      }

      if (!authorizedReq.membership && authorizedReq.user?.id) {
        const membership = await prisma.membership.findFirst({
          where: { userId: authorizedReq.user.id, societyId, deletedAt: null },
        });
        if (membership) {
          authorizedReq.membership = membership;
        }
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
