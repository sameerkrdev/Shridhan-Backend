import type {
  ISendEmailOtpRequest,
  ISendOtpRequest,
  ISendPhoneOtpRequest,
  IVerifyEmailOtpRequest,
  IVerifyOtpRequest,
  IVerifyPhoneOtpRequest,
} from "@/types/otpTypes.js";
import { createAndStoreOtp, verifyAndConsumeOtp } from "@/services/otpService.js";
import { sendWhatsappOtp } from "@/services/whatsappService.js";
import { sendEmailOtp } from "@/services/emailService.js";
import type { Response, NextFunction } from "express";

export const sendOtp = async (req: ISendOtpRequest, res: Response, next: NextFunction) => {
  try {
    const { phone, email, reason } = req.body;

    if (phone) {
      const phoneKey = `otp:${reason}:phone:${phone}`;
      const phoneOtp = await createAndStoreOtp(phoneKey);
      await sendWhatsappOtp(phone, phoneOtp, reason);
    }

    if (email) {
      const emailKey = `otp:${reason}:email:${email}`;
      const emailOtp = await createAndStoreOtp(emailKey);
      await sendEmailOtp(email, emailOtp, reason);
    }

    res.status(200).json({ message: "OTP sent successfully" });
  } catch (error) {
    next(error);
  }
};

export const verifyOtp = async (req: IVerifyOtpRequest, res: Response, next: NextFunction) => {
  try {
    const { phone, email, reason, otp } = req.body;

    if (!phone && !email) {
      res.status(400).json({ message: "Either phone or email is required" });
      return;
    }

    if (phone) {
      const phoneKey = `otp:${reason}:phone:${phone}`;
      await verifyAndConsumeOtp(phoneKey, otp);
    }

    if (email) {
      const emailKey = `otp:${reason}:email:${email}`;
      await verifyAndConsumeOtp(emailKey, otp);
    }

    res.status(200).json({ message: "OTP verified successfully" });
  } catch (error) {
    next(error);
  }
};

export const sendPhoneOtp = async (
  req: ISendPhoneOtpRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { phone, reason } = req.body;

    const key = `otp:${reason}:phone:${phone}`;
    const otp = await createAndStoreOtp(key);
    await sendWhatsappOtp(phone, otp, reason);

    res.status(200).json({ message: "Phone OTP sent successfully" });
  } catch (error) {
    next(error);
  }
};

export const verifyPhoneOtp = async (
  req: IVerifyPhoneOtpRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { phone, reason, otp } = req.body;

    const key = `otp:${reason}:phone:${phone}`;
    await verifyAndConsumeOtp(key, otp);

    res.status(200).json({ message: "Phone OTP verified successfully" });
  } catch (error) {
    next(error);
  }
};

export const senEmaileOtp = async (
  req: ISendEmailOtpRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { email, reason } = req.body;

    const key = `otp:${reason}:email:${email}`;
    const otp = await createAndStoreOtp(key);

    await sendEmailOtp(email, otp, reason);

    res.status(200).json({ message: "Email OTP sent successfully" });
  } catch (error) {
    next(error);
  }
};

export const verifyEmailOtp = async (
  req: IVerifyEmailOtpRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { email, reason, otp } = req.body;

    const key = `otp:${reason}:email:${email}`;
    await verifyAndConsumeOtp(key, otp);

    res.status(200).json({ message: "Email OTP verified successfully" });
  } catch (error) {
    next(error);
  }
};
