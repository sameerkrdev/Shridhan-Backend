import type { Prisma } from "@/generated/prisma/client.js";
import type {
  CreateFirstUserValidationSchema,
  LoginValidationSchema,
  UserExistsValidationSchema,
  RefreshValidationSchema,
} from "@/zodValidationSchema/memberValidationSchema.js";
import type { Request } from "express";

export interface ISignupUserRequest extends Request {
  body: CreateFirstUserValidationSchema["body"];
}

export interface ILoginUserRequest extends Request {
  body: LoginValidationSchema["body"];
}

export interface IRefreshUserRequest extends Request {
  body: RefreshValidationSchema["body"] & { refreshToken?: string };
}

export interface IUserExistsRequest extends Request {
  body: UserExistsValidationSchema["body"];
}

export interface IAccessTokenPayload {
  sub: string;
  tokenId: string;
  type: "access";
}

export interface IRefreshTokenPayload {
  sub: string;
  type: "refresh";
  tokenId: string;
}

export interface IDeviceInfo {
  userAgent?: string;
  deviceId?: string;
  ipAddress?: string;
}

export interface IAuthorizedRequest extends Request {
  user: Prisma.UserModel;
  membership?: Prisma.MembershipModel;
  session: string;
  cookies: Record<string, string>;
}
