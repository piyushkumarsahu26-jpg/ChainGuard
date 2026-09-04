-- Sprint Integration-1: Envelope <-> Transport integration.
-- Additive only -- one new enum, one new enum-typed column with a
-- default (every existing envelope becomes AT_REST, correctly), three
-- new AuditAction values. No existing column, table, or row is altered.

-- CreateEnum
CREATE TYPE "EnvelopeTransportStatus" AS ENUM ('AT_REST', 'IN_TRANSIT', 'DELIVERED');

-- AlterTable
ALTER TABLE "envelopes" ADD COLUMN "transportStatus" "EnvelopeTransportStatus" NOT NULL DEFAULT 'AT_REST';

-- AlterEnum (Postgres requires each ADD VALUE as its own statement, same
-- pattern already used in every prior AlertCategory/TransportStatus
-- migration in this project)
ALTER TYPE "AuditAction" ADD VALUE 'ENVELOPE_CREATED';
ALTER TYPE "AuditAction" ADD VALUE 'TRANSPORT_STARTED';
ALTER TYPE "AuditAction" ADD VALUE 'TRANSPORT_ENDED';
