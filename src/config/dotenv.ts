import { config } from "dotenv";
import { cleanEnv, port, str } from "envalid";
import path from "node:path";

config({
  path: path.join(__dirname, "../../.env"),
});

const env = cleanEnv(process.env, {
  PORT: port(),
  NODE_ENV: str({ choices: ["development", "test", "production"] }),

  DATABASE_URL: str(),
});

export default env;
