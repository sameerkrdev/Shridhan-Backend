import { config } from "dotenv";
import { cleanEnv, port, str } from "envalid";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

config({
  path: join(__dirname, "../../.env"),
});

const env = cleanEnv(process.env, {
  PORT: port({ default: 3000 }),
  NODE_ENV: str({ choices: ["development", "test", "production"], default: "development" }),

  DATABASE_URL: str(),

  RAZORPAY_KEY_ID: str(),
  RAZORPAY_KEY_SECRET: str(),
  RAZORPAY_PLAN_ID: str(),
  RAZORPAY_WEBHOOK_SECRET: str(),
  RAZORPAY_WEBHOOK_OLD_SECRETS: str({ default: "" }),

  INTERNAL_DEVELOPER_API_KEY: str({ default: "" }),

  JWT_PUBLIC_KEY: str(),
  JWT_PRIVATE_KEY: str(),

  COOKIE_DOMAIN: str({ default: ".shridhan.in" }),

  REDIS_URI: str(),

  SMTP_HOST: str(),
  SMTP_PORT: str(),
  SMTP_USER: str(),
  SMTP_PASS: str(),
  EMAIL_FROM: str(),

  WHATSAPP_ACCESS_TOKEN: str(),
  WHATSAPP_PHONE_NUMBER_ID: str(),

  FIREBASE_PROJECT_ID: str(),
  FIREBASE_CLIENT_EMAIL: str(),
  FIREBASE_PRIVATE_KEY: str(),

  R2_ACCOUNT_ID: str(),
  R2_ACCESS_KEY_ID: str(),
  R2_SECRET_ACCESS_KEY: str(),
  R2_BUCKET_NAME: str(),
  R2_PUBLIC_BASE_URL: str(),

  FRONTEND_URLS: str({ default: "http://localhost:5173" }),
});

export default env;
