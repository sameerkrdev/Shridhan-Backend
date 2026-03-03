import express from "express";
import zodValidatorMiddleware from "@/middlewares/zodValidationMiddleware.js";
import {
  createSetupFeePaymentLinkValidationSchema,
  getSocietyBillingOverviewValidationSchema,
  onboardSocietyValidationSchema,
  resolveMemberSocietyValidationSchema,
  setupSubscriptionValidationSchema,
  setupPermitRulesValidationSchema,
} from "@/zodValidationSchema/societyValidationSchema.js";
import {
  createSetupFeeLink,
  getBillingOverview,
  listMemberSocieties,
  onboardSociety,
  resolveSelectedSociety,
  setupSubscription,
  setupPermitRules,
} from "@/controllers/societyController.js";
import { authenticaionMiddleware } from "@/middlewares/authenticationMiddleware.js";
import type {
  IOnboardSocietyRequest,
  IResolveMemberSocietyRequest,
  ICreateSetupFeePaymentLinkRequest,
  IGetSocietyBillingOverviewRequest,
  ISetupSubscriptionRequest,
  ISetupPermitRulesRequest,
  ISocietyUserRequest,
} from "@/types/society.js";

const router: express.Router = express.Router();

router.post(
  "/",
  authenticaionMiddleware(),
  zodValidatorMiddleware(onboardSocietyValidationSchema),
  (req, res, next) => onboardSociety(req as IOnboardSocietyRequest, res, next), // onboardSociety as unknown as RequestHandler,
);

router.get("/member-societies", authenticaionMiddleware(), (req, res, next) =>
  listMemberSocieties(req as ISocietyUserRequest, res, next),
);

router.get(
  "/billing/:societyId",
  authenticaionMiddleware(),
  zodValidatorMiddleware(getSocietyBillingOverviewValidationSchema),
  (req, res, next) => getBillingOverview(req as IGetSocietyBillingOverviewRequest, res, next),
);

router.post(
  "/member-societies/resolve",
  authenticaionMiddleware(),
  zodValidatorMiddleware(resolveMemberSocietyValidationSchema),
  (req, res, next) => resolveSelectedSociety(req as IResolveMemberSocietyRequest, res, next),
);

router.post(
  "/permit/setup",
  authenticaionMiddleware(),
  zodValidatorMiddleware(setupPermitRulesValidationSchema),
  (req, res, next) => setupPermitRules(req as ISetupPermitRulesRequest, res, next),
);

router.post(
  "/setup-fee/link",
  authenticaionMiddleware(),
  zodValidatorMiddleware(createSetupFeePaymentLinkValidationSchema),
  (req, res, next) => createSetupFeeLink(req as ICreateSetupFeePaymentLinkRequest, res, next),
);

router.post(
  "/subscription/setup",
  authenticaionMiddleware(),
  zodValidatorMiddleware(setupSubscriptionValidationSchema),
  (req, res, next) => setupSubscription(req as ISetupSubscriptionRequest, res, next),
);

export default router;
