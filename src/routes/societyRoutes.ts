import express from "express";
import zodValidatorMiddleware from "@/middlewares/zodValidationMiddleware.js";
import { onboardSocietyValidationSchema } from "@/zodValidationSchema/societyValidationSchema.js";
import { onboardSociety } from "@/controllers/societyController.js";

const router = express.Router();

router.post("/", zodValidatorMiddleware(onboardSocietyValidationSchema), onboardSociety);

export default router;
