import type { ActivityActionType, ActivityEntityType, Prisma } from "@/generated/prisma/client.js";
import prisma from "@/config/prisma.js";

type ActivityPersistenceClient = Pick<typeof prisma, "membership" | "activityLog">;

export const logActivity = async (
  tx: ActivityPersistenceClient,
  actor: Prisma.MembershipModel,
  input: {
    entityType: ActivityEntityType;
    entityId: string;
    actionType: ActivityActionType;
    metadata?: Prisma.InputJsonValue;
  },
) => {
  const actorMembership = await tx.membership.findFirst({
    where: { id: actor.id, societyId: actor.societyId, deletedAt: null },
    include: {
      user: { select: { name: true, phone: true } },
      role: { select: { name: true } },
    },
  });

  await tx.activityLog.create({
    data: {
      societyId: actor.societyId,
      entityType: input.entityType,
      entityId: input.entityId,
      actionType: input.actionType,
      actorMembershipId: actorMembership?.id ?? null,
      actorName: actorMembership?.user.name ?? "Unknown",
      actorPhone: actorMembership?.user.phone ?? "N/A",
      actorRoleName: actorMembership?.role.name ?? "N/A",
      ...(input.metadata !== undefined ? { metadata: input.metadata } : {}),
    },
  });
};

export const listActivities = async (
  societyId: string,
  input: {
    entityType?: string;
    entityId?: string;
    actionType?: string;
    actorMembershipId?: string;
    search?: string;
    fromDate?: string;
    toDate?: string;
    page?: number;
    pageSize?: number;
  },
) => {
  const page = Math.max(1, input.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, input.pageSize ?? 20));
  const skip = (page - 1) * pageSize;

  const where: Prisma.ActivityLogWhereInput = {
    societyId,
    ...(input.entityType ? { entityType: input.entityType as never } : {}),
    ...(input.entityId ? { entityId: input.entityId } : {}),
    ...(input.actionType ? { actionType: input.actionType as never } : {}),
    ...(input.actorMembershipId ? { actorMembershipId: input.actorMembershipId } : {}),
  };

  if (input.search?.trim()) {
    where.OR = [
      { actorName: { contains: input.search, mode: "insensitive" } },
      { actorPhone: { contains: input.search, mode: "insensitive" } },
      { actorRoleName: { contains: input.search, mode: "insensitive" } },
      { entityId: { contains: input.search, mode: "insensitive" } },
    ];
  }
  if (input.fromDate || input.toDate) {
    where.createdAt = {
      ...(input.fromDate ? { gte: new Date(input.fromDate) } : {}),
      ...(input.toDate ? { lte: new Date(input.toDate) } : {}),
    };
  }

  const [items, total] = await Promise.all([
    prisma.activityLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: pageSize,
    }),
    prisma.activityLog.count({
      where,
    }),
  ]);

  return {
    items,
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
};
