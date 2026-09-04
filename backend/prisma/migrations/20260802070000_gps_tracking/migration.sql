-- Sprint 5: Live GPS Tracking
-- Purely additive — four new tables, two new enums. No existing table,
-- column, or enum value is altered or removed.

-- CreateEnum
CREATE TYPE "VehicleStatus" AS ENUM ('AVAILABLE', 'IN_TRANSIT', 'OFFLINE', 'MAINTENANCE');

-- CreateEnum
CREATE TYPE "TransportStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'CANCELLED');

-- CreateTable
CREATE TABLE "vehicles" (
    "id" TEXT NOT NULL,
    "vehicleNumber" TEXT NOT NULL,
    "driverName" TEXT NOT NULL,
    "status" "VehicleStatus" NOT NULL DEFAULT 'AVAILABLE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vehicles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transport_sessions" (
    "id" TEXT NOT NULL,
    "envelopeId" TEXT NOT NULL,
    "officerId" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "startTime" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endTime" TIMESTAMP(3),
    "status" "TransportStatus" NOT NULL DEFAULT 'ACTIVE',

    CONSTRAINT "transport_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gps_locations" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "speed" DOUBLE PRECISION,
    "accuracy" DOUBLE PRECISION,
    "heading" DOUBLE PRECISION,
    "batteryLevel" INTEGER,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gps_locations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transport_checkpoints" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "checkpointName" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "reachedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "transport_checkpoints_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "vehicles_vehicleNumber_key" ON "vehicles"("vehicleNumber");
CREATE INDEX "vehicles_status_idx" ON "vehicles"("status");

-- CreateIndex
CREATE INDEX "transport_sessions_envelopeId_idx" ON "transport_sessions"("envelopeId");
CREATE INDEX "transport_sessions_officerId_idx" ON "transport_sessions"("officerId");
CREATE INDEX "transport_sessions_vehicleId_idx" ON "transport_sessions"("vehicleId");
CREATE INDEX "transport_sessions_status_idx" ON "transport_sessions"("status");

-- CreateIndex
CREATE INDEX "gps_locations_sessionId_idx" ON "gps_locations"("sessionId");
CREATE INDEX "gps_locations_sessionId_timestamp_idx" ON "gps_locations"("sessionId", "timestamp");

-- CreateIndex
CREATE INDEX "transport_checkpoints_sessionId_idx" ON "transport_checkpoints"("sessionId");

-- AddForeignKey
ALTER TABLE "transport_sessions" ADD CONSTRAINT "transport_sessions_envelopeId_fkey" FOREIGN KEY ("envelopeId") REFERENCES "envelopes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "transport_sessions" ADD CONSTRAINT "transport_sessions_officerId_fkey" FOREIGN KEY ("officerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "transport_sessions" ADD CONSTRAINT "transport_sessions_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "vehicles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gps_locations" ADD CONSTRAINT "gps_locations_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "transport_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transport_checkpoints" ADD CONSTRAINT "transport_checkpoints_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "transport_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
