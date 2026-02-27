import prisma from "@/config/prisma.js";
import { constants } from "@/constants.js";
import { verifyAccessToken } from "@/services/authTokenService.js";
import type { IAuthorizedRequest } from "@/types/authType.js";
import type { Request, Response, NextFunction } from "express";
import createHttpError from "http-errors";

export const authenticaionMiddleware = () => {
  return async (req: Request, _: Response, next: NextFunction) => {
    try {
      const headerToken = req.headers.authorization?.startsWith("Bearer ")
        ? req.headers.authorization.split(" ")[1]
        : undefined;

      const token =
        (req as IAuthorizedRequest).cookies?.[constants.ACCESS_COOKIE_NAME] ?? headerToken;

      if (!token) {
        throw createHttpError(401, "Access token missing");
      }

      const tokenData = verifyAccessToken(token);

      if (tokenData?.type !== "access") {
        throw createHttpError(401, "Invalid or expired token");
      }

      // 1) User must exist
      const member = await prisma.member.findUnique({
        where: { id: tokenData.sub },
      });
      if (!member) throw createHttpError(401, "Invalid user");

      // 2) Ensure device/session exists and is not revoked
      const session = await prisma.refreshToken.findFirst({
        where: {
          id: tokenData.tokenId,
          memberId: tokenData.sub,
          isRevoked: false,
          expiresAt: { gt: new Date() },
        },
      });

      if (!session) {
        throw createHttpError(401, "Session revoked. Please login again.");
      }

      // 3) Attach data
      const authorizedReq = req as Request & { member: typeof member; session: string };
      authorizedReq.member = member;
      authorizedReq.session = session.id; // ← useful for logout device

      next();
    } catch (error) {
      next(error);
    }
  };
};
