import express from "express";
import { authenticaionMiddleware } from "@/middlewares/authenticationMiddleware.js";
import { billingAuthorizationMiddleware } from "@/middlewares/billingAuthorizationMiddleware.js";
import { requirePermission } from "@/middlewares/permissionMiddleware.js";
import zodValidatorMiddleware from "@/middlewares/zodValidationMiddleware.js";
import {
  addTransactionSchema,
  completeFdDocumentUploadSchema,
  createFdAccountSchema,
  createProjectTypeSchema,
  deleteProjectTypeSchema,
  deleteFdAccountSchema,
  getFdDetailSchema,
  listFdAccountsSchema,
  listProjectTypesSchema,
  requestFdDocumentUploadUrlSchema,
  updateFdStatusSchema,
  updateProjectTypeStatusSchema,
} from "@/zodValidationSchema/fixedDepositValidationSchema.js";
import {
  changeFixedDepositProjectTypeStatus,
  changeFixedDepositStatus,
  createFdDocumentUploadUrl,
  createFdProjectType,
  createFixedDepositAccount,
  createFixedDepositTransaction,
  deleteFixedDepositProjectType,
  deleteFixedDepositAccount,
  getFdReferrers,
  getFdProjectTypes,
  getFixedDepositDetail,
  getFixedDeposits,
  markFdDocumentUploaded,
} from "@/controllers/fixedDepositController.js";
import type { IAuthorizedRequest } from "@/types/authType.js";

const router: express.Router = express.Router();

const auth = authenticaionMiddleware();
const billingGate = billingAuthorizationMiddleware();

router.post(
  "/project-types",
  auth,
  billingGate,
  requirePermission("create", "fixed_deposit"),
  zodValidatorMiddleware(createProjectTypeSchema),
  (req, res, next) => createFdProjectType(req as IAuthorizedRequest, res, next),
);

router.get(
  "/project-types",
  auth,
  billingGate,
  requirePermission("list", "fixed_deposit"),
  zodValidatorMiddleware(listProjectTypesSchema),
  (req, res, next) => getFdProjectTypes(req as IAuthorizedRequest, res, next),
);

router.patch(
  "/project-types/:id/status",
  auth,
  billingGate,
  requirePermission("update_status", "fixed_deposit"),
  zodValidatorMiddleware(updateProjectTypeStatusSchema),
  (req, res, next) => changeFixedDepositProjectTypeStatus(req as IAuthorizedRequest, res, next),
);

router.delete(
  "/project-types/:id",
  auth,
  billingGate,
  requirePermission("remove_project_type", "fixed_deposit"),
  zodValidatorMiddleware(deleteProjectTypeSchema),
  (req, res, next) => deleteFixedDepositProjectType(req as IAuthorizedRequest, res, next),
);

router.post(
  "/",
  auth,
  billingGate,
  requirePermission("create", "fixed_deposit"),
  zodValidatorMiddleware(createFdAccountSchema),
  (req, res, next) => createFixedDepositAccount(req as IAuthorizedRequest, res, next),
);

router.get(
  "/referrers",
  auth,
  billingGate,
  requirePermission("create", "fixed_deposit"),
  (req, res, next) => getFdReferrers(req as IAuthorizedRequest, res, next),
);

router.get(
  "/",
  auth,
  billingGate,
  requirePermission("list", "fixed_deposit"),
  zodValidatorMiddleware(listFdAccountsSchema),
  (req, res, next) => getFixedDeposits(req as IAuthorizedRequest, res, next),
);

router.get(
  "/:id",
  auth,
  billingGate,
  requirePermission("read", "fixed_deposit"),
  zodValidatorMiddleware(getFdDetailSchema),
  (req, res, next) => getFixedDepositDetail(req as IAuthorizedRequest, res, next),
);

router.post(
  "/:id/transactions",
  auth,
  billingGate,
  requirePermission("add_transaction", "fixed_deposit"),
  zodValidatorMiddleware(addTransactionSchema),
  (req, res, next) => createFixedDepositTransaction(req as IAuthorizedRequest, res, next),
);

router.patch(
  "/:id/status",
  auth,
  billingGate,
  requirePermission("update_status", "fixed_deposit"),
  zodValidatorMiddleware(updateFdStatusSchema),
  (req, res, next) => changeFixedDepositStatus(req as IAuthorizedRequest, res, next),
);

router.delete(
  "/:id",
  auth,
  billingGate,
  requirePermission("remove", "fixed_deposit"),
  zodValidatorMiddleware(deleteFdAccountSchema),
  (req, res, next) => deleteFixedDepositAccount(req as IAuthorizedRequest, res, next),
);

router.post(
  "/:id/documents/upload-url",
  auth,
  billingGate,
  requirePermission("add_transaction", "fixed_deposit"),
  zodValidatorMiddleware(requestFdDocumentUploadUrlSchema),
  (req, res, next) => createFdDocumentUploadUrl(req as IAuthorizedRequest, res, next),
);

router.post(
  "/:id/documents/:documentId/complete",
  auth,
  billingGate,
  requirePermission("add_transaction", "fixed_deposit"),
  zodValidatorMiddleware(completeFdDocumentUploadSchema),
  (req, res, next) => markFdDocumentUploaded(req as IAuthorizedRequest, res, next),
);

export default router;
