/*
  Warnings:

  - The values [EXPIRED,NOT_REQUIRED] on the enum `MandateStatus` will be removed. If these variants are still used in the database, this will fail.
  - The values [EXPIRED] on the enum `SubscriptionStatus` will be removed. If these variants are still used in the database, this will fail.
  - The values [PROCESSING,NOT_INITIATED,REFUNDED] on the enum `SubscriptionTransactionStatus` will be removed. If these variants are still used in the database, this will fail.
  - You are about to drop the column `currency` on the `SocietyPlanSettings` table. All the data in the column will be lost.
  - You are about to drop the column `customSubscriptionPlanId` on the `SocietyPlanSettings` table. All the data in the column will be lost.
  - You are about to drop the column `graceUntil` on the `SocietyPlanSettings` table. All the data in the column will be lost.
  - You are about to drop the column `isTrialUsed` on the `SocietyPlanSettings` table. All the data in the column will be lost.
  - You are about to drop the column `maxCustomers` on the `SocietyPlanSettings` table. All the data in the column will be lost.
  - You are about to drop the column `planAmount` on the `SocietyPlanSettings` table. All the data in the column will be lost.
  - You are about to drop the column `planId` on the `SocietyPlanSettings` table. All the data in the column will be lost.
  - You are about to drop the column `planName` on the `SocietyPlanSettings` table. All the data in the column will be lost.
  - You are about to drop the column `setupFeeDueAt` on the `SocietyPlanSettings` table. All the data in the column will be lost.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "MandateStatus_new" AS ENUM ('ACTIVE', 'PENDING', 'FAILED');
ALTER TABLE "public"."Subscription" ALTER COLUMN "mandateStatus" DROP DEFAULT;
ALTER TABLE "Subscription" ALTER COLUMN "mandateStatus" TYPE "MandateStatus_new" USING ("mandateStatus"::text::"MandateStatus_new");
ALTER TYPE "MandateStatus" RENAME TO "MandateStatus_old";
ALTER TYPE "MandateStatus_new" RENAME TO "MandateStatus";
DROP TYPE "public"."MandateStatus_old";
ALTER TABLE "Subscription" ALTER COLUMN "mandateStatus" SET DEFAULT 'PENDING';
COMMIT;

-- AlterEnum
BEGIN;
CREATE TYPE "SubscriptionStatus_new" AS ENUM ('ACTIVE', 'PAUSED', 'CANCELLED', 'PAYMENT_FAILED', 'PENDING_ACTIVATION');
ALTER TABLE "Subscription" ALTER COLUMN "status" TYPE "SubscriptionStatus_new" USING ("status"::text::"SubscriptionStatus_new");
ALTER TABLE "SubscriptionStateTransition" ALTER COLUMN "fromStatus" TYPE "SubscriptionStatus_new" USING ("fromStatus"::text::"SubscriptionStatus_new");
ALTER TABLE "SubscriptionStateTransition" ALTER COLUMN "toStatus" TYPE "SubscriptionStatus_new" USING ("toStatus"::text::"SubscriptionStatus_new");
ALTER TYPE "SubscriptionStatus" RENAME TO "SubscriptionStatus_old";
ALTER TYPE "SubscriptionStatus_new" RENAME TO "SubscriptionStatus";
DROP TYPE "public"."SubscriptionStatus_old";
COMMIT;

-- AlterEnum
BEGIN;
CREATE TYPE "SubscriptionTransactionStatus_new" AS ENUM ('SUCCESS', 'FAILED', 'PENDING');
ALTER TABLE "public"."SubscriptionTransaction" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "SubscriptionTransaction" ALTER COLUMN "status" TYPE "SubscriptionTransactionStatus_new" USING ("status"::text::"SubscriptionTransactionStatus_new");
ALTER TYPE "SubscriptionTransactionStatus" RENAME TO "SubscriptionTransactionStatus_old";
ALTER TYPE "SubscriptionTransactionStatus_new" RENAME TO "SubscriptionTransactionStatus";
DROP TYPE "public"."SubscriptionTransactionStatus_old";
ALTER TABLE "SubscriptionTransaction" ALTER COLUMN "status" SET DEFAULT 'PENDING';
COMMIT;

-- AlterTable
ALTER TABLE "SocietyPlanSettings" DROP COLUMN "currency",
DROP COLUMN "customSubscriptionPlanId",
DROP COLUMN "graceUntil",
DROP COLUMN "isTrialUsed",
DROP COLUMN "maxCustomers",
DROP COLUMN "planAmount",
DROP COLUMN "planId",
DROP COLUMN "planName",
DROP COLUMN "setupFeeDueAt",
ADD COLUMN     "trialStartDate" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Subscription" ADD COLUMN     "oneTimeAddonAmount" DECIMAL(14,2),
ADD COLUMN     "oneTimeAddonApplied" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "SubscriptionTransaction" ALTER COLUMN "status" SET DEFAULT 'PENDING';
