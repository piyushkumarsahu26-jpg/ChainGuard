-- QR Verification & Digital Authentication sprint. Additive only --
-- one nullable column, five new enum values. No existing table,
-- column, or row is altered.

-- AlterTable
ALTER TABLE "chain_of_custody" ADD COLUMN "ipAddress" TEXT;

-- AlterEnum
ALTER TYPE "AlertCategory" ADD VALUE 'UNKNOWN_ENVELOPE';
ALTER TYPE "AlertCategory" ADD VALUE 'SIGNATURE_FAILURE';
ALTER TYPE "AlertCategory" ADD VALUE 'DUPLICATE_SCAN';
ALTER TYPE "AlertCategory" ADD VALUE 'EXPIRED_QR';
ALTER TYPE "AlertCategory" ADD VALUE 'INVALID_QR';
