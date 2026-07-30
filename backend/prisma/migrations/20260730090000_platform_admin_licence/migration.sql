-- AlterTable
ALTER TABLE "User" ADD COLUMN "isPlatformAdmin" BOOLEAN NOT NULL DEFAULT false;
-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN "licenceExpiresAt" TIMESTAMP(3);
