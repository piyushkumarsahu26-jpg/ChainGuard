-- Sprint 6: Geofencing, Route Deviation & Smart Transport Alerts
-- Additive only: one new enum + one nullable column on Alert, one
-- nullable column + FK on transport_sessions, three new tables. No
-- existing column, table, or constraint is altered or dropped.

-- CreateEnum
CREATE TYPE "AlertCategory" AS ENUM ('ROUTE_DEVIATION', 'VEHICLE_STOPPED', 'LATE_ARRIVAL', 'GPS_SIGNAL_LOST', 'BATTERY_LOW', 'CHECKPOINT_MISSED');

-- CreateEnum
CREATE TYPE "GeofenceEventType" AS ENUM ('ENTERED', 'EXITED');

-- AlterTable: Alert gains an optional category
ALTER TABLE "alerts" ADD COLUMN "category" "AlertCategory";

-- CreateTable: transport_routes
CREATE TABLE "transport_routes" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "estimatedDurationMinutes" INTEGER NOT NULL DEFAULT 45,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "transport_routes_pkey" PRIMARY KEY ("id")
);

-- CreateTable: route_checkpoints
CREATE TABLE "route_checkpoints" (
    "id" TEXT NOT NULL,
    "routeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "sequence" INTEGER NOT NULL,
    "radiusMeters" INTEGER NOT NULL DEFAULT 250,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "route_checkpoints_pkey" PRIMARY KEY ("id")
);

-- CreateTable: geofence_events
CREATE TABLE "geofence_events" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "checkpointName" TEXT NOT NULL,
    "eventType" "GeofenceEventType" NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "geofence_events_pkey" PRIMARY KEY ("id")
);

-- AlterTable: transport_sessions gains an optional routeId
ALTER TABLE "transport_sessions" ADD COLUMN "routeId" TEXT;

-- CreateIndex
CREATE INDEX "route_checkpoints_routeId_idx" ON "route_checkpoints"("routeId");

-- CreateIndex
CREATE INDEX "geofence_events_sessionId_idx" ON "geofence_events"("sessionId");

-- CreateIndex
CREATE INDEX "transport_sessions_routeId_idx" ON "transport_sessions"("routeId");

-- AddForeignKey
ALTER TABLE "route_checkpoints" ADD CONSTRAINT "route_checkpoints_routeId_fkey" FOREIGN KEY ("routeId") REFERENCES "transport_routes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "geofence_events" ADD CONSTRAINT "geofence_events_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "transport_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transport_sessions" ADD CONSTRAINT "transport_sessions_routeId_fkey" FOREIGN KEY ("routeId") REFERENCES "transport_routes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
