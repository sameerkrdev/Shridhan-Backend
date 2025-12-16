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
  PERMIT_API_KEY: str(),

  JWT_PUBLIC_KEY: str(),
  JWT_PRIVATE_KEY: str(),

  COOKIE_DOMAIN: str({ default: ".myapp.com" }),

  REDIS_URI: str(),

  SMTP_HOST: str(),
  SMTP_PORT: str(),
  SMTP_USER: str(),
  SMTP_PASS: str(),
  EMAIL_FROM: str(),

  WHATSAPP_ACCESS_TOKEN: str(),
  WHATSAPP_PHONE_NUMBER_ID: str(),
});

export default env;
