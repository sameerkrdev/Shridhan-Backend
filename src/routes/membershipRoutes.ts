import express from "express";
import { authenticaionMiddleware } from "@/middlewares/authenticationMiddleware.js";
import { billingAuthorizationMiddleware } from "@/middlewares/billingAuthorizationMiddleware.js";
import { requirePermission } from "@/middlewares/permissionMiddleware.js";
import zodValidatorMiddleware from "@/middlewares/zodValidationMiddleware.js";
import {
  searchUserValidationSchema,
  listMembersValidationSchema,
  addMemberValidationSchema,
  updateRoleValidationSchema,
  updateStatusValidationSchema,
  createCustomRoleValidationSchema,
  updateCustomRoleValidationSchema,
  assignCustomRoleValidationSchema,
  updateMatrixRolePermissionsValidationSchema,
} from "@/zodValidationSchema/membershipValidationSchema.js";
import {
  searchUser,
  addMember,
  listAssignableRoles,
  listMembers,
  getMember,
  changeRole,
  changeStatus,
  deleteMember,
  leaveSociety,
} from "@/controllers/membershipController.js";
import {
  listCustomRoles,
  getRolePermissionMatrix,
  createCustomRole,
  updateCustomRole,
  updateMatrixRolePermissions,
  deleteCustomRole,
  assignCustomRole,
  unassignCustomRole,
} from "@/controllers/customRoleController.js";
import type { IAuthorizedRequest } from "@/types/authType.js";

const router: express.Router = express.Router();

const auth = authenticaionMiddleware();
const billingGate = billingAuthorizationMiddleware();

router.post(
  "/search-user",
  auth,
  billingGate,
  zodValidatorMiddleware(searchUserValidationSchema),
  (req, res, next) => searchUser(req as IAuthorizedRequest, res, next),
);

router.post(
  "/",
  auth,
  billingGate,
  requirePermission("create", "membership"),
  zodValidatorMiddleware(addMemberValidationSchema),
  (req, res, next) => addMember(req as IAuthorizedRequest, res, next),
);

router.get(
  "/",
  auth,
  billingGate,
  requirePermission("list", "membership"),
  zodValidatorMiddleware(listMembersValidationSchema),
  (req, res, next) => listMembers(req as IAuthorizedRequest, res, next),
);

router.get(
  "/role-options",
  auth,
  billingGate,
  requirePermission("create", "membership"),
  (req, res, next) => listAssignableRoles(req as IAuthorizedRequest, res, next),
);

router.get(
  "/custom-roles/matrix",
  auth,
  billingGate,
  requirePermission("read", "role"),
  (req, res, next) => getRolePermissionMatrix(req as IAuthorizedRequest, res, next),
);

router.patch(
  "/custom-roles/matrix/:roleKey/permissions",
  auth,
  billingGate,
  requirePermission("update_permissions", "role"),
  zodValidatorMiddleware(updateMatrixRolePermissionsValidationSchema),
  (req, res, next) => updateMatrixRolePermissions(req as IAuthorizedRequest, res, next),
);

router.get(
  "/custom-roles",
  auth,
  billingGate,
  requirePermission("read", "role"),
  (req, res, next) => listCustomRoles(req as IAuthorizedRequest, res, next),
);

router.post(
  "/custom-roles",
  auth,
  billingGate,
  requirePermission("create", "role"),
  zodValidatorMiddleware(createCustomRoleValidationSchema),
  (req, res, next) => createCustomRole(req as IAuthorizedRequest, res, next),
);

router.patch(
  "/custom-roles/:id",
  auth,
  billingGate,
  requirePermission("update_permissions", "role"),
  zodValidatorMiddleware(updateCustomRoleValidationSchema),
  (req, res, next) => updateCustomRole(req as IAuthorizedRequest, res, next),
);

router.delete(
  "/custom-roles/:id",
  auth,
  billingGate,
  requirePermission("delete", "role"),
  (req, res, next) => deleteCustomRole(req as IAuthorizedRequest, res, next),
);

router.post(
  "/custom-roles/:id/assign",
  auth,
  billingGate,
  requirePermission("update_role", "membership"),
  zodValidatorMiddleware(assignCustomRoleValidationSchema),
  (req, res, next) => assignCustomRole(req as IAuthorizedRequest, res, next),
);

router.post(
  "/custom-roles/:id/unassign",
  auth,
  billingGate,
  requirePermission("update_role", "membership"),
  zodValidatorMiddleware(assignCustomRoleValidationSchema),
  (req, res, next) => unassignCustomRole(req as IAuthorizedRequest, res, next),
);

router.delete(
  "/me",
  auth,
  billingGate,
  requirePermission("update_self_only", "user"),
  (req, res, next) => leaveSociety(req as IAuthorizedRequest, res, next),
);

router.get("/:id", auth, billingGate, requirePermission("read", "membership"), (req, res, next) =>
  getMember(req as IAuthorizedRequest, res, next),
);

router.patch(
  "/:id/role",
  auth,
  billingGate,
  requirePermission("update_role", "membership"),
  zodValidatorMiddleware(updateRoleValidationSchema),
  (req, res, next) => changeRole(req as IAuthorizedRequest, res, next),
);

router.patch(
  "/:id/status",
  auth,
  billingGate,
  requirePermission("update_status", "membership"),
  zodValidatorMiddleware(updateStatusValidationSchema),
  (req, res, next) => changeStatus(req as IAuthorizedRequest, res, next),
);

router.delete(
  "/:id",
  auth,
  billingGate,
  requirePermission("remove", "membership"),
  (req, res, next) => deleteMember(req as IAuthorizedRequest, res, next),
);

export default router;
