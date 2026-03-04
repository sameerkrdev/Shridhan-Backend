import {
  addTransaction,
  assertMembership,
  completeFdDocumentUpload,
  createFdAccount,
  createProjectType,
  getFdDetail,
  listFdReferrerMembers,
  listFdAccounts,
  listProjectTypes,
  requestFdDocumentUpload,
  softDeleteProjectType,
  softDeleteFdAccount,
  updateFdAccountStatus,
  updateProjectTypeStatus,
} from "@/services/fixedDepositService.js";
import type { Prisma, ServiceStatus } from "@/generated/prisma/client.js";
import type { IAuthorizedRequest } from "@/types/authType.js";
import type { NextFunction, Response } from "express";
import createHttpError from "http-errors";

const getRequiredParam = (value: string | string[] | undefined, field: string) => {
  if (!value || Array.isArray(value)) {
    throw createHttpError(400, `${field} is required`);
  }
  return value;
};

export const createFdProjectType = async (
  req: IAuthorizedRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const actor = assertMembership(req);
    const projectType = await createProjectType(actor, req.body as never);
    res.status(201).json(projectType);
  } catch (error) {
    next(error);
  }
};

export const getFdProjectTypes = async (
  req: IAuthorizedRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const actor = assertMembership(req);
    const includeDeleted =
      String((req.query.includeDeleted as string | undefined) ?? "false").toLowerCase() === "true";
    const projectTypes = await listProjectTypes(actor.societyId, includeDeleted);
    res.json({ projectTypes });
  } catch (error) {
    next(error);
  }
};

export const createFixedDepositAccount = async (
  req: IAuthorizedRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const actor = assertMembership(req);
    const fd = await createFdAccount(actor, req.body as never);
    res.status(201).json(fd);
  } catch (error) {
    next(error);
  }
};

export const getFixedDeposits = async (
  req: IAuthorizedRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const actor = assertMembership(req);
    const sortBy = typeof req.query.sortBy === "string" ? req.query.sortBy : undefined;
    const sortOrder = typeof req.query.sortOrder === "string" ? req.query.sortOrder : undefined;
    const search = typeof req.query.search === "string" ? req.query.search : undefined;
    const includeDeleted =
      String((req.query.includeDeleted as string | undefined) ?? "false").toLowerCase() === "true";
    const sorting: {
      sortBy?:
        | "id"
        | "customer_name"
        | "phone"
        | "plan"
        | "principal_amount"
        | "maturity_amount"
        | "start_date"
        | "maturity_date"
        | "status";
      sortOrder?: "asc" | "desc";
    } = {};
    if (sortBy) {
      sorting.sortBy = sortBy as
        | "id"
        | "customer_name"
        | "phone"
        | "plan"
        | "principal_amount"
        | "maturity_amount"
        | "start_date"
        | "maturity_date"
        | "status";
    }
    if (sortOrder) {
      sorting.sortOrder = sortOrder as "asc" | "desc";
    }
    const fixedDeposits = await listFdAccounts(actor.societyId, sorting, includeDeleted, search);
    res.json({ fixedDeposits });
  } catch (error) {
    next(error);
  }
};

export const getFixedDepositDetail = async (
  req: IAuthorizedRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const actor = assertMembership(req);
    const id = getRequiredParam(req.params.id, "id");
    const fixedDeposit = await getFdDetail(id, actor.societyId);
    res.json(fixedDeposit);
  } catch (error) {
    next(error);
  }
};

export const createFixedDepositTransaction = async (
  req: IAuthorizedRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const actor = assertMembership(req);
    const id = getRequiredParam(req.params.id, "id");
    const transaction = await addTransaction(actor, id, req.body as never);
    res.status(201).json(transaction);
  } catch (error) {
    next(error);
  }
};

export const getFdReferrers = async (
  req: IAuthorizedRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const actor = assertMembership(req);
    const members = await listFdReferrerMembers(actor.societyId);
    res.json({ members });
  } catch (error) {
    next(error);
  }
};

export const createFdDocumentUploadUrl = async (
  req: IAuthorizedRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const actor = assertMembership(req);
    const id = getRequiredParam(req.params.id, "id");
    const response = await requestFdDocumentUpload(actor, id, req.body as never);
    res.status(201).json(response);
  } catch (error) {
    next(error);
  }
};

export const markFdDocumentUploaded = async (
  req: IAuthorizedRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const actor = assertMembership(req);
    const id = getRequiredParam(req.params.id, "id");
    const documentId = getRequiredParam(req.params.documentId, "documentId");
    res.json(await completeFdDocumentUpload(actor, id, documentId));
  } catch (error) {
    next(error);
  }
};

export const changeFixedDepositStatus = async (
  req: IAuthorizedRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const actor = assertMembership(req);
    const id = getRequiredParam(req.params.id, "id");
    const { status } = req.body as { status: ServiceStatus };

    const updateStatusFn: (
      actor: Prisma.MembershipModel,
      fixDepositId: string,
      status: ServiceStatus,
    ) => Promise<unknown> = updateFdAccountStatus;
    res.json(await updateStatusFn(actor, id, status));
  } catch (error) {
    next(error);
  }
};

export const changeFixedDepositProjectTypeStatus = async (
  req: IAuthorizedRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const actor = assertMembership(req);
    const id = getRequiredParam(req.params.id, "id");
    const { status } = req.body as { status: "ACTIVE" | "SUSPENDED" };

    res.json(await updateProjectTypeStatus(actor, id, status));
  } catch (error) {
    next(error);
  }
};

export const deleteFixedDepositAccount = async (
  req: IAuthorizedRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const actor = assertMembership(req);
    const id = getRequiredParam(req.params.id, "id");

    await softDeleteFdAccount(actor, id);
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
};

export const deleteFixedDepositProjectType = async (
  req: IAuthorizedRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const actor = assertMembership(req);
    const id = getRequiredParam(req.params.id, "id");

    await softDeleteProjectType(actor, id);
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
};
