export const constants = {
  ACCESS_TOKEN_EXPIRY_SECONDS: 300,
  REFRESH_TOKEN_EXPIRY_DAYS: 7,
  ACCESS_COOKIE_NAME: "shridhan-access",
  REFRESH_COOKIE_NAME: "shridhan-refresh",

  OTP_EXPIRY: 300,
  OTP_LENGTH: 6,
  MAX_ATTEMPTS: 3,

  WHATSAPP_OTP_TEMPLATE_NAME: "reference_code",
};

export const otpContansts = {
  LOGIN: "login",
  VERIFY_PHONE: "verify-phone",
  VERIFY_EMIAL: "verify-email",
} as const;
