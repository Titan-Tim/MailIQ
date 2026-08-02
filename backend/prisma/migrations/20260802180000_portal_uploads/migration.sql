-- Recipient portal uploads (digital closed loop)
CREATE TABLE "PortalUpload" (
  "id" TEXT NOT NULL,
  "dispatchId" TEXT NOT NULL,
  "fileKey" TEXT NOT NULL,
  "fileName" TEXT NOT NULL,
  "fileSizeBytes" INTEGER NOT NULL DEFAULT 0,
  "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PortalUpload_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "PortalUpload_dispatchId_idx" ON "PortalUpload"("dispatchId");
ALTER TABLE "PortalUpload" ADD CONSTRAINT "PortalUpload_dispatchId_fkey" FOREIGN KEY ("dispatchId") REFERENCES "Dispatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
