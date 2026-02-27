/*
  Warnings:

  - The values [TRIAL,GRACE,EXPIRED,SUSPENDED,BLOCKED] on the enum `SocietyStatus` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "SocietyStatus_new" AS ENUM ('CREATED', 'PERMIT_PENDING', 'RAZORPAY_PENDING', 'ACTIVE');
ALTER TABLE "Society" ALTER COLUMN "status" TYPE "SocietyStatus_new" USING ("status"::text::"SocietyStatus_new");
ALTER TYPE "SocietyStatus" RENAME TO "SocietyStatus_old";
ALTER TYPE "SocietyStatus_new" RENAME TO "SocietyStatus";
DROP TYPE "public"."SocietyStatus_old";
COMMIT;

-- AlterTable
ALTER TABLE "Society" ALTER COLUMN "status" SET DEFAULT 'CREATED';

-- CreateTable
CREATE TABLE "RefreshToken" (
    "id" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "isRevoked" BOOLEAN NOT NULL DEFAULT false,
    "deviceId" TEXT,
    "userAgent" TEXT,
    "ipAddress" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "memberId" TEXT NOT NULL,

    CONSTRAINT "RefreshToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RefreshToken_memberId_idx" ON "RefreshToken"("memberId");

-- CreateIndex
CREATE INDEX "RefreshToken_expiresAt_idx" ON "RefreshToken"("expiresAt");

-- AddForeignKey
ALTER TABLE "RefreshToken" ADD CONSTRAINT "RefreshToken_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
