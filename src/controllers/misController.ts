import {
  addMisDeposit,
  assertMembership,
  completeMisDocumentUpload,
  createMisAccount,
  createMisProjectType,
  getMisDetail,
  listMisAccounts,
  listMisReferrerMembers,
  listMisProjectTypes,
  payMisInterest,
  requestMisDocumentUpload,
  returnMisPrincipal,
  softDeleteMisAccount,
  softDeleteMisProjectType,
  updateMisAccount,
} from "@/services/misService.js";
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
    const projectType = await createMisProjectType(actor, req.body as never);
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
    const projectTypes = await listMisProjectTypes(
      actor.societyId,
      includeDeleted,
      includeArchived,
    );
    res.json({ projectTypes });
  } catch (error) {
    next(error);
  }
};

export const createAccount = async (req: IAuthorizedRequest, res: Response, next: NextFunction) => {
  try {
    const actor = assertMembership(req);
    const account = await createMisAccount(actor, req.body as never);
    res.status(201).json(account);
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
        | "deposit_amount"
        | "monthly_interest"
        | "maturity_date"
        | "status";
      sortOrder?: "asc" | "desc";
    } = {};
    if (sortBy) {
      sorting.sortBy = sortBy as
        | "id"
        | "customer_name"
        | "phone"
        | "deposit_amount"
        | "monthly_interest"
        | "maturity_date"
        | "status";
    }
    if (sortOrder) {
      sorting.sortOrder = sortOrder as "asc" | "desc";
    }

    const payload = await listMisAccounts(
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

export const getReferrers = async (req: IAuthorizedRequest, res: Response, next: NextFunction) => {
  try {
    const actor = assertMembership(req);
    const members = await listMisReferrerMembers(actor.societyId);
    res.json({ members });
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
    const account = await getMisDetail(id, actor.societyId);
    res.json(account);
  } catch (error) {
    next(error);
  }
};

export const updateAccount = async (
  req: IAuthorizedRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const actor = assertMembership(req);
    const id = getRequiredParam(req.params.id, "id");
    const account = await updateMisAccount(actor, id, req.body as never);
    res.json(account);
  } catch (error) {
    next(error);
  }
};

export const addDeposit = async (req: IAuthorizedRequest, res: Response, next: NextFunction) => {
  try {
    const actor = assertMembership(req);
    const id = getRequiredParam(req.params.id, "id");
    const transaction = await addMisDeposit(actor, id, req.body as never);
    res.status(201).json(transaction);
  } catch (error) {
    next(error);
  }
};

export const payInterest = async (req: IAuthorizedRequest, res: Response, next: NextFunction) => {
  try {
    const actor = assertMembership(req);
    const id = getRequiredParam(req.params.id, "id");
    const payload = await payMisInterest(actor, id, req.body as never);
    res.status(201).json(payload);
  } catch (error) {
    next(error);
  }
};

export const returnPrincipal = async (
  req: IAuthorizedRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const actor = assertMembership(req);
    const id = getRequiredParam(req.params.id, "id");
    const payload = await returnMisPrincipal(actor, id, req.body as never);
    res.status(201).json(payload);
  } catch (error) {
    next(error);
  }
};

export const createMisDocumentUploadUrl = async (
  req: IAuthorizedRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const actor = assertMembership(req);
    const id = getRequiredParam(req.params.id, "id");
    const response = await requestMisDocumentUpload(actor, id, req.body as never);
    res.status(201).json(response);
  } catch (error) {
    next(error);
  }
};

export const markMisDocumentUploaded = async (
  req: IAuthorizedRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const actor = assertMembership(req);
    const id = getRequiredParam(req.params.id, "id");
    const documentId = getRequiredParam(req.params.documentId, "documentId");
    res.json(await completeMisDocumentUpload(actor, id, documentId));
  } catch (error) {
    next(error);
  }
};

export const deleteAccount = async (req: IAuthorizedRequest, res: Response, next: NextFunction) => {
  try {
    const actor = assertMembership(req);
    const id = getRequiredParam(req.params.id, "id");
    await softDeleteMisAccount(actor, id);
    res.json({ success: true });
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
    await softDeleteMisProjectType(actor, id);
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
};
