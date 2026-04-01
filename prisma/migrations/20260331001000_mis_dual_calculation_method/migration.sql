-- CreateEnum
CREATE TYPE "MisCalculationMethod" AS ENUM ('MONTHLY_PAYOUT_PER_THOUSAND', 'ANNUAL_INTEREST_RATE');

-- AlterTable
ALTER TABLE "MonthlyInterestSchemeProjectType"
ADD COLUMN "calculationMethod" "MisCalculationMethod" NOT NULL DEFAULT 'MONTHLY_PAYOUT_PER_THOUSAND',
ADD COLUMN "annualInterestRate" DECIMAL(7,4),
ALTER COLUMN "monthlyPayoutAmountPerThousand" DROP NOT NULL;
