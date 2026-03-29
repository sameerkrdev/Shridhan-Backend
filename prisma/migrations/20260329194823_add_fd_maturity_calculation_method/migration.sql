-- CreateEnum
CREATE TYPE "MaturityCalculationMethod" AS ENUM ('PER_RS_100', 'MULTIPLE_OF_PRINCIPAL');

-- AlterTable
ALTER TABLE "FixedDepositProjectType" ADD COLUMN     "maturityCalculationMethod" "MaturityCalculationMethod" NOT NULL DEFAULT 'PER_RS_100';
