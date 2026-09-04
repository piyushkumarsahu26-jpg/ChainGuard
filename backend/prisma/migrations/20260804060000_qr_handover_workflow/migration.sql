-- Sprint 7: Secure Chain of Custody & QR Workflow
-- Additive only: 5 new enum values, 5 new nullable/defaulted columns on
-- chain_of_custody. No existing table, column, or row is altered or
-- dropped. Part 1 (QR generation) and most of Part 3 (custody timeline)
-- already existed since Phase 1 — this migration only adds what those
-- earlier phases didn't need: the two-step handover workflow and richer
-- audit-trail fields.

-- AlterEnum
ALTER TYPE "CustodyEventType" ADD VALUE 'VERIFIED';
ALTER TYPE "CustodyEventType" ADD VALUE 'HANDOVER_ACCEPTED';
ALTER TYPE "CustodyEventType" ADD VALUE 'DAMAGED';
ALTER TYPE "CustodyEventType" ADD VALUE 'TAMPERED';
ALTER TYPE "CustodyEventType" ADD VALUE 'ARCHIVED';

-- AlterTable
ALTER TABLE "chain_of_custody" ADD COLUMN "toOfficerId" TEXT;
ALTER TABLE "chain_of_custody" ADD COLUMN "confirmed" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "chain_of_custody" ADD COLUMN "latitude" DOUBLE PRECISION;
ALTER TABLE "chain_of_custody" ADD COLUMN "longitude" DOUBLE PRECISION;
ALTER TABLE "chain_of_custody" ADD COLUMN "device" TEXT;

-- CreateIndex
CREATE INDEX "chain_of_custody_toOfficerId_idx" ON "chain_of_custody"("toOfficerId");

-- AddForeignKey
ALTER TABLE "chain_of_custody" ADD CONSTRAINT "chain_of_custody_toOfficerId_fkey" FOREIGN KEY ("toOfficerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
