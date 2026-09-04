-- Sprint AI-4B: AI <-> Backend Integration
-- Additive + one relaxation (cameraId NOT NULL -> nullable). No data loss:
-- every existing detections row already has a real cameraId, so relaxing
-- the constraint doesn't invalidate anything already stored.

-- AlterTable: cameraId becomes optional (manual envelope scans have no camera)
ALTER TABLE "detections" ALTER COLUMN "cameraId" DROP NOT NULL;

-- AlterTable: add envelopeId (Phase 3A design document, Step 4.8)
ALTER TABLE "detections" ADD COLUMN "envelopeId" TEXT;

-- CreateIndex
CREATE INDEX "detections_envelopeId_idx" ON "detections"("envelopeId");

-- AddForeignKey
ALTER TABLE "detections" ADD CONSTRAINT "detections_envelopeId_fkey" FOREIGN KEY ("envelopeId") REFERENCES "envelopes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
