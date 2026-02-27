import type { Prisma } from "@/generated/prisma/client.js";
import type {
  CreateFirstMemberValidationSchema,
  LoginValidationSchema,
  MemberExistsValidationSchema,
  RefreshValidationSchema,
} from "@/zodValidationSchema/memberValidationSchema.js";
import type { Request } from "express";

export interface ISignupMemberRequest extends Request {
  body: CreateFirstMemberValidationSchema["body"];
}

export interface ILoginMemberRequest extends Request {
  body: LoginValidationSchema["body"];
}

export interface IRefreshMemberRequest extends Request {
  body: RefreshValidationSchema["body"] & { refreshToken?: string };
}

export interface IMemberExistsRequest extends Request {
  body: MemberExistsValidationSchema["body"];
}

export interface IAccessTokenPayload {
  sub: string; // Member Id
  tokenId: string;
  type: "access";
}

export interface IRefreshTokenPayload {
  sub: string; // Member Id
  type: "refresh";
  tokenId: string;
}

export interface IDeviceInfo {
  userAgent?: string;
  deviceId?: string;
  ipAddress?: string;
}

export interface IAuthorizedRequest extends Request {
  member: Prisma.MemberModel;
  session: string;
  cookies: Record<string, string>;
}
