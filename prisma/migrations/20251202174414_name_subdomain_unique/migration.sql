/*
  Warnings:

  - A unique constraint covering the columns `[name]` on the table `societies` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[subDomainName]` on the table `societies` will be added. If there are existing duplicate values, this will fail.
  - Changed the type of `status` on the `societies` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- CreateEnum
CREATE TYPE "SocietyStatus" AS ENUM ('CREATED');

-- AlterTable
ALTER TABLE "societies" DROP COLUMN "status",
ADD COLUMN     "status" "SocietyStatus" NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "societies_name_key" ON "societies"("name");

-- CreateIndex
CREATE UNIQUE INDEX "societies_subDomainName_key" ON "societies"("subDomainName");
