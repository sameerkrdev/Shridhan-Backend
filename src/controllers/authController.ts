import env from "@/config/dotenv.js";
import { constants } from "@/constants.js";
import {
  checkMemberPhoneExists,
  createFirstMember,
  loginMember as loginMemberService,
} from "@/services/authService.js";
import prisma from "@/config/prisma.js";
import {
  refreshTokens as refreshTokensService,
  revokeRefreshToken,
  verifyAccessToken,
} from "@/services/authTokenService.js";
import createHttpError from "http-errors";
import type {
  ILoginMemberRequest,
  IMemberExistsRequest,
  IRefreshMemberRequest,
  ISignupMemberRequest,
} from "@/types/authType.js";
import type { Response, NextFunction } from "express";

export const signup = async (req: ISignupMemberRequest, res: Response, next: NextFunction) => {
  try {
    const { name, phone, email, role } = req.body;

    const { member, accessToken, refreshToken, routeIntent, societies } = await createFirstMember({
      name,
      phone,
      email,
      role,
    });

    res.cookie(constants.ACCESS_COOKIE_NAME, accessToken, {
      maxAge: constants.ACCESS_TOKEN_EXPIRY_SECONDS * 1000,
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      ...(env.NODE_ENV === "production" && { domain: env.COOKIE_DOMAIN }),
      sameSite: "strict",
      path: "/",
    });

    res.cookie(constants.REFRESH_COOKIE_NAME, refreshToken, {
      maxAge: constants.REFRESH_TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000,
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      ...(env.NODE_ENV === "production" && { domain: env.COOKIE_DOMAIN }),
      sameSite: "strict",
      path: "/",
    });

    res.status(201).json({
      member,
      accessToken,
      refreshToken,
      routeIntent,
      societies,
    });
  } catch (error) {
    next(error);
  }
};

export const login = async (req: ILoginMemberRequest, res: Response, next: NextFunction) => {
  try {
    const { phone } = req.body;

    const { member, accessToken, refreshToken, routeIntent, societies } =
      await loginMemberService(phone);

    res.cookie(constants.ACCESS_COOKIE_NAME, accessToken, {
      maxAge: constants.ACCESS_TOKEN_EXPIRY_SECONDS * 1000,
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      ...(env.NODE_ENV === "production" && { domain: env.COOKIE_DOMAIN }),
      sameSite: "strict",
      path: "/",
    });

    res.cookie(constants.REFRESH_COOKIE_NAME, refreshToken, {
      maxAge: constants.REFRESH_TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000,
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      ...(env.NODE_ENV === "production" && { domain: env.COOKIE_DOMAIN }),
      sameSite: "strict",
      path: "/",
    });

    res.status(200).json({
      member,
      accessToken,
      refreshToken,
      routeIntent,
      societies,
    });
  } catch (error) {
    next(error);
  }
};

export const refresh = async (req: IRefreshMemberRequest, res: Response, next: NextFunction) => {
  try {
    const request = req as {
      body: { refreshToken?: string };
      headers: Record<string, unknown>;
      cookies?: Record<string, string>;
    };
    const refreshToken =
      request.cookies?.[constants.REFRESH_COOKIE_NAME] ?? request.body.refreshToken;
    if (!refreshToken) {
      return next(createHttpError(401, "Refresh token missing"));
    }
    const userAgentHeader = request.headers["user-agent"];
    const userAgent = typeof userAgentHeader === "string" ? userAgentHeader : undefined;
    const { accessToken, refreshToken: newRefreshToken } = await refreshTokensService(
      refreshToken,
      userAgent ? { userAgent } : undefined,
    );

    const accessPayload = verifyAccessToken(accessToken);
    if (!accessPayload?.sub) {
      return next(createHttpError(401, "Invalid access token generated"));
    }

    const member = await prisma.member.findUnique({
      where: { id: accessPayload.sub },
      include: {
        society: {
          select: {
            id: true,
            name: true,
            subDomainName: true,
            status: true,
          },
        },
      },
    });

    if (!member) {
      return next(createHttpError(401, "Member not found"));
    }

    const societies = await prisma.member.findMany({
      where: { phone: member.phone, societyId: { not: null } },
      include: {
        society: {
          select: {
            id: true,
            name: true,
            subDomainName: true,
            status: true,
          },
        },
      },
    });

    res.cookie(constants.ACCESS_COOKIE_NAME, accessToken, {
      maxAge: constants.ACCESS_TOKEN_EXPIRY_SECONDS * 1000,
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      ...(env.NODE_ENV === "production" && { domain: env.COOKIE_DOMAIN }),
      sameSite: "strict",
      path: "/",
    });

    res.cookie(constants.REFRESH_COOKIE_NAME, newRefreshToken, {
      maxAge: constants.REFRESH_TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000,
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      ...(env.NODE_ENV === "production" && { domain: env.COOKIE_DOMAIN }),
      sameSite: "strict",
      path: "/",
    });

    res.status(200).json({
      member: {
        id: member.id,
        name: member.name,
        phone: member.phone,
        email: member.email,
        role: member.role,
        societyId: member.societyId,
      },
      accessToken,
      refreshToken: newRefreshToken,
      routeIntent: "SOCIETY_SELECTOR",
      societies: societies
        .filter((item) => item.society)
        .map((item) => ({
          memberId: item.id,
          societyId: item.societyId,
          role: item.role,
          societyName: item.society?.name ?? "",
          subDomainName: item.society?.subDomainName ?? "",
          status: item.society?.status ?? "CREATED",
        })),
    });
  } catch (error) {
    next(error);
  }
};

export const logout = async (req: IRefreshMemberRequest, res: Response, next: NextFunction) => {
  try {
    const request = req as { body: { refreshToken?: string }; cookies?: Record<string, string> };
    const refreshToken =
      request.cookies?.[constants.REFRESH_COOKIE_NAME] ?? request.body.refreshToken;
    if (refreshToken) {
      await revokeRefreshToken(refreshToken);
    }

    res.clearCookie(constants.ACCESS_COOKIE_NAME, { path: "/" });
    res.clearCookie(constants.REFRESH_COOKIE_NAME, { path: "/" });

    res.status(200).json({ success: true });
  } catch (error) {
    next(error);
  }
};

export const checkMemberExists = async (
  req: IMemberExistsRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const exists = await checkMemberPhoneExists(req.body.phone);
    res.status(200).json({ exists });
  } catch (error) {
    next(error);
  }
};
