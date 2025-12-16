import { constants, otpContansts } from "@/constants.js";
import { z } from "zod";

export const otpSendValidationSchema = z.object({
  body: z.object({
    reason: z.enum(Object.values(otpContansts)),
    phone: z.string(),
    email: z.email().optional(),
  }),
});
export type OtpSendValidationSchema = z.infer<typeof otpSendValidationSchema>;

export const verifyOtpValidationSchema = z.object({
  body: z.object({
    reason: z.enum(Object.values(otpContansts)),
    phone: z.string(),
    email: z.email().optional(),
    otp: z.string().length(constants.OTP_LENGTH),
  }),
});
export type VerifyOtpValidationSchema = z.infer<typeof verifyOtpValidationSchema>;

export const sendPhoneOtpValidationSchema = z.object({
  body: z.object({
    reason: z.enum(Object.values(otpContansts)),
    phone: z.string(),
  }),
});
export type SendPhoneOtpValidationSchema = z.infer<typeof sendPhoneOtpValidationSchema>;

export const verifyPhoneOtpValidationSchema = z.object({
  body: z.object({
    reason: z.enum(Object.values(otpContansts)),
    phone: z.string(),
    otp: z.string().length(constants.OTP_LENGTH),
  }),
});
export type VerifyPhoneOtpValidationSchema = z.infer<typeof verifyPhoneOtpValidationSchema>;

export const sendEmailOtpValidationSchema = z.object({
  body: z.object({
    reason: z.enum(Object.values(otpContansts)),
    email: z.email(),
  }),
});
export type SendEmailOtpValidationSchema = z.infer<typeof sendEmailOtpValidationSchema>;

export const verifyEmailOtpValidationSchema = z.object({
  body: z.object({
    reason: z.enum(Object.values(otpContansts)),
    email: z.email(),
    otp: z.string().length(constants.OTP_LENGTH),
  }),
});
export type VerifyEmailOtpValidationSchema = z.infer<typeof verifyEmailOtpValidationSchema>;
