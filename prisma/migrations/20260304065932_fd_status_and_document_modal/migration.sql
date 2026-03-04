/*
  Warnings:

  - Added the required column `principalAmount` to the `FixDeposit` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "FixDeposit" ADD COLUMN     "principalAmount" DECIMAL(14,2) NOT NULL;

-- CreateTable
CREATE TABLE "ServiceDocument" (
    "id" TEXT NOT NULL,
    "serviceType" "ServiceType" NOT NULL,
    "serviceEntityId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "objectKey" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "contentType" TEXT,
    "sizeBytes" INTEGER,
    "isUploaded" BOOLEAN NOT NULL DEFAULT false,
    "fixDepositId" TEXT,
    "recurringDepositId" TEXT,
    "monthlyInterestSchemeId" TEXT,
    "loanId" TEXT,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "createdBy" TEXT NOT NULL,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServiceDocument_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ServiceDocument_objectKey_key" ON "ServiceDocument"("objectKey");

-- CreateIndex
CREATE INDEX "ServiceDocument_fixDepositId_idx" ON "ServiceDocument"("fixDepositId");

-- CreateIndex
CREATE INDEX "ServiceDocument_isUploaded_idx" ON "ServiceDocument"("isUploaded");

-- CreateIndex
CREATE INDEX "ServiceDocument_serviceType_serviceEntityId_idx" ON "ServiceDocument"("serviceType", "serviceEntityId");

-- CreateIndex
CREATE INDEX "ServiceDocument_recurringDepositId_idx" ON "ServiceDocument"("recurringDepositId");

-- CreateIndex
CREATE INDEX "ServiceDocument_monthlyInterestSchemeId_idx" ON "ServiceDocument"("monthlyInterestSchemeId");

-- CreateIndex
CREATE INDEX "ServiceDocument_loanId_idx" ON "ServiceDocument"("loanId");

-- CreateIndex
CREATE INDEX "FixDeposit_maturityDate_idx" ON "FixDeposit"("maturityDate");

-- CreateIndex
CREATE INDEX "FixDepositTransaction_createdAt_idx" ON "FixDepositTransaction"("createdAt");

-- AddForeignKey
ALTER TABLE "ServiceDocument" ADD CONSTRAINT "ServiceDocument_fixDepositId_fkey" FOREIGN KEY ("fixDepositId") REFERENCES "FixDeposit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceDocument" ADD CONSTRAINT "ServiceDocument_recurringDepositId_fkey" FOREIGN KEY ("recurringDepositId") REFERENCES "RecurringDeposit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceDocument" ADD CONSTRAINT "ServiceDocument_monthlyInterestSchemeId_fkey" FOREIGN KEY ("monthlyInterestSchemeId") REFERENCES "MonthlyInterestScheme"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceDocument" ADD CONSTRAINT "ServiceDocument_loanId_fkey" FOREIGN KEY ("loanId") REFERENCES "Loan"("id") ON DELETE SET NULL ON UPDATE CASCADE;
