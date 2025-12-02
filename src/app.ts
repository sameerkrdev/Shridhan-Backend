import type { Request, Response, NextFunction } from "express";
import express from "express";
import morgan from "morgan";
import type { HttpError } from "http-errors";
import logger from "@/config/logger.js";
import memberRouter from "@/routes/memberRoutes.js";

const app = express();
app.use(express.json());

// Morgan logs HTTP requests
app.use(morgan("combined"));

app.use("/api/v1/members", memberRouter);

app.get("/", (_req, res) => {
  res.json({ message: "Welcome to Shridhan", status: "Server is running!" });
});

// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: HttpError, req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof Error) {
    const statusCode = err.status || err.statusCode || 500;

    // Log complete error safely
    logger.error({
      name: err.name,
      message: err.message,
      stack: err.stack,
      method: req.method,
      path: req.originalUrl,
      params: req.params,
      query: req.query,
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      body: { ...req.body, ...((req.body as { password: string }).password && { password: null }) },

      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      details: err.details,
    });

    // Send clean structured response
    return res.status(statusCode).json({
      success: false,
      message: err.message || "Internal Server Error",
      method: req.method,
      path: req.originalUrl,
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      details: err.details,
    });
  }
});

export default app;
