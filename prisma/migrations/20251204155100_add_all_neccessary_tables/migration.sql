/*
  Warnings:

  - You are about to drop the `member` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `societies` table. If the table is not empty, all the data it contains will be lost.

*/
-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('ACTIVE', 'PAUSED', 'CANCELLED', 'EXPIRED', 'PAYMENT_FAILED', 'PENDING_ACTIVATION');

-- CreateEnum
CREATE TYPE "MandateStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'PENDING', 'FAILED', 'NOT_REQUIRED');

-- CreateEnum
CREATE TYPE "SubscriptionTransactionStatus" AS ENUM ('SUCCESS', 'FAILED', 'PENDING', 'PROCESSING', 'NOT_INITIATED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "LoanStatus" AS ENUM ('ONGOING', 'COMPLETED');

-- CreateEnum
CREATE TYPE "LoanEmiStatus" AS ENUM ('PENDING', 'PAID');

-- CreateEnum
CREATE TYPE "ServiceStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'CLOSED');

-- CreateEnum
CREATE TYPE "TransactionType" AS ENUM ('CREDIT', 'PAYOUT');

-- CreateEnum
CREATE TYPE "RecurringDepositTransactionType" AS ENUM ('CREDIT', 'PAYOUT');

-- CreateEnum
CREATE TYPE "ServiceType" AS ENUM ('FIX_DEPOSIT', 'RECURING_DEPOSIT', 'MONTHLY_INTEREST_SCHEME');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('UPI', 'CASH', 'CHEQUE');

-- CreateEnum
CREATE TYPE "CustomerAccountType" AS ENUM ('LOAN', 'FIXED_DEPOSIT', 'MONTHLY_INTEREST_SCHEME', 'RECURING_DEPOSIT');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "SocietyStatus" ADD VALUE 'TRIAL';
ALTER TYPE "SocietyStatus" ADD VALUE 'ACTIVE';
ALTER TYPE "SocietyStatus" ADD VALUE 'GRACE';
ALTER TYPE "SocietyStatus" ADD VALUE 'EXPIRED';
ALTER TYPE "SocietyStatus" ADD VALUE 'SUSPENDED';
ALTER TYPE "SocietyStatus" ADD VALUE 'BLOCKED';

-- DropForeignKey
ALTER TABLE "member" DROP CONSTRAINT "member_societyId_fkey";

-- DropTable
DROP TABLE "member";

-- DropTable
DROP TABLE "societies";

-- CreateTable
CREATE TABLE "Society" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "subDomainName" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "zipcode" TEXT NOT NULL,
    "logoUrl" TEXT NOT NULL,
    "status" "SocietyStatus" NOT NULL,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Society_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SocietyPlanSettings" (
    "id" TEXT NOT NULL,
    "societyId" TEXT NOT NULL,
    "planId" TEXT,
    "planName" TEXT,
    "planAmount" DECIMAL(14,2),
    "currency" TEXT DEFAULT 'INR',
    "maxCustomers" INTEGER,
    "isTrialUsed" BOOLEAN NOT NULL DEFAULT false,
    "trialEndDate" TIMESTAMP(3),
    "graceUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SocietyPlanSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Subscription" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "razorpaySubId" TEXT NOT NULL,
    "planName" TEXT NOT NULL,
    "planAmount" DECIMAL(14,2) NOT NULL,
    "billingPeriod" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "status" "SubscriptionStatus" NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "nextBillingAt" TIMESTAMP(3) NOT NULL,
    "previousBillingAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "mandateStatus" "MandateStatus" NOT NULL DEFAULT 'PENDING',
    "mandateUpdatedAt" TIMESTAMP(3),
    "authAttempts" INTEGER NOT NULL DEFAULT 0,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "maxRetries" INTEGER NOT NULL DEFAULT 3,
    "isInGrace" BOOLEAN NOT NULL DEFAULT false,
    "graceEndDate" TIMESTAMP(3),
    "societyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubscriptionTransaction" (
    "id" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "status" "SubscriptionTransactionStatus" NOT NULL DEFAULT 'NOT_INITIATED',
    "isPaid" BOOLEAN NOT NULL DEFAULT false,
    "razorpayPaymentId" TEXT,
    "billingDate" TIMESTAMP(3) NOT NULL,
    "paymentDate" TIMESTAMP(3),
    "paymentMethod" "PaymentMethod",
    "paymentCycleCount" INTEGER NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SubscriptionTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Member" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "societyId" TEXT NOT NULL,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Member_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Customer" (
    "id" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "address" TEXT,
    "aadhaar" TEXT,
    "pan" TEXT,
    "accountType" "CustomerAccountType" NOT NULL,
    "societyId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "createdBy" TEXT NOT NULL,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Nominee" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "address" TEXT,
    "email" TEXT,
    "relation" TEXT,
    "aadhaar" TEXT,
    "pan" TEXT,
    "customerId" TEXT NOT NULL,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "createdBy" TEXT NOT NULL,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Nominee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FixedDepositProjectType" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "maturityMultiple" DECIMAL(14,2) NOT NULL,
    "maturityAmountPerHundred" DECIMAL(14,2) NOT NULL,
    "duration" INTEGER NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "societyId" TEXT NOT NULL,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "createdBy" TEXT NOT NULL,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FixedDepositProjectType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FixDeposit" (
    "id" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "maturityAmount" DECIMAL(14,2) NOT NULL,
    "maturityDate" TIMESTAMP(3) NOT NULL,
    "status" "ServiceStatus" NOT NULL,
    "projectTypeId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "createdBy" TEXT NOT NULL,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FixDeposit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FixDepositTransaction" (
    "id" TEXT NOT NULL,
    "type" "TransactionType" NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "month" INTEGER,
    "paymentMethod" "PaymentMethod",
    "transactionId" TEXT,
    "upiId" TEXT,
    "chequeNumber" TEXT,
    "bankName" TEXT,
    "fixDepositId" TEXT NOT NULL,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "createdBy" TEXT NOT NULL,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FixDepositTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MonthlyInterestSchemeProjectType" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "payoutInPercentPerHundred" DECIMAL(14,2) NOT NULL,
    "payoutPerHundred" DECIMAL(14,2) NOT NULL,
    "duration" INTEGER NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "societyId" TEXT NOT NULL,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "createdBy" TEXT NOT NULL,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MonthlyInterestSchemeProjectType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MonthlyInterestScheme" (
    "id" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "maturityAmount" DECIMAL(14,2) NOT NULL,
    "maturityDate" TIMESTAMP(3) NOT NULL,
    "status" "ServiceStatus" NOT NULL,
    "projectTypeId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "createdBy" TEXT NOT NULL,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MonthlyInterestScheme_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MonthlyInterestSchemeTransaction" (
    "id" TEXT NOT NULL,
    "month" INTEGER,
    "amount" DECIMAL(14,2) NOT NULL,
    "type" "TransactionType" NOT NULL,
    "paymentMethod" "PaymentMethod",
    "transactionId" TEXT,
    "upiId" TEXT,
    "chequeNumber" TEXT,
    "bankName" TEXT,
    "monthlyInterestSchemeId" TEXT NOT NULL,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "createdBy" TEXT NOT NULL,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MonthlyInterestSchemeTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecurringDepositProjectType" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "maturityMultiple" DECIMAL(14,2) NOT NULL,
    "maturityAmountPerHundred" DECIMAL(14,2) NOT NULL,
    "duration" INTEGER NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "societyId" TEXT NOT NULL,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "createdBy" TEXT NOT NULL,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RecurringDepositProjectType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecurringDeposit" (
    "id" TEXT NOT NULL,
    "isProjectTypeCustom" BOOLEAN NOT NULL,
    "depositAmount" DECIMAL(14,2) NOT NULL,
    "payoutAmount" DECIMAL(14,2) NOT NULL,
    "interestRate" DECIMAL(14,2) NOT NULL,
    "fineBaseRate" DECIMAL(14,2) NOT NULL,
    "fineCurrentRate" DECIMAL(14,2) NOT NULL,
    "fineAccumulated" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "status" "ServiceStatus" NOT NULL,
    "projectTypeId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "createdBy" TEXT NOT NULL,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RecurringDeposit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecurringDepositTransaction" (
    "id" TEXT NOT NULL,
    "recurringDepositId" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "fineAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "type" "RecurringDepositTransactionType" NOT NULL,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "createdBy" TEXT NOT NULL,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RecurringDepositTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Loan" (
    "id" TEXT NOT NULL,
    "principalAmount" DECIMAL(14,2) NOT NULL,
    "interestRate" DECIMAL(14,2) NOT NULL,
    "fineBaseRate" DECIMAL(14,2) NOT NULL,
    "fineCurrentRate" DECIMAL(14,2) NOT NULL,
    "fineAccumulated" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "totalPaid" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "startDate" TIMESTAMP(3) NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "status" "LoanStatus" NOT NULL,
    "customerId" TEXT NOT NULL,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "createdBy" TEXT NOT NULL,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Loan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoanEmi" (
    "id" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "fineAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "paidDate" TIMESTAMP(3),
    "status" "LoanEmiStatus" NOT NULL,
    "loanId" TEXT NOT NULL,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "createdBy" TEXT NOT NULL,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LoanEmi_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Society_name_key" ON "Society"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Society_subDomainName_key" ON "Society"("subDomainName");

-- CreateIndex
CREATE INDEX "Society_subDomainName_idx" ON "Society"("subDomainName");

-- CreateIndex
CREATE INDEX "Society_status_idx" ON "Society"("status");

-- CreateIndex
CREATE UNIQUE INDEX "SocietyPlanSettings_societyId_key" ON "SocietyPlanSettings"("societyId");

-- CreateIndex
CREATE INDEX "SocietyPlanSettings_societyId_idx" ON "SocietyPlanSettings"("societyId");

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_razorpaySubId_key" ON "Subscription"("razorpaySubId");

-- CreateIndex
CREATE INDEX "Subscription_societyId_idx" ON "Subscription"("societyId");

-- CreateIndex
CREATE INDEX "Subscription_razorpaySubId_idx" ON "Subscription"("razorpaySubId");

-- CreateIndex
CREATE INDEX "Subscription_status_idx" ON "Subscription"("status");

-- CreateIndex
CREATE UNIQUE INDEX "SubscriptionTransaction_razorpayPaymentId_key" ON "SubscriptionTransaction"("razorpayPaymentId");

-- CreateIndex
CREATE INDEX "SubscriptionTransaction_subscriptionId_idx" ON "SubscriptionTransaction"("subscriptionId");

-- CreateIndex
CREATE INDEX "SubscriptionTransaction_razorpayPaymentId_idx" ON "SubscriptionTransaction"("razorpayPaymentId");

-- CreateIndex
CREATE INDEX "SubscriptionTransaction_status_idx" ON "SubscriptionTransaction"("status");

-- CreateIndex
CREATE INDEX "Member_societyId_idx" ON "Member"("societyId");

-- CreateIndex
CREATE INDEX "Member_phone_idx" ON "Member"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "Member_societyId_phone_key" ON "Member"("societyId", "phone");

-- CreateIndex
CREATE INDEX "Customer_societyId_idx" ON "Customer"("societyId");

-- CreateIndex
CREATE INDEX "Customer_memberId_idx" ON "Customer"("memberId");

-- CreateIndex
CREATE INDEX "Customer_phone_idx" ON "Customer"("phone");

-- CreateIndex
CREATE INDEX "Nominee_customerId_idx" ON "Nominee"("customerId");

-- CreateIndex
CREATE INDEX "Nominee_phone_idx" ON "Nominee"("phone");

-- CreateIndex
CREATE INDEX "FixedDepositProjectType_societyId_idx" ON "FixedDepositProjectType"("societyId");

-- CreateIndex
CREATE INDEX "FixedDepositProjectType_name_idx" ON "FixedDepositProjectType"("name");

-- CreateIndex
CREATE INDEX "FixDeposit_projectTypeId_idx" ON "FixDeposit"("projectTypeId");

-- CreateIndex
CREATE INDEX "FixDeposit_customerId_idx" ON "FixDeposit"("customerId");

-- CreateIndex
CREATE INDEX "FixDepositTransaction_fixDepositId_idx" ON "FixDepositTransaction"("fixDepositId");

-- CreateIndex
CREATE INDEX "FixDepositTransaction_transactionId_idx" ON "FixDepositTransaction"("transactionId");

-- CreateIndex
CREATE INDEX "MonthlyInterestSchemeProjectType_societyId_idx" ON "MonthlyInterestSchemeProjectType"("societyId");

-- CreateIndex
CREATE INDEX "MonthlyInterestSchemeProjectType_name_idx" ON "MonthlyInterestSchemeProjectType"("name");

-- CreateIndex
CREATE INDEX "MonthlyInterestScheme_projectTypeId_idx" ON "MonthlyInterestScheme"("projectTypeId");

-- CreateIndex
CREATE INDEX "MonthlyInterestScheme_customerId_idx" ON "MonthlyInterestScheme"("customerId");

-- CreateIndex
CREATE INDEX "MonthlyInterestSchemeTransaction_monthlyInterestSchemeId_idx" ON "MonthlyInterestSchemeTransaction"("monthlyInterestSchemeId");

-- CreateIndex
CREATE INDEX "MonthlyInterestSchemeTransaction_transactionId_idx" ON "MonthlyInterestSchemeTransaction"("transactionId");

-- CreateIndex
CREATE INDEX "RecurringDepositProjectType_societyId_idx" ON "RecurringDepositProjectType"("societyId");

-- CreateIndex
CREATE INDEX "RecurringDepositProjectType_name_idx" ON "RecurringDepositProjectType"("name");

-- CreateIndex
CREATE INDEX "RecurringDeposit_projectTypeId_idx" ON "RecurringDeposit"("projectTypeId");

-- CreateIndex
CREATE INDEX "RecurringDeposit_customerId_idx" ON "RecurringDeposit"("customerId");

-- CreateIndex
CREATE INDEX "RecurringDepositTransaction_recurringDepositId_idx" ON "RecurringDepositTransaction"("recurringDepositId");

-- CreateIndex
CREATE INDEX "Loan_customerId_idx" ON "Loan"("customerId");

-- CreateIndex
CREATE INDEX "LoanEmi_loanId_idx" ON "LoanEmi"("loanId");

-- AddForeignKey
ALTER TABLE "SocietyPlanSettings" ADD CONSTRAINT "SocietyPlanSettings_societyId_fkey" FOREIGN KEY ("societyId") REFERENCES "Society"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_societyId_fkey" FOREIGN KEY ("societyId") REFERENCES "Society"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubscriptionTransaction" ADD CONSTRAINT "SubscriptionTransaction_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Member" ADD CONSTRAINT "Member_societyId_fkey" FOREIGN KEY ("societyId") REFERENCES "Society"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_societyId_fkey" FOREIGN KEY ("societyId") REFERENCES "Society"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Nominee" ADD CONSTRAINT "Nominee_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FixedDepositProjectType" ADD CONSTRAINT "FixedDepositProjectType_societyId_fkey" FOREIGN KEY ("societyId") REFERENCES "Society"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FixDeposit" ADD CONSTRAINT "FixDeposit_projectTypeId_fkey" FOREIGN KEY ("projectTypeId") REFERENCES "FixedDepositProjectType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FixDeposit" ADD CONSTRAINT "FixDeposit_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FixDepositTransaction" ADD CONSTRAINT "FixDepositTransaction_fixDepositId_fkey" FOREIGN KEY ("fixDepositId") REFERENCES "FixDeposit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MonthlyInterestSchemeProjectType" ADD CONSTRAINT "MonthlyInterestSchemeProjectType_societyId_fkey" FOREIGN KEY ("societyId") REFERENCES "Society"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MonthlyInterestScheme" ADD CONSTRAINT "MonthlyInterestScheme_projectTypeId_fkey" FOREIGN KEY ("projectTypeId") REFERENCES "MonthlyInterestSchemeProjectType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MonthlyInterestScheme" ADD CONSTRAINT "MonthlyInterestScheme_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MonthlyInterestSchemeTransaction" ADD CONSTRAINT "MonthlyInterestSchemeTransaction_monthlyInterestSchemeId_fkey" FOREIGN KEY ("monthlyInterestSchemeId") REFERENCES "MonthlyInterestScheme"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecurringDepositProjectType" ADD CONSTRAINT "RecurringDepositProjectType_societyId_fkey" FOREIGN KEY ("societyId") REFERENCES "Society"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecurringDeposit" ADD CONSTRAINT "RecurringDeposit_projectTypeId_fkey" FOREIGN KEY ("projectTypeId") REFERENCES "RecurringDepositProjectType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecurringDeposit" ADD CONSTRAINT "RecurringDeposit_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecurringDepositTransaction" ADD CONSTRAINT "RecurringDepositTransaction_recurringDepositId_fkey" FOREIGN KEY ("recurringDepositId") REFERENCES "RecurringDeposit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Loan" ADD CONSTRAINT "Loan_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoanEmi" ADD CONSTRAINT "LoanEmi_loanId_fkey" FOREIGN KEY ("loanId") REFERENCES "Loan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
