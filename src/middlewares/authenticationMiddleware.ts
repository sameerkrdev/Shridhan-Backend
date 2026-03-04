import prisma from "@/config/prisma.js";
import { constants } from "@/constants.js";
import { verifyAccessToken } from "@/services/authTokenService.js";
import type { IAuthorizedRequest } from "@/types/authType.js";
import type { Request, Response, NextFunction } from "express";
import createHttpError from "http-errors";
import { z } from "zod";

const societyQuerySchema = z
  .object({
    societyId: z.uuid().optional(),
  })
  .passthrough();

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

      const validatedQuery = societyQuerySchema.safeParse(req.query);
      if (!validatedQuery.success) {
        throw createHttpError(400, "Invalid query parameters");
      }

      const societyId =
        (req.headers["x-society-id"] as string | undefined) ?? validatedQuery.data.societyId;

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
