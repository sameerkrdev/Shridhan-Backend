-- CreateEnum
CREATE TYPE "RdFineCalculationMethod" AS ENUM ('FIXED_PER_STREAK_UNIT', 'PROPORTIONAL_PER_HUNDRED');

-- AlterTable
ALTER TABLE "RecurringDepositProjectType"
ADD COLUMN "fineCalculationMethod" "RdFineCalculationMethod" NOT NULL DEFAULT 'PROPORTIONAL_PER_HUNDRED',
ADD COLUMN "fixedOverdueFineAmount" DECIMAL(14,2);

-- Existing project types used proportional fine rate before this feature
UPDATE "RecurringDepositProjectType" SET "fineCalculationMethod" = 'PROPORTIONAL_PER_HUNDRED';

ALTER TABLE "RecurringDepositProjectType" ALTER COLUMN "fineCalculationMethod" SET DEFAULT 'FIXED_PER_STREAK_UNIT';

-- AlterTable
ALTER TABLE "RecurringDeposit"
ADD COLUMN "fineCalculationMethodSnapshot" "RdFineCalculationMethod",
ADD COLUMN "fixedOverdueFineAmountSnapshot" DECIMAL(14,2);

UPDATE "RecurringDeposit" SET "fineCalculationMethodSnapshot" = 'PROPORTIONAL_PER_HUNDRED';

ALTER TABLE "RecurringDeposit" ALTER COLUMN "fineCalculationMethodSnapshot" SET NOT NULL;
