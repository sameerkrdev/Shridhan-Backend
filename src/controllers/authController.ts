import env from "@/config/dotenv.js";
import { constants } from "@/constants.js";
import { createFirstMember, loginMember as loginMemberService } from "@/services/authService.js";
import type { ILoginMemberRequest, ISignupMemberRequest } from "@/types/authType.js";
import type { Response, NextFunction } from "express";

export const signup = async (req: ISignupMemberRequest, res: Response, next: NextFunction) => {
  try {
    const { name, phone, email, role } = req.body;

    const { newMember, accessToken, refreshToken } = await createFirstMember({
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

    res.status(201).json({ ...newMember });
  } catch (error) {
    next(error);
  }
};

export const login = async (req: ILoginMemberRequest, res: Response, next: NextFunction) => {
  try {
    const { phone, societyId } = req.body;

    const { member, accessToken, refreshToken } = await loginMemberService(phone, societyId);

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

    res.status(200).json(member);
  } catch (error) {
    next(error);
  }
};
