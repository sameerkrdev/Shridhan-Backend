import { signup, login } from "@/controllers/authController.js";
import express from "express";
import zodValidatorMiddleware from "@/middlewares/zodValidationMiddleware.js";
import {
  createFirstMemberValidationSchema,
  loginValidationSchema,
} from "@/zodValidationSchema/memberValidationSchema.js";

const router = express.Router();

router.post("/signup", zodValidatorMiddleware(createFirstMemberValidationSchema), signup);
router.post("/login", zodValidatorMiddleware(loginValidationSchema), login);

export default router;
