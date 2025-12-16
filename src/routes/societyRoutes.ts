import express from "express";
import zodValidatorMiddleware from "@/middlewares/zodValidationMiddleware.js";
import { onboardSocietyValidationSchema } from "@/zodValidationSchema/societyValidationSchema.js";
import { onboardSociety } from "@/controllers/societyController.js";
import { authenticaionMiddleware } from "@/middlewares/authenticationMiddleware.js";
import type { IOnboardSocietyRequest } from "@/types/society.js";

const router = express.Router();

router.post(
  "/",
  authenticaionMiddleware,
  zodValidatorMiddleware(onboardSocietyValidationSchema),
  (req, res, next) => onboardSociety(req as IOnboardSocietyRequest, res, next), // onboardSociety as unknown as RequestHandler,
);

export default router;
