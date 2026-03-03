-- CreateTable
CREATE TABLE "SocietyCustomRole" (
    "id" TEXT NOT NULL,
    "societyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "permitRoleKey" TEXT NOT NULL,
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SocietyCustomRole_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SocietyCustomRole_societyId_idx" ON "SocietyCustomRole"("societyId");

-- CreateIndex
CREATE UNIQUE INDEX "SocietyCustomRole_societyId_name_key" ON "SocietyCustomRole"("societyId", "name");

-- AddForeignKey
ALTER TABLE "SocietyCustomRole" ADD CONSTRAINT "SocietyCustomRole_societyId_fkey" FOREIGN KEY ("societyId") REFERENCES "Society"("id") ON DELETE CASCADE ON UPDATE CASCADE;
