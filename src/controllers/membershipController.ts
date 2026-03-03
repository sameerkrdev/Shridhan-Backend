import {
  searchGlobalUser,
  addMemberToSociety,
  listSocietyMembers,
  getMembershipDetail,
  updateMembershipRole,
  updateMembershipStatus,
  removeMembership,
  leaveOwnMembership,
  assertMembership,
  getAssignableRoleOptions,
} from "@/services/membershipService.js";
import type { IAuthorizedRequest } from "@/types/authType.js";
import type { Response, NextFunction } from "express";
import createHttpError from "http-errors";

const getRequiredParam = (value: string | string[] | undefined, field: string) => {
  if (!value || Array.isArray(value)) {
    throw createHttpError(400, `${field} is required`);
  }
  return value;
};

export const searchUser = async (req: IAuthorizedRequest, res: Response, next: NextFunction) => {
  try {
    const { query } = req.body as { query: string };
    const user = await searchGlobalUser(query);
    res.json({ found: Boolean(user), user: user ?? undefined });
  } catch (error) {
    next(error);
  }
};

export const addMember = async (req: IAuthorizedRequest, res: Response, next: NextFunction) => {
  try {
    const actor = assertMembership(req);
    const membership = await addMemberToSociety(
      actor,
      req.body as {
        emailOrPhone?: string;
        userId?: string;
        name?: string;
        email: string;
        phone?: string;
        roleId: string;
      },
    );
    res.status(201).json(membership);
  } catch (error) {
    next(error);
  }
};

export const listAssignableRoles = async (
  req: IAuthorizedRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const actor = assertMembership(req);
    const roleOptions = await getAssignableRoleOptions(actor);
    res.json(roleOptions);
  } catch (error) {
    next(error);
  }
};

export const listMembers = async (req: IAuthorizedRequest, res: Response, next: NextFunction) => {
  try {
    const actor = assertMembership(req);
    const includeDeleted =
      String((req.query.includeDeleted as string | undefined) ?? "false").toLowerCase() === "true";
    const members = await listSocietyMembers(actor.societyId, includeDeleted);
    res.json({ members });
  } catch (error) {
    next(error);
  }
};

export const getMember = async (req: IAuthorizedRequest, res: Response, next: NextFunction) => {
  try {
    const actor = assertMembership(req);
    const id = getRequiredParam(req.params.id, "id");
    const membership = await getMembershipDetail(id, actor.societyId);
    res.json(membership);
  } catch (error) {
    next(error);
  }
};

export const changeRole = async (req: IAuthorizedRequest, res: Response, next: NextFunction) => {
  try {
    const actor = assertMembership(req);
    const id = getRequiredParam(req.params.id, "id");
    const { roleId } = req.body as { roleId: string };
    const updated = await updateMembershipRole(actor, id, roleId);
    res.json(updated);
  } catch (error) {
    next(error);
  }
};

export const changeStatus = async (req: IAuthorizedRequest, res: Response, next: NextFunction) => {
  try {
    const actor = assertMembership(req);
    const id = getRequiredParam(req.params.id, "id");
    const { status } = req.body as { status: "active" | "suspended" };
    const updated = await updateMembershipStatus(actor, id, status);
    res.json(updated);
  } catch (error) {
    next(error);
  }
};

export const deleteMember = async (req: IAuthorizedRequest, res: Response, next: NextFunction) => {
  try {
    const actor = assertMembership(req);
    const id = getRequiredParam(req.params.id, "id");
    await removeMembership(actor, id);
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
};

export const leaveSociety = async (req: IAuthorizedRequest, res: Response, next: NextFunction) => {
  try {
    const actor = assertMembership(req);
    await leaveOwnMembership(actor);
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
};
