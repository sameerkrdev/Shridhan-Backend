import express from "express";
import { authenticaionMiddleware } from "@/middlewares/authenticationMiddleware.js";
import { getProfile, listMyMemberships, updateProfile } from "@/controllers/userController.js";
import zodValidatorMiddleware from "@/middlewares/zodValidationMiddleware.js";
import { updateUserProfileValidationSchema } from "@/zodValidationSchema/userValidationSchema.js";
import type { IAuthorizedRequest } from "@/types/authType.js";

const router: express.Router = express.Router();

router.get("/me", authenticaionMiddleware(), (req, res, next) =>
  getProfile(req as IAuthorizedRequest, res, next),
);

router.patch(
  "/me",
  authenticaionMiddleware(),
  zodValidatorMiddleware(updateUserProfileValidationSchema),
  (req, res, next) => updateProfile(req as IAuthorizedRequest, res, next),
);

router.get("/me/memberships", authenticaionMiddleware(), (req, res, next) =>
  listMyMemberships(req as IAuthorizedRequest, res, next),
);

export default router;
