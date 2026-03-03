/*
  Warnings:

  - Made the column `createdBy` on table `SocietyCustomRole` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "SocietyCustomRole" ADD COLUMN     "permissions" TEXT[],
ALTER COLUMN "createdBy" SET NOT NULL;

-- CreateTable
CREATE TABLE "SocietyCustomRoleAssignment" (
    "id" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "membershipId" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SocietyCustomRoleAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SocietyCustomRoleAssignment_membershipId_idx" ON "SocietyCustomRoleAssignment"("membershipId");

-- CreateIndex
CREATE UNIQUE INDEX "SocietyCustomRoleAssignment_roleId_membershipId_key" ON "SocietyCustomRoleAssignment"("roleId", "membershipId");

-- AddForeignKey
ALTER TABLE "SocietyCustomRoleAssignment" ADD CONSTRAINT "SocietyCustomRoleAssignment_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "SocietyCustomRole"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SocietyCustomRoleAssignment" ADD CONSTRAINT "SocietyCustomRoleAssignment_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "Membership"("id") ON DELETE CASCADE ON UPDATE CASCADE;
