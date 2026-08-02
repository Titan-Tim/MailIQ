-- Closed-loop returns: mark a dispatch when its QR is scanned back in (or uploaded via portal)
ALTER TABLE "Dispatch" ADD COLUMN "returnedAt" TIMESTAMP(3);
ALTER TABLE "Dispatch" ADD COLUMN "returnedVia" TEXT;
