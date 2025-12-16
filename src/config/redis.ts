import { Redis } from "ioredis";
import type { RedisOptions } from "ioredis";
import env from "@/config/dotenv.js";

const redisOptions: RedisOptions = {
  maxRetriesPerRequest: 3,
  enableReadyCheck: true,
  lazyConnect: false,
};

export const redisClient = new Redis(env.REDIS_URI, redisOptions);

export default redisClient;
