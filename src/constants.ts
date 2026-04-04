export const constants = {
  ACCESS_TOKEN_EXPIRY_SECONDS: 1800,
  REFRESH_TOKEN_EXPIRY_DAYS: 7,
  /** If two tabs refresh with the same cookie at once, one revokes before the other runs. Allow a short replay window so the second request still gets a new pair. */
  REFRESH_TOKEN_CONCURRENT_REPLAY_GRACE_MS: 10_000,
  ACCESS_COOKIE_NAME: "shridhan-access",
  REFRESH_COOKIE_NAME: "shridhan-refresh",

  OTP_EXPIRY: 300,
  OTP_LENGTH: 6,
  MAX_ATTEMPTS: 3,

  WHATSAPP_OTP_TEMPLATE_NAME: "jaspers_market_order_confirmation_v1",
  // WHATSAPP_OTP_TEMPLATE_NAME: "reference_code",
};

export const otpContansts = {
  LOGIN: "login",
  VERIFY_PHONE: "verify-phone",
  VERIFY_EMIAL: "verify-email",
} as const;
