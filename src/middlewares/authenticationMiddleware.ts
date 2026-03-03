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

      const user = await prisma.user.findUnique({
        where: { id: tokenData.sub },
      });
      if (!user) throw createHttpError(401, "Invalid user");

      const session = await prisma.refreshToken.findFirst({
        where: {
          id: tokenData.tokenId,
          userId: tokenData.sub,
          isRevoked: false,
          expiresAt: { gt: new Date() },
        },
      });

      if (!session) {
        throw createHttpError(401, "Session revoked. Please login again.");
      }

      const authorizedReq = req as unknown as IAuthorizedRequest;
      authorizedReq.user = user;
      authorizedReq.session = session.id;

      const societyId =
        (req.headers["x-society-id"] as string | undefined) ??
        (req.query.societyId as string | undefined);

      if (societyId) {
        const membership = await prisma.membership.findFirst({
          where: {
            userId: user.id,
            societyId,
            deletedAt: null,
          },
        });

        if (membership) {
          authorizedReq.membership = membership;
        }
      }

      next();
    } catch (error) {
      next(error);
    }
  };
};
