import type {
  OtpSendValidationSchema,
  SendEmailOtpValidationSchema,
  SendPhoneOtpValidationSchema,
  VerifyEmailOtpValidationSchema,
  VerifyOtpValidationSchema,
  VerifyPhoneOtpValidationSchema,
} from "@/zodValidationSchema/otpValidationSchema.js";

export interface ISendOtpRequest {
  body: OtpSendValidationSchema["body"];
}

export interface IVerifyOtpRequest {
  body: VerifyOtpValidationSchema["body"];
}

export interface ISendPhoneOtpRequest {
  body: SendPhoneOtpValidationSchema["body"];
}

export interface IVerifyPhoneOtpRequest {
  body: VerifyPhoneOtpValidationSchema["body"];
}
export interface ISendEmailOtpRequest {
  body: SendEmailOtpValidationSchema["body"];
}

export interface IVerifyEmailOtpRequest {
  body: VerifyEmailOtpValidationSchema["body"];
}
