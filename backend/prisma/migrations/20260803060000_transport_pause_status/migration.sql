-- Sprint 5 extension: GPS Tracking & Live Transport Monitoring
-- Purely additive — one new enum value. No existing table/column altered.

ALTER TYPE "TransportStatus" ADD VALUE 'PAUSED';
