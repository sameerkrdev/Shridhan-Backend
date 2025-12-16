import type { Request, Response, NextFunction } from "express";
import express from "express";
import morgan from "morgan";
import type { HttpError } from "http-errors";
import logger from "@/config/logger.js";
import memberRouter from "@/routes/authRoutes.js";
import societyRouter from "@/routes/societyRoutes.js";
import otpRouter from "@/routes/otpRoutes.js";

const app = express();
app.use(express.json());

// Morgan logs HTTP requests
app.use(morgan("combined"));

app.use("/api/v1/members", memberRouter);
app.use("/api/v1/societies", societyRouter);
app.use("/api/v1/otp", otpRouter);

app.get("/", (_req, res) => {
  res.json({ message: "Welcome to Shridhan", status: "Server is running!" });
});

app.post("/users", (req, res) => {
  try {
    res.json({ success: true });
  } catch (error) {
    res
      .status(500)
      .json({ success: false, error: error instanceof Error ? error.message : "Unknown error" });
  }
});

// export function authorize(resource: string, action: string) {
//   return async (req: Request, res: Response, next: NextFunction) => {
//     const userId = req.body.userId;
//     const societyId = req.body.societyId;

//     const r = await permit.api.getUser(userId);

//     const allowed = await permit.check(userId, action, {
//       type: resource,
//       tenant: societyId,
//     });
//     console.log("check ->", {
//       userId,
//       action,
//       resource,
//       tenant: societyId,
//     });
//     console.log("permit tenant roles:", r.associated_tenants);

//     console.log(allowed);

//     if (!allowed) {
//       return res.status(403).json({ message: "Forbidden" });
//     }

//     next();
//   };
// }

// app.post("/create-society", async (req, res) => {
//   try {
//     const { societyName, userId } = req.body;

//     const tenantData = {
//       key: "71",
//       name: societyName,
//     };

//     // await permit.api.createTenant(tenantData);

//     await permit.api.assignRole({
//       user: userId,
//       role: "admin",
//       tenant: tenantData.key,
//     });

//     await permit.api.assignRole({
//       user: "4",
//       role: "manager",
//       tenant: tenantData.key,
//     });

//     return res.json({
//       success: true,
//       tenantData,
//     });
//   } catch (error) {
//     console.error(error);
//     return res.status(500).json({ success: false, error });
//   }
// });

// app.post("/create-loan", authorize("loan", "create"), async (req, res) => {
//   try {
//     return res.json({
//       success: true,
//       message: "Loan created successfully",
//     });
//   } catch (error) {
//     console.error(error);
//     return res.status(500).json({ success: false, error });
//   }
// });

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
