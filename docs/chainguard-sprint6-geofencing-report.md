# ChainGuard — Sprint 6 Implementation Report
## Geofencing, Route Deviation & Smart Transport Alerts

## 1. Architecture decisions

**No duplicate "Transport Alert" table.** The objective's DATABASE section lists "Transport Alerts" among the new models to create. Rather than build a second, parallel alert store, the existing `Alert` model (used since Phase 1 for AI tamper alerts, extended in Sprint 5 for GPS alerts) gained one new nullable field: `category` (`AlertCategory` enum — `ROUTE_DEVIATION`, `VEHICLE_STOPPED`, `LATE_ARRIVAL`, `GPS_SIGNAL_LOST`, `BATTERY_LOW`, `CHECKPOINT_MISSED`). This is what "reuse existing architecture, no duplicate logic" means concretely here: every existing alert consumer (`AlertCenter.jsx`, the dashboard's `tamperAlerts` count, Sprint 5's own `liveAlerts` count) keeps working against one table, unchanged, and Sprint 6's alerts are simply better-categorized rows in it, not a second system to keep in sync.

**Routes are real, DB-backed, and formally distinct from Sprint 5's `KNOWN_CHECKPOINTS`.** `TransportRoute` + `RouteCheckpoint` (ordered, each with its own configurable geofence radius) satisfy "Store routes in PostgreSQL" directly. `TransportSession.routeId` (nullable) is how a session gets an "expected route" to compare against — nullable so a Sprint-5-style routeless session still works exactly as before, deviation/delay detection simply doesn't run for it.

**Geofence events are separate from "checkpoint reached."** Sprint 5's `TransportCheckpoint` records a checkpoint being reached once per session (first arrival). Sprint 6's new `GeofenceEvent` model records every entry *and* exit, for every checkpoint on the route — a vehicle passing through a geofence without stopping, or re-entering the same one, is real signal for the "Entered Geofence"/"Exited Geofence" timeline events that `TransportCheckpoint` alone can't represent.

**Route deviation uses point-to-line-segment distance, not point-to-point.** A route is a path, not a set of isolated locations — comparing the vehicle's position only to the nearest single checkpoint would flag "deviation" for a vehicle correctly driving *between* two checkpoints, far from either one specifically. `distanceToRouteMeters()` (new, in `utils/geo.util.js`) computes the true minimum distance to the whole route (every consecutive checkpoint-to-checkpoint segment), reusing the same zero-dependency, independently-tested module Sprint 5 already established for `haversineMeters` — not a new geometry system.

**Delay detection lives in the existing periodic watcher, not in `updateLocation()`.** Like GPS-signal-loss (Sprint 5), "the expected arrival time has passed" is defined by the passage of time, not by anything that happens on a specific GPS update — a vehicle could be sending perfectly healthy updates and still be running late. It belongs in `startStaleSessionWatcher()` alongside the signal-loss/unexpected-end checks it already runs, not duplicated as a separate timer.

**A route's own `estimatedDurationMinutes` is what "expected arrival" means**, not a fixed system-wide constant — a longer route (Via Ring Road, 60 min) and a shorter one (Express, 30 min) reasonably have different expectations, and this is a property of the route, shared correctly across every session that uses it.

## 2. Files modified

- `backend/prisma/schema.prisma` — `AlertCategory` enum + `Alert.category`; `TransportRoute`, `RouteCheckpoint`, `GeofenceEvent` models; `TransportSession.routeId`.
- `backend/src/utils/geo.util.js` — added `pointToSegmentDistanceMeters`, `distanceToRouteMeters`.
- `backend/src/services/gps.service.js` — route-aware checkpoint detection (falls back to `KNOWN_CHECKPOINTS` for routeless sessions), checkpoint-missed detection, geofence enter/exit tracking, route deviation detection, delay detection in the watcher, `category` added to every existing alert, `getDashboardStats()` extended with `vehiclesDelayed`/`vehiclesOffRoute`, `startTransport()` accepts optional `routeId`.
- `backend/src/services/dashboard.service.js` — no functional change this sprint (Sprint 5 already wired in `gpsService.getDashboardStats()`; the two new fields flow through automatically since that method's return object grew, not the call site).
- `backend/src/repositories/transportSession.repository.js` — `withContext` include gained `route: {checkpoints}`; new `listByEnvelope` unaffected.
- `backend/src/validators/gps.validator.js` — `startTransportValidator` gained optional `routeId`.
- `backend/src/routes/index.js` — mounted the new `/routes` resource.
- `backend/tests/geo.util.test.js` — 6 new tests for the point-to-segment/route-distance functions.
- `frontend/src/services/gpsService.js` — `startTransport` passes `routeId`; new `listRoutes()`.
- `frontend/src/pages/TransportMonitoring.jsx` — routes now fetched from the real API (Sprint 5's hardcoded `PREDEFINED_ROUTES` removed); five simulation scenarios; new socket listeners feeding a live event log; map gained checkpoint-radius circles, an expected-route line, and a deviation highlight; Distance/Time Off Route added to the status card.
- `frontend/src/pages/Dashboard.jsx` — two new widgets (Vehicles Delayed, Vehicles Off Route), added to the existing Sprint 5 widget row — original 5 cards untouched.

## 3. Files created

- `backend/prisma/migrations/20260803090000_geofencing_route_deviation/migration.sql`
- `backend/src/repositories/transportRoute.repository.js`, `geofenceEvent.repository.js`
- `backend/src/controllers/transportRoute.controller.js`
- `backend/src/validators/transportRoute.validator.js`
- `backend/src/routes/transportRoute.routes.js`
- This report.

## 4. Database changes

| Change | Detail |
|---|---|
| `AlertCategory` enum | `ROUTE_DEVIATION, VEHICLE_STOPPED, LATE_ARRIVAL, GPS_SIGNAL_LOST, BATTERY_LOW, CHECKPOINT_MISSED` |
| `Alert.category` | Nullable — every pre-Sprint-6 alert has none, correctly |
| `TransportRoute` | `id, name, description?, estimatedDurationMinutes (default 45), createdAt` |
| `RouteCheckpoint` | `id, routeId, name, latitude, longitude, sequence, radiusMeters (default 250), createdAt` |
| `GeofenceEvent` | `id, sessionId, checkpointName, eventType (ENTERED\|EXITED), latitude, longitude, timestamp` |
| `TransportSession.routeId` | Nullable FK to `TransportRoute`, `ON DELETE SET NULL` |

Applied to and verified against the live Postgres instance (`\d alerts`, `\d transport_sessions` both confirmed). Seed data: 3 real routes (Direct/Via Ring Road/Express) with their full checkpoint lists, matching Sprint 5's original hardcoded route definitions exactly, so the simulator offers identical choices with a real data source underneath.

## 5. API changes

New resource, `/api/v1/routes`:

| Method | Path | Roles | Description |
|---|---|---|---|
| GET | `/routes` | any authenticated | List every route with its ordered checkpoints |
| GET | `/routes/:id` | any authenticated | Get one |
| POST | `/routes` | Administrator | Create a route + its checkpoints in one call |

Extended, not replaced: `POST /gps/start` now accepts an optional `routeId` (backward compatible — omitting it behaves exactly as Sprint 5).

## 6. Socket events

New: `checkpoint:reached` (`{sessionId, checkpoint}` — supplements, doesn't replace, `gps:update`'s existing `checkpointReached` field), `route:deviation` (`{sessionId, status: 'STARTED'|'ENDED', currentPosition, distanceOffRouteMeters, timeOffRouteSeconds?}`), `transport:delay` (`{sessionId, expectedArrival, currentTime, delayMinutes}`). All five Sprint 5 events unchanged.

## 7. Testing performed

- **6 new real unit tests** for `pointToSegmentDistanceMeters`/`distanceToRouteMeters` — exact midpoint → 0, both endpoints → 0, clamping-beyond-segment behavior, perpendicular-offset ordering, multi-segment minimum, empty-route edge case. One test's own tolerance was wrong (not the code): a ~13km test case showed a ~0.10% discrepancy against true haversine, which is exactly what the function's own docstring documents as expected for its local equirectangular approximation at that range — verified the percentage independently before loosening the test's tolerance, rather than assuming the code was broken.
- **Migration applied to and verified against the real, live Postgres instance.**
- **Full import-graph check on every new/modified file, including `server.js`/`app.js`.**
- **A genuine `node src/server.js` boot attempt**, confirmed to fail with the same known, already-documented Prisma-generate error (this sandbox's long-standing network restriction) — not a new failure introduced by this sprint's changes.
- **Full backend test suite: 25/25 passing** (19 pre-Sprint-6 + 6 new).
- **Real production frontend build: 2827 modules, zero errors** (same count as before — this sprint edited existing files, added no new frontend files).

## 8. Known limitations

- **Live end-to-end behavior (simulator → geofence/deviation/delay detection → socket → map) is unverified against a running server**, for the same disclosed reason as every backend feature since Phase 1 (Prisma's engine binary blocked in this sandbox). The detection logic was reviewed carefully and tested in isolation (the geometry it depends on), but a real, watched-live demo run is the one thing this sandbox cannot do.
- **"Deviation Area" on the map is a simplified approximation** — a highlighted circle around the vehicle's *current* position while deviating, not a precise buffered corridor along the whole expected route (which would need a geometry library like turf.js this project doesn't otherwise use, for a purely visual nicety).
- **`VEHICLE_STOP`'s scenario genuinely takes the real 5-minute `STOPPED_ALERT_MINUTES` threshold to trigger its alert** — deliberately not shortened for the demo, since doing so would misrepresent the system's actual configured behavior. A full run of this specific scenario is a multi-minute wait, by design.
- **`ROUTE_CORRIDOR_METERS_DISPLAY` on the frontend is a manually-maintained mirror of the backend's actual threshold** — there's no endpoint exposing backend alert-threshold constants, so if that backend value is ever tuned, this frontend constant needs a matching manual update.
- **Checkpoint-missed detection only runs for route-assigned sessions** — sequence numbers, which the check depends on, are only formally defined on `RouteCheckpoint`, not on the `KNOWN_CHECKPOINTS` fallback used by routeless sessions.

Waiting for approval before Sprint 7, per your instruction.
