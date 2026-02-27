-- AlterTable
ALTER TABLE "Member" ADD COLUMN     "permitUserKey" TEXT;

-- AlterTable
ALTER TABLE "Society" ADD COLUMN     "permitTenantKey" TEXT;

-- CreateTable
CREATE TABLE "SocietyPermission" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "permitPermissionKey" TEXT NOT NULL,
    "societyId" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SocietyPermission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SocietyRole" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "permitRoleKey" TEXT NOT NULL,
    "societyId" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SocietyRole_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SocietyRolePermission" (
    "id" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "permissionId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SocietyRolePermission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SocietyMemberRole" (
    "id" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SocietyMemberRole_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SocietyPermission_societyId_idx" ON "SocietyPermission"("societyId");

-- CreateIndex
CREATE UNIQUE INDEX "SocietyPermission_societyId_name_key" ON "SocietyPermission"("societyId", "name");

-- CreateIndex
CREATE INDEX "SocietyRole_societyId_idx" ON "SocietyRole"("societyId");

-- CreateIndex
CREATE UNIQUE INDEX "SocietyRole_societyId_name_key" ON "SocietyRole"("societyId", "name");

-- CreateIndex
CREATE INDEX "SocietyRolePermission_roleId_idx" ON "SocietyRolePermission"("roleId");

-- CreateIndex
CREATE INDEX "SocietyRolePermission_permissionId_idx" ON "SocietyRolePermission"("permissionId");

-- CreateIndex
CREATE UNIQUE INDEX "SocietyRolePermission_roleId_permissionId_key" ON "SocietyRolePermission"("roleId", "permissionId");

-- CreateIndex
CREATE INDEX "SocietyMemberRole_memberId_idx" ON "SocietyMemberRole"("memberId");

-- CreateIndex
CREATE INDEX "SocietyMemberRole_roleId_idx" ON "SocietyMemberRole"("roleId");

-- CreateIndex
CREATE UNIQUE INDEX "SocietyMemberRole_memberId_roleId_key" ON "SocietyMemberRole"("memberId", "roleId");

-- AddForeignKey
ALTER TABLE "SocietyPermission" ADD CONSTRAINT "SocietyPermission_societyId_fkey" FOREIGN KEY ("societyId") REFERENCES "Society"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SocietyRole" ADD CONSTRAINT "SocietyRole_societyId_fkey" FOREIGN KEY ("societyId") REFERENCES "Society"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SocietyRolePermission" ADD CONSTRAINT "SocietyRolePermission_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "SocietyRole"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SocietyRolePermission" ADD CONSTRAINT "SocietyRolePermission_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "SocietyPermission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SocietyMemberRole" ADD CONSTRAINT "SocietyMemberRole_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SocietyMemberRole" ADD CONSTRAINT "SocietyMemberRole_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "SocietyRole"("id") ON DELETE CASCADE ON UPDATE CASCADE;
