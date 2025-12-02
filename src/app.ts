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

    logger.error({
      message: err.message,
      name: err.name,
      stack: err.stack,
      method: req.method,
      path: req.originalUrl,
      params: req.params,
      query: req.query,
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      body: { ...req.body, ...((req.body as { password: string }).password && { password: null }) },
    });

    // Send response to client
    res.status(statusCode).json({
      error: [
        {
          type: err.name,
          msg: err.message,
          method: req.method,
          path: req.originalUrl,
        },
      ],
    });
  }
});

export default app;
