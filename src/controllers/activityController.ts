import { listActivities } from "@/services/activityService.js";
import type { IAuthorizedRequest } from "@/types/authType.js";
import type { NextFunction, Response } from "express";
import createHttpError from "http-errors";

export const getActivities = async (req: IAuthorizedRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.membership) {
      throw createHttpError(400, "Society context is missing. Provide x-society-id header.");
    }

    const entityType = typeof req.query.entityType === "string" ? req.query.entityType : undefined;
    const entityId = typeof req.query.entityId === "string" ? req.query.entityId : undefined;
    const actionType = typeof req.query.actionType === "string" ? req.query.actionType : undefined;
    const actorMembershipId =
      typeof req.query.actorMembershipId === "string" ? req.query.actorMembershipId : undefined;
    const search = typeof req.query.search === "string" ? req.query.search : undefined;
    const fromDate = typeof req.query.fromDate === "string" ? req.query.fromDate : undefined;
    const toDate = typeof req.query.toDate === "string" ? req.query.toDate : undefined;
    const page = Number(req.query.page ?? "1");
    const pageSize = Number(req.query.pageSize ?? "20");

    const payload = await listActivities(req.membership.societyId, {
      ...(entityType ? { entityType } : {}),
      ...(entityId ? { entityId } : {}),
      ...(actionType ? { actionType } : {}),
      ...(actorMembershipId ? { actorMembershipId } : {}),
      ...(search ? { search } : {}),
      ...(fromDate ? { fromDate } : {}),
      ...(toDate ? { toDate } : {}),
      page,
      pageSize,
    });

    res.json(payload);
  } catch (error) {
    next(error);
  }
};
