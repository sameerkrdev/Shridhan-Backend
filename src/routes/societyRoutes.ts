import express from "express";
import zodValidatorMiddleware from "@/middlewares/zodValidationMiddleware.js";
import {
  onboardSocietyValidationSchema,
  resolveMemberSocietyValidationSchema,
} from "@/zodValidationSchema/societyValidationSchema.js";
import {
  listMemberSocieties,
  onboardSociety,
  resolveSelectedSociety,
} from "@/controllers/societyController.js";
import { authenticaionMiddleware } from "@/middlewares/authenticationMiddleware.js";
import type {
  IOnboardSocietyRequest,
  IResolveMemberSocietyRequest,
  ISocietyMemberRequest,
} from "@/types/society.js";

const router: express.Router = express.Router();

router.post(
  "/",
  authenticaionMiddleware(),
  zodValidatorMiddleware(onboardSocietyValidationSchema),
  (req, res, next) => onboardSociety(req as IOnboardSocietyRequest, res, next), // onboardSociety as unknown as RequestHandler,
);

router.get("/member-societies", authenticaionMiddleware(), (req, res, next) =>
  listMemberSocieties(req as ISocietyMemberRequest, res, next),
);

router.post(
  "/member-societies/resolve",
  authenticaionMiddleware(),
  zodValidatorMiddleware(resolveMemberSocietyValidationSchema),
  (req, res, next) => resolveSelectedSociety(req as IResolveMemberSocietyRequest, res, next),
);

export default router;
