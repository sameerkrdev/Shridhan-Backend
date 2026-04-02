import z from "zod";

export const listActivitiesSchema = z.object({
  query: z.object({
    entityType: z
      .enum([
        "FD_PROJECT_TYPE",
        "MIS_PROJECT_TYPE",
        "RD_PROJECT_TYPE",
        "FD_ACCOUNT",
        "MIS_ACCOUNT",
        "RD_ACCOUNT",
      ])
      .optional(),
    entityId: z.string().uuid().optional(),
    actionType: z.string().optional(),
    actorMembershipId: z.string().optional(),
    search: z.string().optional(),
    fromDate: z.string().optional(),
    toDate: z.string().optional(),
    page: z.coerce.number().int().min(1).optional(),
    pageSize: z.coerce.number().int().min(1).max(100).optional(),
  }),
});
