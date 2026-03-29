import {
  assertMembership,
  createRdAccount,
  createRdProjectType,
  getRdDetail,
  listRdAccounts,
  listRdProjectTypes,
  listRdReferrerMembers,
  payRd,
  previewRdPayment,
  softDeleteRdAccount,
  softDeleteRdProjectType,
  withdrawRd,
} from "@/services/recurringDepositService.js";
import type { IAuthorizedRequest } from "@/types/authType.js";
import type { NextFunction, Response } from "express";
import createHttpError from "http-errors";

const getRequiredParam = (value: string | string[] | undefined, field: string) => {
  if (!value || Array.isArray(value)) {
    throw createHttpError(400, `${field} is required`);
  }
  return value;
};

export const createProjectType = async (
  req: IAuthorizedRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const actor = assertMembership(req);
    const projectType = await createRdProjectType(actor, req.body as never);
    res.status(201).json(projectType);
  } catch (error) {
    next(error);
  }
};

export const getProjectTypes = async (
  req: IAuthorizedRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const actor = assertMembership(req);
    const includeDeleted =
      String((req.query.includeDeleted as string | undefined) ?? "false").toLowerCase() === "true";
    const includeArchived =
      String((req.query.includeArchived as string | undefined) ?? "false").toLowerCase() === "true";
    const projectTypes = await listRdProjectTypes(
      actor.societyId,
      includeDeleted,
      includeArchived,
    );
    res.json({ projectTypes });
  } catch (error) {
    next(error);
  }
};

export const deleteProjectType = async (
  req: IAuthorizedRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const actor = assertMembership(req);
    const id = getRequiredParam(req.params.id, "id");
    await softDeleteRdProjectType(actor, id);
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
};

export const createAccount = async (req: IAuthorizedRequest, res: Response, next: NextFunction) => {
  try {
    const actor = assertMembership(req);
    const account = await createRdAccount(actor, req.body as never);
    res.status(201).json(account);
  } catch (error) {
    next(error);
  }
};

export const getReferrers = async (req: IAuthorizedRequest, res: Response, next: NextFunction) => {
  try {
    const actor = assertMembership(req);
    const members = await listRdReferrerMembers(actor.societyId);
    res.json({ members });
  } catch (error) {
    next(error);
  }
};

export const getAccounts = async (req: IAuthorizedRequest, res: Response, next: NextFunction) => {
  try {
    const actor = assertMembership(req);
    const includeDeleted =
      String((req.query.includeDeleted as string | undefined) ?? "false").toLowerCase() === "true";

    const page = Number((req.query.page as string | undefined) ?? "1");
    const pageSize = Number((req.query.pageSize as string | undefined) ?? "10");
    const sortBy = typeof req.query.sortBy === "string" ? req.query.sortBy : undefined;
    const sortOrder = typeof req.query.sortOrder === "string" ? req.query.sortOrder : undefined;
    const search = typeof req.query.search === "string" ? req.query.search : undefined;

    const sorting: {
      sortBy?:
        | "id"
        | "customer_name"
        | "phone"
        | "monthly_amount"
        | "maturity_date"
        | "status";
      sortOrder?: "asc" | "desc";
    } = {};
    if (sortBy) {
      sorting.sortBy = sortBy as
        | "id"
        | "customer_name"
        | "phone"
        | "monthly_amount"
        | "maturity_date"
        | "status";
    }
    if (sortOrder) {
      sorting.sortOrder = sortOrder as "asc" | "desc";
    }

    const payload = await listRdAccounts(
      actor.societyId,
      { page, pageSize },
      sorting,
      includeDeleted,
      search,
    );
    res.json(payload);
  } catch (error) {
    next(error);
  }
};

export const getAccountDetail = async (
  req: IAuthorizedRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const actor = assertMembership(req);
    const id = getRequiredParam(req.params.id, "id");
    const account = await getRdDetail(id, actor.societyId);
    res.json(account);
  } catch (error) {
    next(error);
  }
};

export const previewPayment = async (
  req: IAuthorizedRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const actor = assertMembership(req);
    const id = getRequiredParam(req.params.id, "id");
    const body = req.body as { amount?: number; months?: number[] };
    const preview = await previewRdPayment(actor.societyId, id, body);
    res.json(preview);
  } catch (error) {
    next(error);
  }
};

export const pay = async (req: IAuthorizedRequest, res: Response, next: NextFunction) => {
  try {
    const actor = assertMembership(req);
    const id = getRequiredParam(req.params.id, "id");
    const result = await payRd(actor, id, req.body as never);
    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
};

export const withdraw = async (req: IAuthorizedRequest, res: Response, next: NextFunction) => {
  try {
    const actor = assertMembership(req);
    const id = getRequiredParam(req.params.id, "id");
    const result = await withdrawRd(actor, id, req.body as never);
    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
};

export const deleteAccount = async (req: IAuthorizedRequest, res: Response, next: NextFunction) => {
  try {
    const actor = assertMembership(req);
    const id = getRequiredParam(req.params.id, "id");
    await softDeleteRdAccount(actor, id);
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
};
