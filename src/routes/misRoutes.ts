import express from "express";
import { authenticaionMiddleware } from "@/middlewares/authenticationMiddleware.js";
import { billingAuthorizationMiddleware } from "@/middlewares/billingAuthorizationMiddleware.js";
import { requirePermission } from "@/middlewares/permissionMiddleware.js";
import zodValidatorMiddleware from "@/middlewares/zodValidationMiddleware.js";
import {
  addMisDepositSchema,
  completeMisDocumentUploadSchema,
  createMisAccountSchema,
  createMisProjectTypeSchema,
  getMisDetailSchema,
  listMisAccountsSchema,
  listMisProjectTypesSchema,
  payMisInterestSchema,
  requestMisDocumentUploadUrlSchema,
  returnMisPrincipalSchema,
  updateMisAccountSchema,
} from "@/zodValidationSchema/misValidationSchema.js";
import {
  addDeposit,
  createMisDocumentUploadUrl as createMisDocumentUploadUrlController,
  createAccount,
  createProjectType,
  deleteAccount,
  deleteProjectType,
  getAccountDetail,
  getAccounts,
  getProjectTypes,
  getReferrers,
  markMisDocumentUploaded as markMisDocumentUploadedController,
  payInterest,
  returnPrincipal,
  updateAccount,
} from "@/controllers/misController.js";
import type { IAuthorizedRequest } from "@/types/authType.js";

const router: express.Router = express.Router();

const auth = authenticaionMiddleware();
const billingGate = billingAuthorizationMiddleware();

router.post(
  "/project-types",
  auth,
  billingGate,
  requirePermission("create", "mis"),
  zodValidatorMiddleware(createMisProjectTypeSchema),
  (req, res, next) => createProjectType(req as IAuthorizedRequest, res, next),
);

router.get(
  "/project-types",
  auth,
  billingGate,
  requirePermission("list", "mis"),
  zodValidatorMiddleware(listMisProjectTypesSchema),
  (req, res, next) => getProjectTypes(req as IAuthorizedRequest, res, next),
);

router.patch(
  "/:id",
  auth,
  billingGate,
  requirePermission("create", "mis"),
  zodValidatorMiddleware(updateMisAccountSchema),
  (req, res, next) => updateAccount(req as IAuthorizedRequest, res, next),
);

router.delete(
  "/project-types/:id",
  auth,
  billingGate,
  requirePermission("remove_project_type", "mis"),
  zodValidatorMiddleware(getMisDetailSchema),
  (req, res, next) => deleteProjectType(req as IAuthorizedRequest, res, next),
);

router.post(
  "/",
  auth,
  billingGate,
  requirePermission("create", "mis"),
  zodValidatorMiddleware(createMisAccountSchema),
  (req, res, next) => createAccount(req as IAuthorizedRequest, res, next),
);

router.get("/referrers", auth, billingGate, requirePermission("create", "mis"), (req, res, next) =>
  getReferrers(req as IAuthorizedRequest, res, next),
);

router.get(
  "/",
  auth,
  billingGate,
  requirePermission("list", "mis"),
  zodValidatorMiddleware(listMisAccountsSchema),
  (req, res, next) => getAccounts(req as IAuthorizedRequest, res, next),
);

router.get(
  "/:id",
  auth,
  billingGate,
  requirePermission("read", "mis"),
  zodValidatorMiddleware(getMisDetailSchema),
  (req, res, next) => getAccountDetail(req as IAuthorizedRequest, res, next),
);

router.delete(
  "/:id",
  auth,
  billingGate,
  requirePermission("remove", "mis"),
  zodValidatorMiddleware(getMisDetailSchema),
  (req, res, next) => deleteAccount(req as IAuthorizedRequest, res, next),
);

router.post(
  "/:id/deposit",
  auth,
  billingGate,
  requirePermission("deposit", "mis"),
  zodValidatorMiddleware(addMisDepositSchema),
  (req, res, next) => addDeposit(req as IAuthorizedRequest, res, next),
);

router.post(
  "/:id/pay-interest",
  auth,
  billingGate,
  requirePermission("pay_interest", "mis"),
  zodValidatorMiddleware(payMisInterestSchema),
  (req, res, next) => payInterest(req as IAuthorizedRequest, res, next),
);

router.post(
  "/:id/return-principal",
  auth,
  billingGate,
  requirePermission("return_principal", "mis"),
  zodValidatorMiddleware(returnMisPrincipalSchema),
  (req, res, next) => returnPrincipal(req as IAuthorizedRequest, res, next),
);

router.post(
  "/:id/documents/upload-url",
  auth,
  billingGate,
  requirePermission("deposit", "mis"),
  zodValidatorMiddleware(requestMisDocumentUploadUrlSchema),
  createMisDocumentUploadUrlController as unknown as express.RequestHandler,
);

router.post(
  "/:id/documents/:documentId/complete",
  auth,
  billingGate,
  requirePermission("deposit", "mis"),
  zodValidatorMiddleware(completeMisDocumentUploadSchema),
  markMisDocumentUploadedController as unknown as express.RequestHandler,
);

export default router;
