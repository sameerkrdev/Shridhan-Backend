import express from "express";
import zodValidatorMiddleware from "@/middlewares/zodValidationMiddleware.js";
import { authenticaionMiddleware } from "@/middlewares/authenticationMiddleware.js";
import { permitAuthorizationMiddleware } from "@/middlewares/authorizationMiddleware.js";
import {
  assignMemberRoleValidationSchema,
  createPermissionValidationSchema,
  createRoleValidationSchema,
  removeMemberRoleValidationSchema,
  rolePermissionMapValidationSchema,
  updatePermissionValidationSchema,
  updateRoleValidationSchema,
} from "@/zodValidationSchema/accessControlValidationSchema.js";
import {
  deleteMemberRole,
  getMembersWithRoles,
  getPermissions,
  getRoles,
  patchPermission,
  patchRole,
  postMemberRole,
  postPermission,
  postRole,
  putRolePermissions,
  removePermission,
  removeRole,
} from "@/controllers/accessControlController.js";
import type {
  IAccessControlRequest,
  IAssignMemberRoleRequest,
  ICreatePermissionRequest,
  ICreateRoleRequest,
  IMapRolePermissionsRequest,
  IRemoveMemberRoleRequest,
  IUpdatePermissionRequest,
  IUpdateRoleRequest,
} from "@/types/accessControl.js";

const router: express.Router = express.Router();
const guard = [
  authenticaionMiddleware(),
  permitAuthorizationMiddleware(["manage_roles", "manage_permissions"]),
];

router.get("/permissions", ...guard, (req, res, next) =>
  getPermissions(req as IAccessControlRequest, res, next),
);
router.post(
  "/permissions",
  ...guard,
  zodValidatorMiddleware(createPermissionValidationSchema),
  (req, res, next) => postPermission(req as ICreatePermissionRequest, res, next),
);
router.patch(
  "/permissions/:permissionId",
  ...guard,
  zodValidatorMiddleware(updatePermissionValidationSchema),
  (req, res, next) => patchPermission(req as IUpdatePermissionRequest, res, next),
);
router.delete("/permissions/:permissionId", ...guard, (req, res, next) =>
  removePermission(req as IAccessControlRequest, res, next),
);

router.get("/roles", ...guard, (req, res, next) =>
  getRoles(req as IAccessControlRequest, res, next),
);
router.post(
  "/roles",
  ...guard,
  zodValidatorMiddleware(createRoleValidationSchema),
  (req, res, next) => postRole(req as ICreateRoleRequest, res, next),
);
router.patch(
  "/roles/:roleId",
  ...guard,
  zodValidatorMiddleware(updateRoleValidationSchema),
  (req, res, next) => patchRole(req as IUpdateRoleRequest, res, next),
);
router.delete("/roles/:roleId", ...guard, (req, res, next) =>
  removeRole(req as IAccessControlRequest, res, next),
);
router.put(
  "/roles/:roleId/permissions",
  ...guard,
  zodValidatorMiddleware(rolePermissionMapValidationSchema),
  (req, res, next) => putRolePermissions(req as IMapRolePermissionsRequest, res, next),
);

router.get("/member-roles", ...guard, (req, res, next) =>
  getMembersWithRoles(req as IAccessControlRequest, res, next),
);
router.post(
  "/member-roles",
  ...guard,
  zodValidatorMiddleware(assignMemberRoleValidationSchema),
  (req, res, next) => postMemberRole(req as IAssignMemberRoleRequest, res, next),
);
router.delete(
  "/member-roles",
  ...guard,
  zodValidatorMiddleware(removeMemberRoleValidationSchema),
  (req, res, next) => deleteMemberRole(req as IRemoveMemberRoleRequest, res, next),
);

export default router;
