-- SMS delivery channel + recipient phone
ALTER TYPE "DeliveryMethod" ADD VALUE IF NOT EXISTS 'SMS';
ALTER TABLE "Recipient" ADD COLUMN "phone" TEXT;

-- Compose-a-letter (field-merge) campaigns: base file now optional; add template fields
ALTER TABLE "Campaign" ALTER COLUMN "baseFileKey" DROP NOT NULL;
ALTER TABLE "Campaign" ALTER COLUMN "baseFileName" DROP NOT NULL;
ALTER TABLE "Campaign" ADD COLUMN "bodyTemplate" TEXT;
ALTER TABLE "Campaign" ADD COLUMN "heading" TEXT;
ALTER TABLE "Campaign" ADD COLUMN "signOff" TEXT;
