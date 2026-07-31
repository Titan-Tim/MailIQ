-- AlterTable
ALTER TABLE "InboundItem" ADD COLUMN "exportRef" TEXT, ADD COLUMN "exportFilename" TEXT, ADD COLUMN "exportTarget" TEXT;
-- CreateTable
CREATE TABLE "InboundExportRule" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "priority" INTEGER NOT NULL DEFAULT 0,
  "matchDocumentType" TEXT,
  "matchKeyword" TEXT,
  "format" TEXT NOT NULL,
  "filenameTemplate" TEXT NOT NULL DEFAULT '{ref}.pdf',
  "exportTarget" TEXT NOT NULL DEFAULT 'default',
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "InboundExportRule_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "InboundExportRule_tenantId_idx" ON "InboundExportRule"("tenantId");
ALTER TABLE "InboundExportRule" ADD CONSTRAINT "InboundExportRule_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
