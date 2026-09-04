-- Architectural Integration sprint: Examination Setup, batch QR
-- generation, and the pre-dispatch preparation lifecycle. Additive
-- only -- two new tables, one new enum, four new nullable/defaulted
-- columns on envelopes, seven new CustodyEventType values. No existing
-- table, column, or row is altered or removed.

-- CreateEnum
CREATE TYPE "EnvelopePrepStatus" AS ENUM ('QR_GENERATED', 'QR_PRINTED', 'QR_ATTACHED', 'PACKED', 'SEALED', 'READY_FOR_DISPATCH');

-- AlterEnum (each ADD VALUE its own statement, per this project's
-- established, already-proven pattern for every prior enum extension)
ALTER TYPE "CustodyEventType" ADD VALUE 'QR_PRINTED';
ALTER TYPE "CustodyEventType" ADD VALUE 'QR_ATTACHED';
ALTER TYPE "CustodyEventType" ADD VALUE 'PACKED';
ALTER TYPE "CustodyEventType" ADD VALUE 'SEALED';
ALTER TYPE "CustodyEventType" ADD VALUE 'CHECKPOINT';
ALTER TYPE "CustodyEventType" ADD VALUE 'AI_VERIFIED';
ALTER TYPE "CustodyEventType" ADD VALUE 'COMPLETED';

-- CreateTable
CREATE TABLE "examinations" (
    "id" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "district" TEXT,
    "centre" TEXT NOT NULL,
    "examName" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "examDate" TIMESTAMP(3) NOT NULL,
    "examTime" TEXT NOT NULL,
    "session" TEXT,
    "envelopeCount" INTEGER NOT NULL DEFAULT 0,
    "officerId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "examinations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "envelope_batches" (
    "id" TEXT NOT NULL,
    "examinationId" TEXT NOT NULL,
    "count" INTEGER NOT NULL,
    "generatedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "envelope_batches_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "envelopes"
  ADD COLUMN "prepStatus" "EnvelopePrepStatus" NOT NULL DEFAULT 'QR_GENERATED',
  ADD COLUMN "qrVerifiedAt" TIMESTAMP(3),
  ADD COLUMN "examinationId" TEXT,
  ADD COLUMN "batchId" TEXT;

-- CreateIndex
CREATE INDEX "examinations_centre_idx" ON "examinations"("centre");
CREATE INDEX "examinations_examDate_idx" ON "examinations"("examDate");
CREATE INDEX "envelope_batches_examinationId_idx" ON "envelope_batches"("examinationId");
CREATE INDEX "envelopes_prepStatus_idx" ON "envelopes"("prepStatus");
CREATE INDEX "envelopes_examinationId_idx" ON "envelopes"("examinationId");
CREATE INDEX "envelopes_batchId_idx" ON "envelopes"("batchId");

-- AddForeignKey
ALTER TABLE "examinations" ADD CONSTRAINT "examinations_officerId_fkey" FOREIGN KEY ("officerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "examinations" ADD CONSTRAINT "examinations_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "envelope_batches" ADD CONSTRAINT "envelope_batches_examinationId_fkey" FOREIGN KEY ("examinationId") REFERENCES "examinations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "envelope_batches" ADD CONSTRAINT "envelope_batches_generatedById_fkey" FOREIGN KEY ("generatedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "envelopes" ADD CONSTRAINT "envelopes_examinationId_fkey" FOREIGN KEY ("examinationId") REFERENCES "examinations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "envelopes" ADD CONSTRAINT "envelopes_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "envelope_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;
