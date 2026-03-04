import jwt from "jsonwebtoken";
import prisma from "@/config/prisma.js";
import createHttpError from "http-errors";
import env from "@/config/dotenv.js";
import type { IAccessTokenPayload, IDeviceInfo, IRefreshTokenPayload } from "@/types/authType.js";
import { constants } from "@/constants.js";
import { createPrivateKey, createPublicKey } from "node:crypto";

interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

const PRIVATE_KEY = env.JWT_PRIVATE_KEY.replace(/\\n/g, "\n");
const PUBLIC_KEY = env.JWT_PUBLIC_KEY.replace(/\\n/g, "\n");
const PRIVATE_KEY_OBJECT = createPrivateKey(PRIVATE_KEY);
const PUBLIC_KEY_OBJECT = createPublicKey(PUBLIC_KEY);

export const generateTokenPair = async (
  userId: string,
  deviceInfo?: IDeviceInfo,
): Promise<TokenPair> => {
  const expiresAt = new Date(
    Date.now() + constants.REFRESH_TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000,
  );

  const session = await prisma.refreshToken.create({
    data: {
      userId,
      deviceId: deviceInfo?.deviceId ?? null,
      userAgent: deviceInfo?.userAgent ?? null,
      ipAddress: deviceInfo?.ipAddress ?? null,
      isRevoked: false,
      expiresAt,
    },
  });

  const refreshToken = jwt.sign(
    {
      sub: userId,
      tokenId: session.id,
      type: "refresh",
    } satisfies IRefreshTokenPayload,
    PRIVATE_KEY_OBJECT,
    {
      algorithm: "RS256",
      expiresIn: `${constants.REFRESH_TOKEN_EXPIRY_DAYS}d`,
    },
  );

  const accessToken = jwt.sign(
    { sub: userId, type: "access", tokenId: session.id } satisfies IAccessTokenPayload,
    PRIVATE_KEY_OBJECT,
    {
      algorithm: "RS256",
      expiresIn: `${constants.ACCESS_TOKEN_EXPIRY_SECONDS}s`,
    },
  );

  return { accessToken, refreshToken };
};

export const verifyAccessToken = (token: string): IAccessTokenPayload | null => {
  try {
    const decoded = jwt.verify(token, PUBLIC_KEY_OBJECT) as IAccessTokenPayload;
    return decoded.type === "access" ? decoded : null;
  } catch {
    return null;
  }
};

export const verifyRefreshToken = async (token: string): Promise<IRefreshTokenPayload | null> => {
  try {
    const decoded = jwt.verify(token, PUBLIC_KEY_OBJECT) as IRefreshTokenPayload;
    if (decoded.type !== "refresh") return null;

    const stored = await prisma.refreshToken.findUnique({
      where: { id: decoded.tokenId },
      select: { userId: true },
    });

    if (!stored) return null;
    if (stored.userId !== decoded.sub) return null;

    return decoded;
  } catch {
    return null;
  }
};

const verifyRefreshTokenSignatureOnly = (token: string): IRefreshTokenPayload | null => {
  try {
    const decoded = jwt.verify(token, PUBLIC_KEY_OBJECT) as IRefreshTokenPayload;
    return decoded.type === "refresh" ? decoded : null;
  } catch {
    return null;
  }
};

export const refreshTokens = async (
  refreshToken: string,
  deviceInfo?: IDeviceInfo,
): Promise<TokenPair> => {
  const decoded = verifyRefreshTokenSignatureOnly(refreshToken);
  if (!decoded) throw createHttpError(401, "Invalid or expired refresh token");

  const revokeResult = await prisma.refreshToken.updateMany({
    where: {
      id: decoded.tokenId,
      userId: decoded.sub,
      isRevoked: false,
      expiresAt: { gt: new Date() },
    },
    data: { isRevoked: true },
  });

  if (revokeResult.count !== 1) {
    throw createHttpError(401, "Invalid or expired refresh token");
  }

  return generateTokenPair(decoded.sub, deviceInfo);
};

export const revokeRefreshToken = async (refreshToken: string): Promise<void> => {
  const decoded = await verifyRefreshToken(refreshToken);
  if (!decoded) return;

  await prisma.refreshToken.update({
    where: { id: decoded.tokenId },
    data: { isRevoked: true },
  });
};

export const revokeAllRefreshTokens = async (userId: string): Promise<void> => {
  await prisma.refreshToken.updateMany({
    where: { userId },
    data: { isRevoked: true },
  });
};

export const revokeOtherRefreshTokens = async (
  userId: string,
  currentRefreshToken: string,
): Promise<void> => {
  const decoded = await verifyRefreshToken(currentRefreshToken);
  if (!decoded) return;

  await prisma.refreshToken.updateMany({
    where: {
      userId,
      id: { not: decoded.tokenId },
    },
    data: { isRevoked: true },
  });
};

export const cleanupExpiredTokens = async (): Promise<number> => {
  const { count } = await prisma.refreshToken.deleteMany({
    where: { expiresAt: { lt: new Date() } },
  });
  return count;
};
