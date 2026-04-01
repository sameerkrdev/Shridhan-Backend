import express from "express";
import { authenticaionMiddleware } from "@/middlewares/authenticationMiddleware.js";
import { billingAuthorizationMiddleware } from "@/middlewares/billingAuthorizationMiddleware.js";
import { requirePermission } from "@/middlewares/permissionMiddleware.js";
import zodValidatorMiddleware from "@/middlewares/zodValidationMiddleware.js";
import {
  createRdAccountSchema,
  createRdProjectTypeSchema,
  deleteRdAccountSchema,
  deleteRdProjectTypeSchema,
  getRdDetailSchema,
  listRdAccountsSchema,
  listRdProjectTypesSchema,
  payRdSchema,
  previewRdPaymentSchema,
  withdrawRdSchema,
} from "@/zodValidationSchema/recurringDepositValidationSchema.js";
import {
  createAccount,
  createProjectType,
  deleteAccount,
  deleteProjectType,
  getAccountDetail,
  getAccounts,
  getProjectTypes,
  getReferrers,
  pay,
  previewPayment,
  withdraw,
} from "@/controllers/recurringDepositController.js";
import type { IAuthorizedRequest } from "@/types/authType.js";

const router: express.Router = express.Router();

const auth = authenticaionMiddleware();
const billingGate = billingAuthorizationMiddleware();

router.post(
  "/project-types",
  auth,
  billingGate,
  requirePermission("create", "recurring_deposit"),
  zodValidatorMiddleware(createRdProjectTypeSchema),
  (req, res, next) => createProjectType(req as IAuthorizedRequest, res, next),
);

router.get(
  "/project-types",
  auth,
  billingGate,
  requirePermission("list", "recurring_deposit"),
  zodValidatorMiddleware(listRdProjectTypesSchema),
  (req, res, next) => getProjectTypes(req as IAuthorizedRequest, res, next),
);

router.delete(
  "/project-types/:id",
  auth,
  billingGate,
  requirePermission("remove_project_type", "recurring_deposit"),
  zodValidatorMiddleware(deleteRdProjectTypeSchema),
  (req, res, next) => deleteProjectType(req as IAuthorizedRequest, res, next),
);

router.post(
  "/",
  auth,
  billingGate,
  requirePermission("create", "recurring_deposit"),
  zodValidatorMiddleware(createRdAccountSchema),
  (req, res, next) => createAccount(req as IAuthorizedRequest, res, next),
);

router.get("/referrers", auth, billingGate, requirePermission("create", "recurring_deposit"), (req, res, next) =>
  getReferrers(req as IAuthorizedRequest, res, next),
);

router.get(
  "/",
  auth,
  billingGate,
  requirePermission("list", "recurring_deposit"),
  zodValidatorMiddleware(listRdAccountsSchema),
  (req, res, next) => getAccounts(req as IAuthorizedRequest, res, next),
);

router.get(
  "/:id",
  auth,
  billingGate,
  requirePermission("read", "recurring_deposit"),
  zodValidatorMiddleware(getRdDetailSchema),
  (req, res, next) => getAccountDetail(req as IAuthorizedRequest, res, next),
);

router.post(
  "/:id/preview-pay",
  auth,
  billingGate,
  requirePermission("pay", "recurring_deposit"),
  zodValidatorMiddleware(previewRdPaymentSchema),
  (req, res, next) => previewPayment(req as IAuthorizedRequest, res, next),
);

router.post(
  "/:id/pay",
  auth,
  billingGate,
  requirePermission("pay", "recurring_deposit"),
  zodValidatorMiddleware(payRdSchema),
  (req, res, next) => pay(req as IAuthorizedRequest, res, next),
);

router.post(
  "/:id/withdraw",
  auth,
  billingGate,
  requirePermission("withdraw", "recurring_deposit"),
  zodValidatorMiddleware(withdrawRdSchema),
  (req, res, next) => withdraw(req as IAuthorizedRequest, res, next),
);

router.delete(
  "/:id",
  auth,
  billingGate,
  requirePermission("remove", "recurring_deposit"),
  zodValidatorMiddleware(deleteRdAccountSchema),
  (req, res, next) => deleteAccount(req as IAuthorizedRequest, res, next),
);

export default router;
