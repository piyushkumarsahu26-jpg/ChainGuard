# ChainGuard — Critical Bug Fix Report
## Live GPS Simulation Breaking on Page Navigation

## Root cause

Confirmed by direct investigation, not assumed: **the backend simulation was already correctly independent of the React page lifecycle** (Integration Sprint 2 built this specifically — a plain `setInterval` inside `gps.service.js`, keyed by session ID, with no dependency on any HTTP request, response, or WebSocket connection). Re-verified this directly in `runSimulationTick()`: it reads the session from the database and calls `updateLocation()`/`stopTransport()` internally — nothing in that path touches a frontend connection. This part of the architecture was not broken and needed no change.

**The actual bug was entirely on the frontend**: `TransportMonitoring.jsx` had no way to discover, on mount, that a session was already running. Its mount effect auto-selected `envelopes[0]`/`vehicles[0]`/`routes[0]` as fresh defaults every time the component mounted — including on a return visit. After navigating away and back, `vehicles[0]` is very often the exact vehicle the still-running backend simulation has already marked `IN_TRANSIT`. Clicking "Start Simulation" then called `POST /gps/start` for that vehicle and hit the pre-existing, correct backend guard in `gps.service.js`'s `startTransport()` — `"Vehicle is already on an active transport session"` — a safeguard doing exactly its job, with nothing on the frontend checking first. The error message in the bug report matches this exactly.

## Fix

Added a real reconnection flow to `TransportMonitoring.jsx`, built entirely from two endpoints that already existed and needed no changes:

- **`GET /gps/live`** (already used by Live Monitoring and Security Command Center) — checked once on mount to discover whether any session is already `ACTIVE`/`PAUSED`.
- **`GET /gps/history/:sessionId`** (already existed since Sprint 5/6) — used to pull everything needed to fully restore the page's view of that session: the complete location history (map position + travelled route + latest point for battery/speed), the checkpoints already reached, and the session's own real status.

If a session is found, the mount effect calls the new `reconnectToSession()` helper instead of auto-selecting fresh defaults — restoring the map, route, checkpoints, and simulation state (`ACTIVE`/`PAUSED` mapped directly to this page's `simulating`/`paused` flags) before the user sees anything. If none is found, the page behaves exactly as before.

**A second, independent safeguard was added at the button level**, not just on mount: `startSimulation()` now re-checks `GET /gps/live` for the currently selected vehicle immediately before ever calling `startTransport()`, and reconnects instead if one is already running. This covers the case the mount-time check alone can't — a session started in another tab or by another operator in the time between this page loading and the button being clicked. The button itself now reads "Resume Active Session" instead of "Start Simulation" whenever the selected vehicle's own status is already `IN_TRANSIT`, so the label reflects reality before the click, not just after a rejected request.

## Requirement-by-requirement

| # | Requirement | Status |
|---|---|---|
| 1 | One backend `TransportSession` per simulation start | Already true (existing `startTransport()` behavior, unchanged) |
| 2 | Backend continues generating updates while the page is unmounted | Already true (Integration Sprint 2's architecture) — re-verified directly in this investigation, not re-assumed |
| 3 | Navigating between pages never stops/resets the simulation | Confirmed: no cleanup function anywhere in this file calls `stopTransport`/`pauseTransport`; the only `useEffect` cleanups unsubscribe socket *listeners*, which is correct and unrelated to the backend session's own state |
| 4 | Page remount reconnects to the existing session instead of creating a new one | **Fixed** — the mount-effect check described above |
| 5 | "Start Simulation" becomes "Resume Active Session" when one exists | **Fixed** — button label now reflects `selectedVehicle.status === 'IN_TRANSIT'` |
| 6 | Never create duplicate `ACTIVE` sessions | Now guarded three ways: the pre-existing backend check (unchanged), the new mount-time reconnect (avoids ever reaching the button), and the new button-level re-check (covers the race the mount check can't) |
| 7 | Restore map position, travelled route, checkpoints, battery, vehicle status, simulation state on reconnect | **Fixed** — see `reconnectToSession()`; battery comes from the latest restored location's own `batteryLevel` field, already part of the existing `GPSLocation` model |
| 8 | Simulation stops only on Stop/complete/cancel/backend shutdown | Already true (Integration Sprint 2) — re-verified against the current code, including confirming Integration Sprint 4's later change to `raiseAlert()`'s signature didn't touch this separate mechanism |
| 9 | Unmounting never stops the backend | Confirmed by absence — no code path does this, checked directly rather than inferred |
| 10 | Verify by repeated navigation | See Verification below for what this sandbox could and couldn't do |

## Files modified

- `frontend/src/pages/TransportMonitoring.jsx` — new `reconnectToSession()` helper; mount effect now checks `GET /gps/live` before falling back to fresh defaults; `startSimulation()` gained a defensive re-check; the button label is now state-aware; one new icon import (`RefreshCw`).

No backend file was changed. No new endpoint was created. Both endpoints this fix relies on already existed before this bug was reported.

## Verification performed

- **Traced `runSimulationTick()` and `activeSimulations` directly** to reconfirm the backend mechanism has zero dependency on any frontend connection — not re-assumed from the Integration Sprint 2 report, re-read against the current file.
- **Confirmed Integration Sprint 4's later change to `raiseAlert()`'s signature (`session` instead of `envelopeId`) is a separate code path** from `runSimulationTick()`/`startAutoSimulation()`/`stopAutoSimulation()` and did not affect this mechanism.
- **Grepped every `stopTransport`/`pauseTransport` call site in the frontend** — confirmed both are only ever called from their respective explicit button handlers, never from a `useEffect` cleanup.
- **Confirmed both `useEffect` cleanup functions in this file** — one is a plain loading-guard flag, the other unsubscribes socket listeners only. Neither touches the backend session.
- **Verified the exact response shapes** of `GET /gps/live` and `GET /gps/history/:sessionId` against their real repository implementations (`listActive()`'s `include: withContext`, `TransportCheckpoint.checkpointName`) before writing the restore logic, rather than assuming a shape.
- Ran the same `no-undef` lint sweep (proven, in the prior regression fix, to actually catch this class of bug) immediately after each substantial edit to this file, not just once at the end — clean throughout.
- Full production build: clean, zero errors, same module count (an edit to an existing file, not a new one).

**What could not be verified in this environment**: an actual live click-through — starting a simulation, navigating to Dashboard, Live Monitoring, and Analytics, and back to Live GPS, repeatedly, in a running browser. The same disclosed sandbox restriction as every other verification in this project (`prisma generate` blocked, no way to boot the real backend against a live database) applies here too, independent of this specific fix. What's been done instead is the strongest verification available without that: tracing every code path this fix and its surrounding architecture touch, confirming each endpoint's real response shape before relying on it, and confirming by absence that nothing stops the backend session on unmount.

## Known limitations

- **`vehicleOnline`, `deviating`, and `deviationInfo` cannot be restored from persisted data** — they're real-time alert conditions, not fields stored on `TransportSession`. On reconnect, they default to their "normal" values (online, not deviating) and will self-correct within seconds from the very next real `gps:update`/`route:deviation` event, the same socket listeners this page already had. This is a deliberate, honest choice over fabricating a guess for something this page genuinely cannot know until a fresh event arrives.
- **The reconnected event log starts fresh** (a "Reconnected to active session" entry plus one entry per checkpoint already reached, using real timestamps) rather than replaying every historical event (e.g. past deviation or battery-low alerts). Those real alerts still exist and are visible in Alert Center regardless; this page's own friendly log is a live feed, not a persisted audit trail, and reconstructing it fully would mean querying and correctly attributing past `Alert` rows to this specific session — `Alert` has no `transportSessionId` field to do that precisely (only `Detection`/`Evidence` gained that in Integration Sprint 3), and guessing via envelope + time-range risks pulling in unrelated alerts. Scoped out rather than done imprecisely.
- **If more than one session is somehow `ACTIVE`/`PAUSED` system-wide at once** (not a normal flow, but the schema doesn't strictly prevent it if triggered through unusual API sequencing), the mount-time reconnect picks the most recently started one (`GET /gps/live`'s own existing ordering). A single-operator demo page reconnecting to "the" active session was the design assumption throughout — a genuine multi-simultaneous-transport UI is a larger feature this bug fix does not attempt.
