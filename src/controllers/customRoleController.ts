import type { IAuthorizedRequest } from "@/types/authType.js";
import type { NextFunction, Response } from "express";
import createHttpError from "http-errors";
import { assertMembership } from "@/services/membershipService.js";
import {
  listSocietyCustomRoles,
  getSocietyRolePermissionMatrix,
  createSocietyCustomRole,
  updateRolePermissions,
  updateSocietyCustomRole,
  deleteSocietyCustomRole,
  assignSocietyCustomRole,
  unassignSocietyCustomRole,
} from "@/services/customRoleService.js";

const getRequiredParam = (value: string | string[] | undefined, field: string) => {
  if (!value || Array.isArray(value)) {
    throw createHttpError(400, `${field} is required`);
  }
  return value;
};

export const listCustomRoles = async (
  req: IAuthorizedRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const actor = assertMembership(req);
    const roles = await listSocietyCustomRoles(actor.societyId);
    res.json({ roles });
  } catch (error) {
    next(error);
  }
};

export const getRolePermissionMatrix = async (
  req: IAuthorizedRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const actor = assertMembership(req);
    const matrix = await getSocietyRolePermissionMatrix(actor.societyId);
    res.json(matrix);
  } catch (error) {
    next(error);
  }
};

export const createCustomRole = async (
  req: IAuthorizedRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const actor = assertMembership(req);
    const role = await createSocietyCustomRole(
      actor,
      req.body as { name: string; description?: string; permissions: string[] },
    );
    res.status(201).json(role);
  } catch (error) {
    next(error);
  }
};

export const updateCustomRole = async (
  req: IAuthorizedRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const actor = assertMembership(req);
    const id = getRequiredParam(req.params.id, "id");
    const role = await updateSocietyCustomRole(
      actor,
      id,
      req.body as { name: string; description?: string; permissions: string[] },
    );
    res.json(role);
  } catch (error) {
    next(error);
  }
};

export const updateMatrixRolePermissions = async (
  req: IAuthorizedRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const actor = assertMembership(req);
    const roleKey = getRequiredParam(req.params.roleKey, "roleKey");
    const { permissions } = req.body as { permissions: string[] };
    const updated = await updateRolePermissions(actor, roleKey, permissions);
    res.json(updated);
  } catch (error) {
    next(error);
  }
};

export const deleteCustomRole = async (
  req: IAuthorizedRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const actor = assertMembership(req);
    const id = getRequiredParam(req.params.id, "id");
    await deleteSocietyCustomRole(actor, id);
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
};

export const assignCustomRole = async (
  req: IAuthorizedRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const actor = assertMembership(req);
    const id = getRequiredParam(req.params.id, "id");
    const { membershipId } = req.body as { membershipId: string };
    const assignment = await assignSocietyCustomRole(actor, id, membershipId);
    res.status(201).json(assignment);
  } catch (error) {
    next(error);
  }
};

export const unassignCustomRole = async (
  req: IAuthorizedRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const actor = assertMembership(req);
    const id = getRequiredParam(req.params.id, "id");
    const { membershipId } = req.body as { membershipId: string };
    await unassignSocietyCustomRole(actor, id, membershipId);
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
};
