import type { Request, Response, NextFunction } from "express";
import express from "express";
import morgan from "morgan";
import type { HttpError } from "http-errors";
import logger from "@/config/logger.js";
import prisma from "./config/prisma.js";

const app = express();
app.use(express.json());

// Morgan logs HTTP requests
app.use(morgan("combined"));

app.get("/", (_req, res) => {
  res.json({ message: "Welcome to Shridhan", status: "Server is running!" });
});

app.post("/users", async (req, res) => {
  try {
    const user = await prisma.user.create({
      data: {
        name: req.body.name,
        email: req.body.email,
        phoneNumber: req.body.phoneNumber,
      },
    });
    res.json({ success: true, user });
  } catch (error) {
    res
      .status(500)
      .json({ success: false, error: error instanceof Error ? error.message : "Unknown error" });
  }
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
      body: { ...req.body, password: null },
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
