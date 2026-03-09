-- AlterEnum
ALTER TYPE "ServiceStatus" ADD VALUE 'PENDING_DEPOSIT';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "TransactionType" ADD VALUE 'DEPOSIT';
ALTER TYPE "TransactionType" ADD VALUE 'INTEREST_PAYOUT';
ALTER TYPE "TransactionType" ADD VALUE 'PRINCIPAL_RETURN';

-- AlterTable
ALTER TABLE "FixedDepositProjectType" ADD COLUMN     "minimumAmount" DECIMAL(14,2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "MonthlyInterestScheme" ADD COLUMN     "depositAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "monthlyInterest" DECIMAL(14,2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "MonthlyInterestSchemeProjectType" ADD COLUMN     "minimumAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "monthlyInterestPerLakh" DECIMAL(14,2),
ADD COLUMN     "monthlyInterestRate" DECIMAL(14,2),
ALTER COLUMN "payoutInPercentPerHundred" DROP NOT NULL,
ALTER COLUMN "payoutPerHundred" DROP NOT NULL;

-- AlterTable
ALTER TABLE "MonthlyInterestSchemeTransaction" ADD COLUMN     "isExpected" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "MonthlyInterestSchemeTransaction_monthlyInterestSchemeId_mo_idx" ON "MonthlyInterestSchemeTransaction"("monthlyInterestSchemeId", "month", "isExpected");
