import { signupMember } from "@/controllers/memberController.js";
import express from "express";
import zodValidatorMiddleware from "@/middlewares/zodValidationMiddleware.js";
import { createFirstMemberValidationSchema } from "@/zodValidationSchema/memberValidationSchema.js";

const router = express.Router();

router.post("/", zodValidatorMiddleware(createFirstMemberValidationSchema), signupMember);

export default router;
