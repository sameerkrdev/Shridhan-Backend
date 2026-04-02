import express from "express";
import { authenticaionMiddleware } from "@/middlewares/authenticationMiddleware.js";
import { billingAuthorizationMiddleware } from "@/middlewares/billingAuthorizationMiddleware.js";
import zodValidatorMiddleware from "@/middlewares/zodValidationMiddleware.js";
import { listActivitiesSchema } from "@/zodValidationSchema/activityValidationSchema.js";
import { getActivities } from "@/controllers/activityController.js";
import type { IAuthorizedRequest } from "@/types/authType.js";

const router: express.Router = express.Router();
const auth = authenticaionMiddleware();
const billingGate = billingAuthorizationMiddleware();

router.get(
  "/",
  auth,
  billingGate,
  zodValidatorMiddleware(listActivitiesSchema),
  (req, res, next) => getActivities(req as IAuthorizedRequest, res, next),
);

export default router;
