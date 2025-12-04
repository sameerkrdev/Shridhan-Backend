-- DropForeignKey
ALTER TABLE "Member" DROP CONSTRAINT "Member_societyId_fkey";

-- AlterTable
ALTER TABLE "Member" ALTER COLUMN "societyId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "Member" ADD CONSTRAINT "Member_societyId_fkey" FOREIGN KEY ("societyId") REFERENCES "Society"("id") ON DELETE SET NULL ON UPDATE CASCADE;
