import { signup, login, refresh, logout } from "@/controllers/authController.js";
import express from "express";
import zodValidatorMiddleware from "@/middlewares/zodValidationMiddleware.js";
import {
  createFirstMemberValidationSchema,
  loginValidationSchema,
  refreshValidationSchema,
} from "@/zodValidationSchema/memberValidationSchema.js";

const router: express.Router = express.Router();

router.post("/signup", zodValidatorMiddleware(createFirstMemberValidationSchema), signup);
router.post("/login", zodValidatorMiddleware(loginValidationSchema), login);
router.post("/refresh", zodValidatorMiddleware(refreshValidationSchema), refresh);
router.post("/logout", zodValidatorMiddleware(refreshValidationSchema), logout);

export default router;
