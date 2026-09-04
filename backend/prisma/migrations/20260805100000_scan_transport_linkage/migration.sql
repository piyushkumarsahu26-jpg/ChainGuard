-- Integration Sprint 3: link scan-time Detection/Evidence records to the
-- real transport session and location they occurred under. Additive
-- only -- every new column is nullable, no existing table/row altered.

-- AlterTable
ALTER TABLE "detections" ADD COLUMN "transportSessionId" TEXT;
ALTER TABLE "detections" ADD COLUMN "latitude" DOUBLE PRECISION;
ALTER TABLE "detections" ADD COLUMN "longitude" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "evidence" ADD COLUMN "transportSessionId" TEXT;

-- CreateIndex
CREATE INDEX "detections_transportSessionId_idx" ON "detections"("transportSessionId");

-- AddForeignKey
ALTER TABLE "detections" ADD CONSTRAINT "detections_transportSessionId_fkey" FOREIGN KEY ("transportSessionId") REFERENCES "transport_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_transportSessionId_fkey" FOREIGN KEY ("transportSessionId") REFERENCES "transport_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
