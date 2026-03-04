import express from "express";
import zodValidatorMiddleware from "@/middlewares/zodValidationMiddleware.js";
import { internalDeveloperAuthMiddleware } from "@/middlewares/internalDeveloperAuthMiddleware.js";
import {
  approveSocietyBillingOverride,
  patchSocietyBillingPolicy,
} from "@/controllers/internalBillingController.js";
import {
  approveSocietyBillingOverrideValidationSchema,
  updateSocietyBillingPolicyValidationSchema,
} from "@/zodValidationSchema/internalBillingValidationSchema.js";
import type { IUpdateSocietyBillingPolicyRequest } from "@/types/internalBilling.js";

const router: express.Router = express.Router();

router.patch(
  "/societies/:societyId/policy",
  internalDeveloperAuthMiddleware(),
  zodValidatorMiddleware(updateSocietyBillingPolicyValidationSchema),
  (req, res, next) =>
    patchSocietyBillingPolicy(req as IUpdateSocietyBillingPolicyRequest, res, next),
);

router.post(
  "/societies/:societyId/approve",
  internalDeveloperAuthMiddleware(),
  zodValidatorMiddleware(approveSocietyBillingOverrideValidationSchema),
  (req, res, next) =>
    approveSocietyBillingOverride(req as IUpdateSocietyBillingPolicyRequest, res, next),
);

export default router;
