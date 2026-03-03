import { constants } from "@/constants.js";
import {
  checkUserPhoneExists,
  createFirstUser,
  getSessionPayload,
  loginUser,
} from "@/services/authService.js";
import {
  refreshTokens as refreshTokensService,
  revokeRefreshToken,
  verifyAccessToken,
} from "@/services/authTokenService.js";
import createHttpError from "http-errors";
import type {
  ILoginUserRequest,
  IUserExistsRequest,
  IRefreshUserRequest,
  ISignupUserRequest,
} from "@/types/authType.js";
import type { Response, NextFunction } from "express";

const setCookies = (res: Response, accessToken: string, refreshToken: string) => {
  const cookieOptions = {
    httpOnly: true,
    secure: true,
    sameSite: "none" as const,
    path: "/",
  };

  res.cookie(constants.ACCESS_COOKIE_NAME, accessToken, {
    ...cookieOptions,
    maxAge: constants.ACCESS_TOKEN_EXPIRY_SECONDS * 1000,
  });

  res.cookie(constants.REFRESH_COOKIE_NAME, refreshToken, {
    ...cookieOptions,
    maxAge: constants.REFRESH_TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000,
  });
};

export const signup = async (req: ISignupUserRequest, res: Response, next: NextFunction) => {
  try {
    const { name, phone, email } = req.body;

    const { user, accessToken, refreshToken, routeIntent, memberships } = await createFirstUser({
      name,
      phone,
      email,
    });

    setCookies(res, accessToken, refreshToken);

    res.status(201).json({ user, routeIntent, memberships });
  } catch (error) {
    next(error);
  }
};

export const login = async (req: ILoginUserRequest, res: Response, next: NextFunction) => {
  try {
    const { phone } = req.body;

    const { user, accessToken, refreshToken, routeIntent, memberships } = await loginUser(phone);

    setCookies(res, accessToken, refreshToken);

    res.status(200).json({ user, routeIntent, memberships });
  } catch (error) {
    next(error);
  }
};

export const refresh = async (req: IRefreshUserRequest, res: Response, next: NextFunction) => {
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

    setCookies(res, accessToken, newRefreshToken);

    res.status(200).json({ success: true });
  } catch (error) {
    next(error);
  }
};

export const session = async (req: IRefreshUserRequest, res: Response, next: NextFunction) => {
  try {
    const request = req as {
      headers: Record<string, unknown>;
      cookies?: Record<string, string>;
    };

    const headerToken =
      typeof request.headers.authorization === "string" &&
      request.headers.authorization.startsWith("Bearer ")
        ? request.headers.authorization.split(" ")[1]
        : undefined;

    const accessToken = request.cookies?.[constants.ACCESS_COOKIE_NAME] ?? headerToken;

    if (!accessToken) {
      return next(createHttpError(401, "Access token missing"));
    }

    const accessPayload = verifyAccessToken(accessToken);
    if (!accessPayload?.sub) {
      return next(createHttpError(401, "Invalid or expired access token"));
    }

    const payload = await getSessionPayload(accessPayload.sub);
    if (!payload) {
      return next(createHttpError(401, "User not found"));
    }

    res.status(200).json(payload);
  } catch (error) {
    next(error);
  }
};

export const logout = async (req: IRefreshUserRequest, res: Response, next: NextFunction) => {
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

export const checkUserExists = async (
  req: IUserExistsRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const exists = await checkUserPhoneExists(req.body.phone);
    res.status(200).json({ exists });
  } catch (error) {
    next(error);
  }
};
