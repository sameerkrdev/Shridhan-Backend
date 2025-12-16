import express from "express";
import {
  sendOtp,
  verifyOtp,
  sendPhoneOtp,
  verifyPhoneOtp,
  senEmaileOtp,
  verifyEmailOtp,
} from "@/controllers/otpContoller.js";
import zodValidatorMiddleware from "@/middlewares/zodValidationMiddleware.js";
import {
  otpSendValidationSchema,
  verifyOtpValidationSchema,
  sendPhoneOtpValidationSchema,
  verifyPhoneOtpValidationSchema,
  sendEmailOtpValidationSchema,
  verifyEmailOtpValidationSchema,
} from "@/zodValidationSchema/otpValidationSchema.js";

const router = express.Router();

router.post("/send", zodValidatorMiddleware(otpSendValidationSchema), sendOtp);
router.post("/verify", zodValidatorMiddleware(verifyOtpValidationSchema), verifyOtp);

router.post("/phone/send", zodValidatorMiddleware(sendPhoneOtpValidationSchema), sendPhoneOtp);
router.post(
  "/phone/verify",
  zodValidatorMiddleware(verifyPhoneOtpValidationSchema),
  verifyPhoneOtp,
);

router.post("/email/send", zodValidatorMiddleware(sendEmailOtpValidationSchema), senEmaileOtp);
router.post(
  "/email/verify",
  zodValidatorMiddleware(verifyEmailOtpValidationSchema),
  verifyEmailOtp,
);

export default router;
