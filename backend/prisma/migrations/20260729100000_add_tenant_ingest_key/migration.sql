-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN "ingestKey" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Tenant_ingestKey_key" ON "Tenant"("ingestKey");
