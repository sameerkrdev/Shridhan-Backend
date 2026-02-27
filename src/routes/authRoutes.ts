import { signup, login, refresh, logout, checkMemberExists } from "@/controllers/authController.js";
import express from "express";
import zodValidatorMiddleware from "@/middlewares/zodValidationMiddleware.js";
import {
  createFirstMemberValidationSchema,
  loginValidationSchema,
  memberExistsValidationSchema,
  refreshValidationSchema,
} from "@/zodValidationSchema/memberValidationSchema.js";

const router: express.Router = express.Router();

router.post("/signup", zodValidatorMiddleware(createFirstMemberValidationSchema), signup);
router.post("/login", zodValidatorMiddleware(loginValidationSchema), login);
router.post("/exists", zodValidatorMiddleware(memberExistsValidationSchema), checkMemberExists);
router.post("/refresh", zodValidatorMiddleware(refreshValidationSchema), refresh);
router.post("/logout", zodValidatorMiddleware(refreshValidationSchema), logout);

export default router;
