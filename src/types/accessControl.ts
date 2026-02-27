import type {
  AssignMemberRoleValidationSchema,
  CreatePermissionValidationSchema,
  CreateRoleValidationSchema,
  RemoveMemberRoleValidationSchema,
  RolePermissionMapValidationSchema,
  UpdatePermissionValidationSchema,
  UpdateRoleValidationSchema,
} from "@/zodValidationSchema/accessControlValidationSchema.js";
import type { IAuthorizedRequest } from "@/types/authType.js";

export type IAccessControlRequest = IAuthorizedRequest;

export interface ICreatePermissionRequest extends IAuthorizedRequest {
  body: CreatePermissionValidationSchema["body"];
}

export interface IUpdatePermissionRequest extends IAuthorizedRequest {
  body: UpdatePermissionValidationSchema["body"];
}

export interface ICreateRoleRequest extends IAuthorizedRequest {
  body: CreateRoleValidationSchema["body"];
}

export interface IUpdateRoleRequest extends IAuthorizedRequest {
  body: UpdateRoleValidationSchema["body"];
}

export interface IMapRolePermissionsRequest extends IAuthorizedRequest {
  body: RolePermissionMapValidationSchema["body"];
}

export interface IAssignMemberRoleRequest extends IAuthorizedRequest {
  body: AssignMemberRoleValidationSchema["body"];
}

export interface IRemoveMemberRoleRequest extends IAuthorizedRequest {
  body: RemoveMemberRoleValidationSchema["body"];
}
