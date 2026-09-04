-- Architectural Integration sprint refinement: print metadata, kept
-- separate from ChainOfCustody per the user's explicit instruction.
-- Additive only -- three new columns, all with safe defaults/nullable.
ALTER TABLE "envelope_batches"
  ADD COLUMN "printCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "firstPrintedAt" TIMESTAMP(3),
  ADD COLUMN "lastPrintedAt" TIMESTAMP(3);
