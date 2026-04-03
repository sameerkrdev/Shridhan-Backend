-- AlterEnum
ALTER TYPE "ActivityActionType" ADD VALUE IF NOT EXISTS 'WAIVE_REQUEST_CREATED';
ALTER TYPE "ActivityActionType" ADD VALUE IF NOT EXISTS 'WAIVE_REQUEST_APPROVED';
ALTER TYPE "ActivityActionType" ADD VALUE IF NOT EXISTS 'WAIVE_REQUEST_REJECTED';
ALTER TYPE "ActivityActionType" ADD VALUE IF NOT EXISTS 'WAIVE_REQUEST_INVALIDATED';
ALTER TYPE "ActivityActionType" ADD VALUE IF NOT EXISTS 'WAIVED_FINE_APPLIED_IN_PAYMENT';

-- CreateEnum
CREATE TYPE "RdFineWaiveScopeType" AS ENUM ('ALL', 'SELECTED');

-- CreateEnum
CREATE TYPE "RdFineWaiveRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'EXPIRED', 'INVALIDATED');

-- CreateEnum
CREATE TYPE "RdFineWaiveInvalidationReason" AS ENUM ('PAID_ALREADY', 'MANUAL_REJECT', 'EXPIRED');

-- AlterTable
ALTER TABLE "RecurringDepositPaymentAllocation"
ADD COLUMN "waivedFineAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN "waivedByRequestId" TEXT,
ADD COLUMN "waivedApprovedByMembershipId" TEXT;

-- CreateTable
CREATE TABLE "RdFineWaiveRequest" (
    "id" TEXT NOT NULL,
    "recurringDepositId" TEXT NOT NULL,
    "requestedByMembershipId" TEXT NOT NULL,
    "scopeType" "RdFineWaiveScopeType" NOT NULL,
    "reason" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "status" "RdFineWaiveRequestStatus" NOT NULL DEFAULT 'PENDING',
    "reduceFromMaturity" BOOLEAN NOT NULL DEFAULT false,
    "approvedByMembershipId" TEXT,
    "approvedAt" TIMESTAMP(3),
    "rejectedByMembershipId" TEXT,
    "rejectedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "invalidationReason" "RdFineWaiveInvalidationReason",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RdFineWaiveRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RdFineWaiveRequestMonth" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "monthIndex" INTEGER NOT NULL,
    "waivedFineAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RdFineWaiveRequestMonth_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RecurringDepositPaymentAllocation_waivedByRequestId_idx" ON "RecurringDepositPaymentAllocation"("waivedByRequestId");

-- CreateIndex
CREATE INDEX "RdFineWaiveRequest_recurringDepositId_status_expiresAt_idx" ON "RdFineWaiveRequest"("recurringDepositId", "status", "expiresAt");

-- CreateIndex
CREATE INDEX "RdFineWaiveRequest_requestedByMembershipId_idx" ON "RdFineWaiveRequest"("requestedByMembershipId");

-- CreateIndex
CREATE UNIQUE INDEX "RdFineWaiveRequestMonth_requestId_monthIndex_key" ON "RdFineWaiveRequestMonth"("requestId", "monthIndex");

-- CreateIndex
CREATE INDEX "RdFineWaiveRequestMonth_requestId_idx" ON "RdFineWaiveRequestMonth"("requestId");

-- AddForeignKey
ALTER TABLE "RecurringDepositPaymentAllocation" ADD CONSTRAINT "RecurringDepositPaymentAllocation_waivedByRequestId_fkey" FOREIGN KEY ("waivedByRequestId") REFERENCES "RdFineWaiveRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RdFineWaiveRequest" ADD CONSTRAINT "RdFineWaiveRequest_recurringDepositId_fkey" FOREIGN KEY ("recurringDepositId") REFERENCES "RecurringDeposit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RdFineWaiveRequestMonth" ADD CONSTRAINT "RdFineWaiveRequestMonth_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "RdFineWaiveRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
