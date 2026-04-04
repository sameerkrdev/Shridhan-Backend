-- DropIndex
DROP INDEX IF EXISTS "Society_subDomainName_idx";

-- DropIndex
DROP INDEX IF EXISTS "Society_subDomainName_key";

-- AlterTable
ALTER TABLE "Society" DROP COLUMN "subDomainName";
