import jwt from "jsonwebtoken";
import prisma from "@/config/prisma.js";
import createHttpError from "http-errors";
import env from "@/config/dotenv.js";
import type { IAccessTokenPayload, IDeviceInfo, IRefreshTokenPayload } from "@/types/authType.js";
import { constants } from "@/constants.js";

interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

// ================== Load Keys (multiline fix) ==================
const PRIVATE_KEY = env.JWT_PRIVATE_KEY.replace(/\\n/g, "\n");
const PUBLIC_KEY = env.JWT_PUBLIC_KEY.replace(/\\n/g, "\n");

// ================== Generate Token Pair ==================
export const generateTokenPair = async (
  memberId: string,
  deviceInfo?: IDeviceInfo,
): Promise<TokenPair> => {
  const expiresAt = new Date(
    Date.now() + constants.REFRESH_TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000,
  );

  // 1) Create DB session entry
  const session = await prisma.refreshToken.create({
    data: {
      memberId,
      deviceId: deviceInfo?.deviceId ?? null,
      userAgent: deviceInfo?.userAgent ?? null,
      ipAddress: deviceInfo?.ipAddress ?? null,
      isRevoked: false,
      expiresAt,
    },
  });

  // 2) Sign refresh JWT
  const refreshToken = jwt.sign(
    {
      sub: memberId,
      tokenId: session.id,
      type: "refresh",
    } satisfies IRefreshTokenPayload,
    PRIVATE_KEY,
    {
      algorithm: "RS256",
      expiresIn: `${constants.REFRESH_TOKEN_EXPIRY_DAYS}d`,
    },
  );

  // 3) sign access token
  const accessToken = jwt.sign(
    { sub: memberId, type: "access", tokenId: session.id } satisfies IAccessTokenPayload,
    PRIVATE_KEY,
    {
      algorithm: "RS256",
      expiresIn: `${constants.ACCESS_TOKEN_EXPIRY_SECONDS}s`,
    },
  );

  return {
    accessToken,
    refreshToken,
  };
};

// ================== Verify Access Token ==================
export const verifyAccessToken = (token: string): IAccessTokenPayload | null => {
  try {
    const decoded = jwt.verify(token, PUBLIC_KEY) as IAccessTokenPayload;
    return decoded.type === "access" ? decoded : null;
  } catch {
    return null;
  }
};

// ================== Verify Refresh Token ==================
export const verifyRefreshToken = async (token: string): Promise<IRefreshTokenPayload | null> => {
  try {
    const decoded = jwt.verify(token, PUBLIC_KEY) as IRefreshTokenPayload;
    if (decoded.type !== "refresh") return null;

    const stored = await prisma.refreshToken.findUnique({
      where: { id: decoded.tokenId },
    });

    if (!stored) return null;
    if (stored.isRevoked) return null;
    if (stored.expiresAt < new Date()) return null;

    return decoded;
  } catch {
    return null;
  }
};

// ================== Token Rotation ==================
export const refreshTokens = async (
  refreshToken: string,
  deviceInfo?: IDeviceInfo,
): Promise<TokenPair> => {
  const decoded = await verifyRefreshToken(refreshToken);

  if (!decoded) throw createHttpError(401, "Invalid or expired refresh token");

  // revoke existing session
  await prisma.refreshToken.update({
    where: { id: decoded.tokenId },
    data: { isRevoked: true },
  });

  // issue new token pair
  return generateTokenPair(decoded.sub, deviceInfo);
};

// ================== Revocation Utilities ==================
export const revokeRefreshToken = async (refreshToken: string): Promise<void> => {
  const decoded = await verifyRefreshToken(refreshToken);
  if (!decoded) return;

  await prisma.refreshToken.update({
    where: { id: decoded.tokenId },
    data: { isRevoked: true },
  });
};

export const revokeAllRefreshTokens = async (memberId: string): Promise<void> => {
  await prisma.refreshToken.updateMany({
    where: { memberId },
    data: { isRevoked: true },
  });
};

export const revokeOtherRefreshTokens = async (
  memberId: string,
  currentRefreshToken: string,
): Promise<void> => {
  const decoded = await verifyRefreshToken(currentRefreshToken);
  if (!decoded) return;

  await prisma.refreshToken.updateMany({
    where: {
      memberId,
      id: { not: decoded.tokenId },
    },
    data: { isRevoked: true },
  });
};

export const cleanupExpiredTokens = async (): Promise<number> => {
  const { count } = await prisma.refreshToken.deleteMany({
    where: {
      expiresAt: { lt: new Date() },
    },
  });

  return count;
};
