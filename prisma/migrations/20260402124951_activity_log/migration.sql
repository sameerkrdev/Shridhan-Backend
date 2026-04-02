-- CreateEnum
CREATE TYPE "ActivityEntityType" AS ENUM ('FD_PROJECT_TYPE', 'MIS_PROJECT_TYPE', 'RD_PROJECT_TYPE', 'FD_ACCOUNT', 'MIS_ACCOUNT', 'RD_ACCOUNT');

-- CreateEnum
CREATE TYPE "ActivityActionType" AS ENUM ('CREATED', 'UPDATED', 'DELETED', 'STATUS_UPDATED', 'TRANSACTION_ADDED', 'DEPOSIT_ADDED', 'INTEREST_PAID', 'PRINCIPAL_RETURNED', 'PAYMENT_ADDED', 'WITHDRAWN', 'DOCUMENT_UPLOAD_COMPLETED', 'DOCUMENT_UPDATED', 'DOCUMENT_DELETED');

-- CreateTable
CREATE TABLE "ActivityLog" (
    "id" TEXT NOT NULL,
    "societyId" TEXT NOT NULL,
    "entityType" "ActivityEntityType" NOT NULL,
    "entityId" TEXT NOT NULL,
    "actionType" "ActivityActionType" NOT NULL,
    "actorMembershipId" TEXT,
    "actorName" TEXT NOT NULL,
    "actorPhone" TEXT NOT NULL,
    "actorRoleName" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActivityLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ActivityLog_societyId_entityType_entityId_createdAt_idx" ON "ActivityLog"("societyId", "entityType", "entityId", "createdAt");

-- CreateIndex
CREATE INDEX "ActivityLog_societyId_createdAt_idx" ON "ActivityLog"("societyId", "createdAt");

-- AddForeignKey
ALTER TABLE "ActivityLog" ADD CONSTRAINT "ActivityLog_societyId_fkey" FOREIGN KEY ("societyId") REFERENCES "Society"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
