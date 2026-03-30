-- CreateEnum
CREATE TYPE "MisCalculationMethod_new" AS ENUM ('MONTHLY_PAYOUT_PER_HUNDRED', 'ANNUAL_INTEREST_RATE');

-- AlterTable: add new field for renamed payout basis
ALTER TABLE "MonthlyInterestSchemeProjectType"
ADD COLUMN "monthlyPayoutAmountPerHundred" DECIMAL(14,2);

-- Data migration: convert per-thousand to per-hundred scale
UPDATE "MonthlyInterestSchemeProjectType"
SET "monthlyPayoutAmountPerHundred" = CASE
  WHEN "monthlyPayoutAmountPerThousand" IS NULL THEN NULL
  ELSE "monthlyPayoutAmountPerThousand" / 10
END;

-- Migrate enum values
ALTER TABLE "MonthlyInterestSchemeProjectType"
ALTER COLUMN "calculationMethod" TYPE "MisCalculationMethod_new"
USING (
  CASE
    WHEN "calculationMethod"::text = 'MONTHLY_PAYOUT_PER_THOUSAND' THEN 'MONTHLY_PAYOUT_PER_HUNDRED'
    ELSE "calculationMethod"::text
  END
)::"MisCalculationMethod_new";

-- Replace old enum
DROP TYPE "MisCalculationMethod";
ALTER TYPE "MisCalculationMethod_new" RENAME TO "MisCalculationMethod";

-- Remove old field
ALTER TABLE "MonthlyInterestSchemeProjectType"
DROP COLUMN "monthlyPayoutAmountPerThousand";
