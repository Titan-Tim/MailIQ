-- Campaigns (outbound mailshots)
CREATE TYPE "CampaignStatus" AS ENUM ('DRAFT', 'SENDING', 'SENT');

CREATE TABLE "Campaign" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "baseFileKey" TEXT NOT NULL,
  "baseFileName" TEXT NOT NULL,
  "subject" TEXT,
  "addQr" BOOLEAN NOT NULL DEFAULT true,
  "status" "CampaignStatus" NOT NULL DEFAULT 'DRAFT',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Campaign_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Campaign_tenantId_idx" ON "Campaign"("tenantId");

ALTER TABLE "Dispatch" ADD COLUMN "campaignId" TEXT;
CREATE INDEX "Dispatch_campaignId_idx" ON "Dispatch"("campaignId");

ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Dispatch" ADD CONSTRAINT "Dispatch_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;
