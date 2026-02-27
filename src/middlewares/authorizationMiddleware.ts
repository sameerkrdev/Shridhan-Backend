import type { Request, Response, NextFunction } from "express";
import createHttpError from "http-errors";
import type { IAuthorizedRequest } from "@/types/authType.js";
import { hasMemberPermission } from "@/services/accessControlService.js";

export const permitAuthorizationMiddleware = (permissionNames: string[]) => {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      const authorizedReq = req as IAuthorizedRequest;

      const checks = await Promise.all(
        permissionNames.map((permissionName) =>
          hasMemberPermission(authorizedReq.member, permissionName),
        ),
      );
      const hasAllPermissions = checks.every(Boolean);

      if (!hasAllPermissions) {
        throw createHttpError(403, "You do not have permission to perform this action");
      }

      next();
    } catch (error) {
      next(error);
    }
  };
};
