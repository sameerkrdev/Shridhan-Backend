/*
  Warnings:

  - You are about to drop the column `maxRetries` on the `Subscription` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[razorpayRefundId]` on the table `SubscriptionTransaction` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterEnum
ALTER TYPE "SubscriptionTransactionStatus" ADD VALUE 'REFUNDED';

-- AlterTable
ALTER TABLE "Subscription" DROP COLUMN "maxRetries";

-- AlterTable
ALTER TABLE "SubscriptionTransaction" ADD COLUMN     "razorpayRefundId" TEXT,
ADD COLUMN     "refundDate" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "SubscriptionTransaction_razorpayRefundId_key" ON "SubscriptionTransaction"("razorpayRefundId");
