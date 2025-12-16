import nodemailer from "nodemailer";
import env from "@/config/dotenv.js";
import logger from "@/config/logger.js";

const transporter = nodemailer.createTransport({
  host: env.SMTP_HOST,
  port: Number(env.SMTP_PORT),
  secure: Number(env.SMTP_PORT) === 465,
  auth: {
    user: env.SMTP_USER,
    pass: env.SMTP_PASS,
  },
});

export const sendEmailOtp = async (email: string, otp: string, reason: string) => {
  const subject = `Your OTP for ${reason}`;
  const text = `Your verification code is ${otp} for ${reason}. It will expire in a few minutes. Do not share this code with anyone.`;

  const info = await transporter.sendMail({
    from: env.EMAIL_FROM,
    to: email,
    subject,
    text,
  });

  logger.info("Email OTP sent", { to: email, reason, messageId: info.messageId });
};
