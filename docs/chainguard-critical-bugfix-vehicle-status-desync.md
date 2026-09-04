# ChainGuard — Critical Bug Fix Report
## "Vehicle already on an active transport session" With No Active Sessions in the Database

## Root cause

Confirmed by tracing every write to `Vehicle.status` in `gps.service.js` directly, not assumed: **the system was never actually checking whether an active `TransportSession` exists.** Both the backend's duplicate-prevention check and my own previous frontend fix's "Resume Active Session" button were checking `Vehicle.status === 'IN_TRANSIT'` — a field that is only ever a *derived*, separately-maintained copy of "is this vehicle currently on a transport," kept in sync by two scattered write operations (`stopTransport()`, and the stale-session watcher's auto-cancellation branch) rather than by querying the real source of truth. This is exactly what you asked me to check for, and it's exactly what was wrong.

**How the field actually goes stale**: both of those write locations performed the session's status update and the vehicle's status reset as two *separate*, unwrapped database calls:

```js
await transportSessionRepository.update(sessionId, { status: 'COMPLETED', endTime: new Date() });
await vehicleRepository.update(session.vehicleId, { status: 'AVAILABLE' });
```

If anything caused the second call to fail or never run after the first had already committed — a transient database error, or the process exiting between the two calls — the session would be left `COMPLETED` (correctly, matching what you found in the database) while the vehicle stayed `IN_TRANSIT` forever, with no session left anywhere to explain why. There was no atomicity guarantee between these two related writes, and no mechanism to ever notice or correct the resulting inconsistency. This fully explains the exact symptom reported: a clean `TransportSession` table (only `COMPLETED`/`CANCELLED` rows) alongside a vehicle permanently stuck reporting `IN_TRANSIT`.

## Fix — addressing the cause, not the symptom

**1. The duplicate-prevention check now queries the real source of truth.** `startTransport()` no longer trusts `Vehicle.status` for this decision at all. It now calls a new, targeted repository query — `transportSessionRepository.findActiveForVehicle(vehicleId)` — which asks the one question that actually matters: is there a real `TransportSession` row with status `ACTIVE`/`PAUSED` referencing this vehicle, right now? If `Vehicle.status` and the real session state ever disagree again in the future (for any reason), this check can no longer be fooled by it.

**2. Self-healing, not silent tolerance.** If `startTransport()` finds `Vehicle.status === 'IN_TRANSIT'` but no real active session backs that claim, it now actively corrects the vehicle back to `AVAILABLE` (logged as a warning) before proceeding — fixing the bad data in place rather than just working around it while leaving every other reader of that field (a vehicle list, a dashboard count) still seeing wrong information.

**3. The actual write-side bug is fixed, so this can't recur.** Both places that transition a session to a terminal status now wrap the session-status write and the vehicle-status write in a real Prisma transaction (`prisma.$transaction(async (tx) => {...})`), reusing the exact same `transportSessionRepository.update()`/`vehicleRepository.update()` functions every other call site already uses — both repositories gained a small, optional, backward-compatible `client` parameter for this, rather than a second, parallel way of writing these fields. The two writes now either both succeed or both fail together; there is no window where one can commit without the other.

**4. A related robustness gap found during this investigation, fixed alongside it.** The stale-session watcher processes every active session in a single loop wrapped in one outer `try/catch` — meaning an exception while processing *one* session (including, previously, a failed vehicle-status write) would silently skip every *other* active session's deviation/delay/signal checks for that entire tick. Each session's processing is now isolated in its own `try/catch`, so one session's failure can no longer suppress monitoring for every other session running at the same time. This is the same category of fragility that caused the reported bug, just in a different location — addressed for the same reason, not left as a second, related bug for later.

**5. The frontend had a matching, independent version of the same mistake.** My prior fix's "Resume Active Session" button label checked `selectedVehicle?.status === 'IN_TRANSIT'` — the same stale field, checked completely independently of the mount-time reconnect logic (which already correctly checks real session data via `GET /gps/live`). This is why the button showed "Resume Active Session" even though the mount-time check had already correctly found nothing to reconnect to. Replaced with `activeVehicleIds`, a real set of vehicle IDs derived from actual session data (the same `GET /gps/live` response, kept fresh via `transport:start`/`transport:end` socket events — including a new listener for sessions started elsewhere, e.g. another browser tab, so this stays correct without requiring a page reload). The button-blocking logic in `startSimulation()` itself was already correct from the previous fix (it independently re-checks `GET /gps/live` before ever calling `startTransport()`) — only the *label* had this bug, now fixed to use the same real data.

## Files modified

| File | Change |
|---|---|
| `backend/src/repositories/transportSession.repository.js` | New `findActiveForVehicle(vehicleId)` query; `update()` gained an optional `client` param for transaction support |
| `backend/src/repositories/vehicle.repository.js` | `update()` gained the same optional `client` param |
| `backend/src/services/gps.service.js` | `startTransport()`'s duplicate check rewritten to query real session state + self-heal stale data; `stopTransport()` and the watcher's cancellation branch now wrap the session+vehicle writes in a real transaction; the watcher's per-session loop now isolates errors per session |
| `frontend/src/pages/TransportMonitoring.jsx` | New `activeVehicleIds` state, populated from real session data and kept fresh via socket events (including a new `transport:start` listener); button label now uses it instead of the stale `Vehicle.status` field |

No new backend endpoint was created. `findActiveForVehicle` is a repository-layer addition, not a new API surface.

## Verification performed

- **Traced every write to `Vehicle.status` in the codebase directly** (`grep` across the whole service file, not a partial read) — confirmed exactly two write sites, both now fixed, and confirmed no other code path sets a `TransportSession` to a terminal status without going through one of them.
- **Confirmed the exact partial-write vulnerability by reading the unwrapped, sequential-await code directly** before writing the transaction fix — not inferred from the symptom alone.
- Every modified file syntax-checked; a `no-undef` lint sweep run across the *entire* backend `repositories/`+`services/` directories and the modified frontend file, not just the specific files touched — clean throughout.
- Full import-graph check on every modified file plus `server.js`/`app.js`.
- **45/45 backend tests passing, before and after** — no regressions.
- A genuine `node src/server.js` boot attempt, confirmed to fail with the same known, already-documented Prisma-generate error — not a new one.
- Clean production frontend build.
- **The Prisma interactive-transaction pattern (`prisma.$transaction(async (tx) => {...})` combined with the repositories' new optional `client` parameter) was checked against Prisma's own documented API shape** before being used — `tx` inside the callback has the identical model-accessor interface as the main client, so `transportSessionRepository.update(id, data, tx)` correctly resolves to `tx.transportSession.update(...)`.

**Not verified**: an actual live reproduction — forcing a write failure mid-transition and confirming the transaction correctly rolls back, or watching a real "Resume Active Session" button correctly *not* appear against a live database. The same disclosed sandbox restriction as every backend verification in this project (`prisma generate` blocked) applies here too. What's been done instead is tracing the exact mechanism by which the reported state occurred, fixing that mechanism at its source, and verifying the fix's logic against Prisma's documented transaction API rather than assuming it would work.

## Known limitations

- **The transaction wraps the session-status and vehicle-status writes specifically** — the two writes directly implicated in the reported bug. `stopTransport()`'s subsequent writes (the envelope's `transportStatus`, the audit log entry) remain separate, non-transactional steps after the atomic core. A failure in those wouldn't reproduce *this* bug (the vehicle/session pair stays consistent regardless), but could theoretically leave a different, smaller inconsistency (e.g. an envelope not marked `DELIVERED` despite its transport having genuinely completed). Extending full atomicity further was judged out of scope for fixing the specific reported symptom, and is noted here rather than silently left unmentioned.
- **`findActiveForVehicle` returns the session found, but `startTransport()`'s self-healing correction only fires when no active session exists at all** — if a vehicle is (correctly) already active, the conflict is still raised, as it should be; the self-heal only ever touches the specific stale-flag-with-no-real-session case this bug was about.
- **The stale-session watcher's per-session error isolation logs and continues** rather than retrying — a session whose processing threw once will simply be reconsidered on the next tick (15 seconds later, unchanged interval), not retried immediately.
