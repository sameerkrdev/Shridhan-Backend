import prisma from "@/config/prisma.js";
import type { IAuthorizedRequest } from "@/types/authType.js";
import type { Request, Response, NextFunction } from "express";
import createHttpError from "http-errors";

export const requirePermission = (action: string, resourceType: string) => {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      const authorizedReq = req as IAuthorizedRequest;

      if (!authorizedReq.user) {
        throw createHttpError(401, "Authentication required");
      }

      if (!authorizedReq.membership) {
        throw createHttpError(400, "Society context is missing. Provide x-society-id header.");
      }

      if (authorizedReq.membership.status !== "active") {
        throw createHttpError(403, "Your membership is suspended");
      }

      const role = await prisma.societyRole.findFirst({
        where: {
          id: authorizedReq.membership.roleId,
          societyId: authorizedReq.membership.societyId,
        },
        select: {
          permissions: true,
        },
      });
      if (!role) {
        throw createHttpError(403, "Role not found for this membership");
      }

      const permission = `${resourceType}.${action}`;
      const allowed = role.permissions.includes(permission);

      if (!allowed) {
        throw createHttpError(403, "You do not have permission to perform this action");
      }

      next();
    } catch (error) {
      next(error);
    }
  };
};
