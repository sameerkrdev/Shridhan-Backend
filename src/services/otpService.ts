import crypto from "node:crypto";
import { constants } from "@/constants.js";
import redisClient from "@/config/redis.js";
import createHttpError from "http-errors";

export const generateNumericOtp = () => {
  const min = 10 ** (constants.OTP_LENGTH - 1);
  const max = 10 ** constants.OTP_LENGTH - 1;
  return crypto.randomInt(min, max).toString();
};

export const createAndStoreOtp = async (key: string) => {
  const otp = generateNumericOtp();

  await redisClient.set(key, otp, "EX", constants.OTP_EXPIRY);

  return otp;
};

export const verifyAndConsumeOtp = async (key: string, otp: string) => {
  const storedOtp = await redisClient.get(key);

  if (!storedOtp) {
    throw createHttpError(400, "OTP expired or not found");
  }

  if (storedOtp !== otp) {
    throw createHttpError(400, "Invalid OTP");
  }

  await redisClient.del(key);
};
