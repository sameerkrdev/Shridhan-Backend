import type { Request, Response, NextFunction } from "express";
import createHttpError from "http-errors";
import env from "@/config/dotenv.js";

export const internalDeveloperAuthMiddleware = () => {
  return (req: Request, _res: Response, next: NextFunction) => {
    try {
      if (!env.INTERNAL_DEVELOPER_API_KEY) {
        throw createHttpError(503, "Internal developer API key is not configured");
      }

      const incomingKey = req.headers["x-internal-api-key"];
      const providedKey = Array.isArray(incomingKey) ? incomingKey[0] : incomingKey;

      if (!providedKey || providedKey !== env.INTERNAL_DEVELOPER_API_KEY) {
        throw createHttpError(403, "Invalid internal developer API key");
      }

      next();
    } catch (error) {
      next(error);
    }
  };
};
