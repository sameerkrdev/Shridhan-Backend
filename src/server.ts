import env from "@/config/dotenv.js";
import app from "@/app.js";
import logger from "@/config/logger.js";
import redisClient from "@/config/redis.js";
import type { Server } from "node:http";

let server: Server;

// Graceful shutdown
const shutdown = async (code = 0) => {
  logger.info("Shutting down application...");

  try {
    // Stop accepting new HTTP requests
    if (server) {
      logger.info("Closing HTTP server...");
      await new Promise((resolve) => server.close(resolve));
      logger.info("HTTP server closed");
    }

    // Gracefully close Redis
    if (redisClient.status === "ready") {
      logger.info("Closing Redis connection...");
      await redisClient.quit();
      logger.info("Redis connection closed");
    }
  } catch (err) {
    logger.error("Error during shutdown:", err);
  } finally {
    process.exit(code);
  }
};

// Process-level handlers
process.on("SIGINT", () => {
  void shutdown(0);
});
process.on("SIGTERM", () => {
  void shutdown(0);
});

process.on("unhandledRejection", (reason) => {
  logger.error("Unhandled Rejection:", reason);
  void shutdown(1);
});

process.on("uncaughtException", (err) => {
  logger.error("Uncaught Exception:", err);
  void shutdown(1);
});

// Redis lifecycle events (ioredis)
redisClient.on("ready", () => {
  logger.info("Redis is ready");
});

redisClient.on("error", (err) => {
  logger.error("Redis error:", err);
  void shutdown(1);
});

redisClient.on("end", () => {
  logger.error("Redis connection ended");
  void shutdown(1);
});

// Start server
const startServer = async () => {
  try {
    // Connect Redis FIRST
    await redisClient.connect();
    logger.info("Connected to Redis");

    // Start HTTP server ONLY after Redis is ready
    server = app.listen(env.PORT, () => {
      logger.info(`Server running on port ${env.PORT}`);
    });
  } catch (err) {
    logger.error("Startup failure:", err);
    void shutdown(1);
  }
};

void startServer();
