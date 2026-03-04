import {
  signup,
  login,
  refresh,
  logout,
  checkUserExists,
  session,
} from "@/controllers/authController.js";
import express from "express";
import zodValidatorMiddleware from "@/middlewares/zodValidationMiddleware.js";
import {
  createFirstUserValidationSchema,
  loginValidationSchema,
  userExistsValidationSchema,
  refreshValidationSchema,
} from "@/zodValidationSchema/memberValidationSchema.js";

const router: express.Router = express.Router();

router.post("/signup", zodValidatorMiddleware(createFirstUserValidationSchema), signup);
router.post("/login", zodValidatorMiddleware(loginValidationSchema), login);
router.post("/exists", zodValidatorMiddleware(userExistsValidationSchema), checkUserExists);
router.post("/refresh", zodValidatorMiddleware(refreshValidationSchema), refresh);
router.get("/session", session);
router.post("/logout", zodValidatorMiddleware(refreshValidationSchema), logout);

export default router;
