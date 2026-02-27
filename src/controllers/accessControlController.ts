import type { NextFunction, Response } from "express";
import createHttpError from "http-errors";
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
import {
  assignRoleToMember,
  createPermission,
  createRole,
  deletePermission,
  deleteRole,
  listPermissions,
  listRoles,
  listSocietyMembersWithRoles,
  removeRoleFromMember,
  setRolePermissions,
  updatePermission,
  updateRole,
} from "@/services/accessControlService.js";

const getRequiredParam = (value: string | string[] | undefined, field: string) => {
  if (!value || Array.isArray(value)) {
    throw createHttpError(400, `${field} is required`);
  }

  return value;
};

export const getPermissions = async (
  req: IAccessControlRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const permissions = await listPermissions(req.member);
    res.json({ permissions });
  } catch (error) {
    next(error);
  }
};

export const postPermission = async (
  req: ICreatePermissionRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const permission = await createPermission(req.member, {
      name: req.body.name,
      ...(req.body.description && { description: req.body.description }),
    });
    res.status(201).json({ permission });
  } catch (error) {
    next(error);
  }
};

export const patchPermission = async (
  req: IUpdatePermissionRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const permission = await updatePermission(
      req.member,
      getRequiredParam(req.params.permissionId, "permissionId"),
      req.body,
    );
    res.json({ permission });
  } catch (error) {
    next(error);
  }
};

export const removePermission = async (
  req: IAccessControlRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    await deletePermission(req.member, getRequiredParam(req.params.permissionId, "permissionId"));
    res.status(204).send();
  } catch (error) {
    next(error);
  }
};

export const getRoles = async (req: IAccessControlRequest, res: Response, next: NextFunction) => {
  try {
    const roles = await listRoles(req.member);
    res.json({ roles });
  } catch (error) {
    next(error);
  }
};

export const postRole = async (req: ICreateRoleRequest, res: Response, next: NextFunction) => {
  try {
    const role = await createRole(req.member, {
      name: req.body.name,
      permissionIds: req.body.permissionIds,
      ...(req.body.description && { description: req.body.description }),
    });
    res.status(201).json({ role });
  } catch (error) {
    next(error);
  }
};

export const patchRole = async (req: IUpdateRoleRequest, res: Response, next: NextFunction) => {
  try {
    const role = await updateRole(
      req.member,
      getRequiredParam(req.params.roleId, "roleId"),
      req.body,
    );
    res.json({ role });
  } catch (error) {
    next(error);
  }
};

export const removeRole = async (req: IAccessControlRequest, res: Response, next: NextFunction) => {
  try {
    await deleteRole(req.member, getRequiredParam(req.params.roleId, "roleId"));
    res.status(204).send();
  } catch (error) {
    next(error);
  }
};

export const putRolePermissions = async (
  req: IMapRolePermissionsRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    await setRolePermissions(
      req.member,
      getRequiredParam(req.params.roleId, "roleId"),
      req.body.permissionIds,
    );
    res.status(204).send();
  } catch (error) {
    next(error);
  }
};

export const getMembersWithRoles = async (
  req: IAccessControlRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const members = await listSocietyMembersWithRoles(req.member);
    res.json({ members });
  } catch (error) {
    next(error);
  }
};

export const postMemberRole = async (
  req: IAssignMemberRoleRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const assignment = await assignRoleToMember(req.member, req.body);
    res.status(201).json({ assignment });
  } catch (error) {
    next(error);
  }
};

export const deleteMemberRole = async (
  req: IRemoveMemberRoleRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    await removeRoleFromMember(req.member, req.body);
    res.status(204).send();
  } catch (error) {
    next(error);
  }
};
