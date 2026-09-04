# ChainGuard — Transport Module Hotfix: Demo-Ready Start Simulation

## Root cause

Two separate gates, both in `TransportMonitoring.jsx`, combined to make the page unusable on a fresh install:

1. **The whole simulator UI was hidden** behind `vehicles.length === 0 || envelopes.length === 0 ? <EmptyState .../> : <>...</>`. On a fresh install, both arrays are genuinely empty (see below for why) — so the user never even saw the Start button, only a "Nothing to track yet" message.
2. **Even past that gate, the button itself was disabled** by `!selectedEnvelopeId || !selectedVehicleId || !selectedRouteId` — populated only from whatever `GET /envelopes`, `GET /vehicles`, `GET /routes` returned, which on an empty database is nothing.

**Why the database is empty on a fresh install, specifically**: the demo vehicles and routes referenced in the Sprint 5/6 reports were inserted directly via raw SQL into this development sandbox's own Postgres instance while building those sprints — never into `prisma/seed.js`, and never part of the application's own runtime behavior. `npx prisma db push` creates the schema; it does not run seeds, and even if it did, seed.js doesn't create vehicles or routes. Every other page in this project either has real usage data by the time someone looks at it (users create envelopes as part of normal operation) or has its own admin-driven setup flow. Live GPS was the one page that silently assumed data would already exist, with no path for it to get there.

## What was changed — Transport module only, exactly as scoped

**Frontend only. Zero backend files touched** (confirmed directly — no file under `backend/` has a modification time newer than the prior sprint's own commit). No AI Scanner, Envelope Scanner, or Authentication file touched.

| File | Change |
|---|---|
| `frontend/src/pages/TransportMonitoring.jsx` | Removed both gates (see below); added `ensureDemoData()`; added Travelled Distance / ETA display |
| `frontend/src/services/envelopeService.js` | Added `create()` — a thin wrapper around the *existing, unmodified* `POST /envelopes` endpoint (Phase 1). Not new backend capability. |
| `frontend/src/services/gpsService.js` | Added `createRoute()` — same reasoning, wraps the *existing, unmodified* `POST /routes` endpoint (Sprint 6). `createVehicle()` already existed and needed no change. |

## How the fix works

1. **The page-level `EmptyState` gate is gone.** The full UI (map, selectors, Start button) now always renders once the initial data fetch completes, regardless of whether any envelopes/vehicles/routes exist yet.
2. **The Start button is enabled whenever the page isn't mid-load and no session is already active** — `disabled={loading || session?.status === 'ACTIVE'}`. It no longer cares whether the dropdowns have a selection.
3. **Empty dropdowns show a clear placeholder** ("Auto-create demo envelope on start", etc.) instead of rendering blank, so the officer running the demo understands what will happen.
4. **`ensureDemoData()`**, called at the start of `startSimulation()`, checks each of envelope/vehicle/route in turn and — only if genuinely missing — creates exactly one demo record via the corresponding *existing* endpoint:
   - Demo envelope: `exam: "Demo Board Examination", subject: "General Studies", center: "Demo Exam Centre"`.
   - Demo vehicle: `vehicleNumber: "DEMO-XXXX"` (randomized 4 digits, avoids collisions across repeated demo runs), `driverName: "Demo Driver"`.
   - Demo route: the same three checkpoints (Printing Press → District Treasury → Exam Centre, same coordinates, same 250m radius) as the "Direct" route this project's own development database has been using since Sprint 5/6 — so an auto-created route looks and behaves identically to the one used throughout prior verification.
   - **Demo officer is deliberately *not* a new account** — the currently logged-in user fills that role, exactly as it already did in every prior sprint's simulator (`officerId: user.id`). Creating a new user account would need Administrator-only endpoints for no benefit over the account already logged in.
5. Each created record immediately updates the relevant `useState` array and selection, so a *second* simulation run in the same session reuses what was just created rather than creating duplicates every time.
6. **All the required live-update behaviors were already implemented in Sprint 5/6** — coordinates, speed, geofence/deviation/delay alerts, Pause/Resume/Stop — and needed no change. Two were genuinely missing and are added now: **Travelled Distance** (summed from the location history via a small, display-only Haversine helper — deliberately not the backend's copy, since duplicating a UI-only figure is low-stakes in a way that duplicating real detection logic would not be) and **ETA** (derived from the assigned route's `estimatedDurationMinutes` and the session's `startTime`, re-deriving live as updates arrive).
7. **Existing validation is unchanged** — `gps.validator.js`, `envelope.validator.js`, and `transportRoute.validator.js` (all backend, all untouched) still reject malformed requests exactly as before. What changed is *when* the frontend supplies valid data (auto-created just-in-time, instead of requiring it to pre-exist), not *whether* it's validated.

## What happens if the logged-in demo user isn't an Administrator

`POST /vehicles` and `POST /routes` are Administrator-only (unchanged, existing RBAC — not touched here). `POST /envelopes` allows Administrator or Printing Officer. If auto-provisioning hits a 403 (a non-admin account with no pre-existing data), the error is caught and surfaced clearly: *"Auto-creating demo data needs Administrator (or Printing/Transport Officer) access. Log in as an administrator, or create an envelope/vehicle/route manually first."* — not a generic failure. The project's own seeded default account is an Administrator, so the documented fresh-install flow (log in, open Live GPS, click Start) works without needing to know this at all.

## Verification performed

- **Confirmed the actual root cause before writing any fix** — traced exactly why a fresh database has no vehicles/routes (raw SQL inserted only into this sandbox's own Postgres, never into any code path that runs on install), rather than assuming.
- **Confirmed file scope directly**: only 3 files touched, all frontend, none of them AI Scanner/Envelope Scanner/Authentication — checked by file modification time, not just by memory of what was edited.
- Syntax-checked all 3 modified files individually.
- **Full production frontend build: 2827 modules, zero errors** (same count as before — no new files, only edits to existing ones).
- **Full backend test suite re-run: 25/25 passing** — confirms the zero-backend-changes claim didn't silently break anything, and wasn't just true by omission.
- Traced through the new `ensureDemoData()` logic by hand against every existing backend validator/role requirement (`createEnvelopeValidator`, `createVehicleValidator`, `createRouteValidator`, and each endpoint's RBAC) to confirm the payloads sent would actually pass, rather than assuming the shapes matched.

**Not verified**: an actual live run of `npm install && npx prisma generate && npx prisma db push && npm run dev` followed by clicking through the UI, for the same disclosed reason as every backend feature since Phase 1 — this sandbox's network allowlist blocks `binaries.prisma.sh`, so `prisma generate` cannot complete here, and without a generated client the Express server cannot boot with a live database connection. Everything checkable without that live connection — the actual root cause, the code changes, their build correctness, and their consistency with existing (unmodified) backend validation — has been verified directly.

## Known limitations

- The auto-created demo vehicle number is randomized per run to avoid unique-constraint collisions if a user runs multiple demo sessions — this means repeated "fresh" demos accumulate multiple `DEMO-XXXX` vehicles in the database over time rather than reusing exactly one. Harmless for a demo environment, worth a cleanup/reset script if this becomes a long-running shared demo instance.
- If the logged-in account has neither Administrator nor Printing/Transport Officer roles, auto-provisioning cannot succeed (by design — this fix does not and should not bypass existing RBAC). The error message says so clearly instead of failing silently.
- Travelled distance is a straight-line (Haversine) sum between recorded points, not a road-network distance — the same simplification every part of this project's GPS math has used since Sprint 5, not a new limitation introduced here.
