-- CreateEnum
CREATE TYPE "TenantPlan" AS ENUM ('BASIC', 'BRANDED');

-- CreateEnum
CREATE TYPE "TenantStatus" AS ENUM ('ACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('SUPER_ADMIN', 'OPERATOR', 'VIEWER');

-- CreateEnum
CREATE TYPE "DeliveryMethod" AS ENUM ('DIGITAL', 'POST', 'AUTO');

-- CreateEnum
CREATE TYPE "DispatchStatus" AS ENUM ('PENDING', 'COMPOSING', 'READY', 'QUEUED', 'SENT', 'RETURNED', 'FAILED');

-- CreateEnum
CREATE TYPE "BatchStatus" AS ENUM ('OPEN', 'READY', 'PRINTED', 'POSTED');

-- CreateTable
CREATE TABLE "Tenant" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "logoUrl" TEXT,
    "brandColor" TEXT DEFAULT '#7c3aed',
    "plan" "TenantPlan" NOT NULL DEFAULT 'BASIC',
    "status" "TenantStatus" NOT NULL DEFAULT 'ACTIVE',
    "suspendedAt" TIMESTAMP(3),
    "suspendReason" TEXT,
    "addressZoneX" DOUBLE PRECISION NOT NULL DEFAULT 20,
    "addressZoneY" DOUBLE PRECISION NOT NULL DEFAULT 49,
    "addressZoneWidth" DOUBLE PRECISION NOT NULL DEFAULT 85,
    "addressZoneHeight" DOUBLE PRECISION NOT NULL DEFAULT 35,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Tenant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT,
    "role" "UserRole" NOT NULL DEFAULT 'OPERATOR',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Recipient" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "accountNumber" TEXT,
    "reference" TEXT,
    "externalId" TEXT,
    "title" TEXT,
    "firstName" TEXT,
    "lastName" TEXT NOT NULL,
    "companyName" TEXT,
    "addressLine1" TEXT,
    "addressLine2" TEXT,
    "city" TEXT,
    "county" TEXT,
    "postcode" TEXT,
    "country" TEXT NOT NULL DEFAULT 'GB',
    "email" TEXT,
    "deliveryMethod" "DeliveryMethod" NOT NULL DEFAULT 'AUTO',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Recipient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Insert" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT,
    "fileKey" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileSizeBytes" INTEGER NOT NULL,
    "pageCount" INTEGER NOT NULL DEFAULT 1,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Insert_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DispatchRule" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "documentType" TEXT,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "deliveryOverride" "DeliveryMethod",
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DispatchRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DispatchRuleInsert" (
    "id" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "insertId" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "DispatchRuleInsert_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Dispatch" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "recipientId" TEXT,
    "originalFileKey" TEXT NOT NULL,
    "originalFileName" TEXT NOT NULL,
    "fileSizeBytes" INTEGER NOT NULL,
    "pageCount" INTEGER NOT NULL DEFAULT 1,
    "composedFileKey" TEXT,
    "documentType" TEXT,
    "reference" TEXT,
    "notes" TEXT,
    "barcodeCode" TEXT NOT NULL,
    "addressOverride" JSONB,
    "status" "DispatchStatus" NOT NULL DEFAULT 'PENDING',
    "deliveryMethod" "DeliveryMethod",
    "errorMessage" TEXT,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "composedAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Dispatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DispatchInsert" (
    "id" TEXT NOT NULL,
    "dispatchId" TEXT NOT NULL,
    "insertId" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "source" TEXT NOT NULL DEFAULT 'manual',

    CONSTRAINT "DispatchInsert_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DigitalSend" (
    "id" TEXT NOT NULL,
    "dispatchId" TEXT NOT NULL,
    "toEmail" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "trackingToken" TEXT NOT NULL,
    "emailSent" BOOLEAN NOT NULL DEFAULT false,
    "emailSentAt" TIMESTAMP(3),
    "firstOpenedAt" TIMESTAMP(3),
    "lastOpenedAt" TIMESTAMP(3),
    "openCount" INTEGER NOT NULL DEFAULT 0,
    "firstDownloadAt" TIMESTAMP(3),
    "downloadCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DigitalSend_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrintBatch" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "mergedFileKey" TEXT,
    "status" "BatchStatus" NOT NULL DEFAULT 'OPEN',
    "itemCount" INTEGER NOT NULL DEFAULT 0,
    "totalPages" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "printedAt" TIMESTAMP(3),
    "postedAt" TIMESTAMP(3),

    CONSTRAINT "PrintBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrintBatchItem" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "dispatchId" TEXT NOT NULL,
    "pageCount" INTEGER NOT NULL DEFAULT 1,
    "order" INTEGER NOT NULL DEFAULT 0,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PrintBatchItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReturnMail" (
    "id" TEXT NOT NULL,
    "dispatchId" TEXT NOT NULL,
    "scannedCode" TEXT NOT NULL,
    "returnReason" TEXT,
    "notes" TEXT,
    "scannedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "resolvedBy" TEXT,

    CONSTRAINT "ReturnMail_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Tenant_slug_key" ON "Tenant"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "Recipient_tenantId_idx" ON "Recipient"("tenantId");

-- CreateIndex
CREATE INDEX "Recipient_tenantId_accountNumber_idx" ON "Recipient"("tenantId", "accountNumber");

-- CreateIndex
CREATE INDEX "Recipient_tenantId_externalId_idx" ON "Recipient"("tenantId", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "Dispatch_barcodeCode_key" ON "Dispatch"("barcodeCode");

-- CreateIndex
CREATE INDEX "Dispatch_tenantId_status_idx" ON "Dispatch"("tenantId", "status");

-- CreateIndex
CREATE INDEX "Dispatch_barcodeCode_idx" ON "Dispatch"("barcodeCode");

-- CreateIndex
CREATE UNIQUE INDEX "DigitalSend_dispatchId_key" ON "DigitalSend"("dispatchId");

-- CreateIndex
CREATE UNIQUE INDEX "DigitalSend_trackingToken_key" ON "DigitalSend"("trackingToken");

-- CreateIndex
CREATE UNIQUE INDEX "PrintBatchItem_dispatchId_key" ON "PrintBatchItem"("dispatchId");

-- CreateIndex
CREATE UNIQUE INDEX "ReturnMail_dispatchId_key" ON "ReturnMail"("dispatchId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Recipient" ADD CONSTRAINT "Recipient_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Insert" ADD CONSTRAINT "Insert_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DispatchRule" ADD CONSTRAINT "DispatchRule_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DispatchRuleInsert" ADD CONSTRAINT "DispatchRuleInsert_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "DispatchRule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DispatchRuleInsert" ADD CONSTRAINT "DispatchRuleInsert_insertId_fkey" FOREIGN KEY ("insertId") REFERENCES "Insert"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Dispatch" ADD CONSTRAINT "Dispatch_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Dispatch" ADD CONSTRAINT "Dispatch_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "Recipient"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DispatchInsert" ADD CONSTRAINT "DispatchInsert_dispatchId_fkey" FOREIGN KEY ("dispatchId") REFERENCES "Dispatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DispatchInsert" ADD CONSTRAINT "DispatchInsert_insertId_fkey" FOREIGN KEY ("insertId") REFERENCES "Insert"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DigitalSend" ADD CONSTRAINT "DigitalSend_dispatchId_fkey" FOREIGN KEY ("dispatchId") REFERENCES "Dispatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrintBatch" ADD CONSTRAINT "PrintBatch_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrintBatchItem" ADD CONSTRAINT "PrintBatchItem_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "PrintBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrintBatchItem" ADD CONSTRAINT "PrintBatchItem_dispatchId_fkey" FOREIGN KEY ("dispatchId") REFERENCES "Dispatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReturnMail" ADD CONSTRAINT "ReturnMail_dispatchId_fkey" FOREIGN KEY ("dispatchId") REFERENCES "Dispatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
