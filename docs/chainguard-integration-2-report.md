# ChainGuard — Integration Sprint 2 Implementation Report
## Transport ↔ Live GPS Integration

## 1. Investigation performed before writing any code

| Requirement | Finding |
|---|---|
| "GPS simulation automatically begins when a transport session starts" | Technically already true in the narrowest sense (starting a session and beginning simulated updates were already the same button click) — but the mechanism itself was a real problem: the simulation lived entirely inside `TransportMonitoring.jsx` as a `setInterval` tied to that component's lifecycle. |
| "Live GPS page must immediately display... without manual refresh" | Already true *for that one page* (it already had real socket listeners since Sprint 6). |
| "notify the Dashboard... through existing real-time events" | **Confirmed false** — `Dashboard.jsx` had zero socket listeners of any kind, checked directly, not assumed. |
| "notify... Live Monitoring... through existing real-time events" | **Confirmed false** — `LiveMonitoring.jsx` (the real page behind that label) has real listeners for camera/detection/alert events, but no GPS/transport awareness at all. |
| "notify... Executive Dashboard... Security Command Center" | Security Command Center (Sprint 8) already listens for `transport:start`/`transport:end`/`gps:update` and refetches live data — largely already correct, one gap found (`transport:pause` wasn't listened for). "Executive Dashboard" is the cards section inside Security Command Center, not a separate page — no additional work needed there beyond the fix already covered. |

**The central finding**: verified directly that `TransportMonitoring.jsx`'s simulation `setInterval` was cleared on component unmount. This is the root cause behind every other symptom in this sprint's brief — a simulation that dies the instant you navigate away to watch it on another page cannot possibly satisfy "must display live... without manual refresh" on that other page, because there would be nothing left generating updates to display. This reframed the sprint from "add some socket listeners" to "fix the actual architectural problem, then the listeners have real data to show."

## 2. Architectural decisions

**The GPS simulation loop was moved from the frontend to the backend.** This is the sprint's central decision, so the reasoning is laid out in full:

- **Before**: `TransportMonitoring.jsx` ran its own `setInterval`, calling `POST /gps/update` every 3 seconds, entirely from the browser. Stop existing = stop simulating.
- **After**: `gps.service.js`'s `startTransport()` now starts a server-side interval (`startAutoSimulation()`) that calls the **exact same internal `updateLocation()`/`stopTransport()` functions** the HTTP layer already used — just invoked as plain function calls instead of by an incoming request. No new business logic was written; the update/deviation/checkpoint/alert logic in `updateLocation()` is completely untouched and reused as-is.
- **Why this satisfies "reuse existing... no duplicate services"**: the simulation "engine" isn't a second service — it's the same `gps.service.js` calling its own existing methods on a timer instead of waiting for HTTP requests. The route-interpolation math was ported from the frontend to `utils/geo.util.js` (`buildInterpolatedRoute`, `buildWrongRoute`) as pure, independently tested functions — replacing the frontend's private copy, not duplicating it (the frontend copy was deleted once the backend one existed).
- **The frontend's role changed from "driver" to "observer"**: `TransportMonitoring.jsx` now only starts/stops/pauses/resumes real sessions and displays whatever `gps:update`/`transport:*` events arrive — identical in kind to what Dashboard, Live Monitoring, and Security Command Center now also do. This is what makes "immediately display... without manual refresh" true on *every* page simultaneously, not just the one that happens to be driving the simulation.

**A new `resumeTransport()` / `POST /gps/resume` was added — a genuinely necessary addition, not scope creep.** Sprint 6's original design had no resume endpoint by deliberate choice: pausing only stopped the *frontend's* loop, and resuming was simply restarting it, whose very next real update would auto-flip `PAUSED` back to `ACTIVE`. Now that the simulation loop runs on the backend and correctly *skips* sending updates while paused (so it can't accidentally self-resume mid-pause — verified this matters, see §5), nothing could flip the status back without an explicit action. `resumeTransport()` is the minimal, symmetric fix, mirroring `pauseTransport()` exactly.

**`scenario` and `autoSimulate` were added to `startTransport()`, both optional and backward compatible.** `autoSimulate` defaults to `true` because "the GPS simulation automatically begins" is this sprint's literal instruction, and this project has never had a real GPS device to opt out in favor of. The flag exists for forward-compatibility with a hypothetical future real-device integration, not because anything in this project needs it today.

**No new pages, no new database models.** `TransportSession`/`GPSLocation`/`Alert` etc. are unchanged. The only backend additions are: one new endpoint (`/gps/resume`), two new optional request fields, and the simulation-engine functions themselves (plain JS functions, not a new service or model).

## 3. Files modified

| File | Change |
|---|---|
| `backend/src/utils/geo.util.js` | Added `buildInterpolatedRoute`, `buildWrongRoute` (ported from the frontend, now the single real implementation) |
| `backend/src/services/gps.service.js` | The core of this sprint: `startTransport()` accepts `scenario`/`autoSimulate` and starts the backend simulation; new `resumeTransport()`; `stopTransport()` and the unexpected-end watcher path now stop the simulation interval; the entire `startAutoSimulation`/`runSimulationTick`/`stopAutoSimulation`/`stopAllAutoSimulations` engine added |
| `backend/src/controllers/gps.controller.js` | New `resumeTransport` handler |
| `backend/src/routes/gps.routes.js` | New `POST /gps/resume` route (mirrors `/pause` exactly) |
| `backend/src/validators/gps.validator.js` | `startTransportValidator` gained optional `scenario`/`autoSimulate`; new `resumeTransportValidator` |
| `backend/src/server.js` | Calls the new `stopAllAutoSimulations()` on graceful shutdown, alongside the existing watcher cleanup |
| `backend/tests/geo.util.test.js` | 4 new tests for the ported route-building functions |
| `frontend/src/services/gpsService.js` | `startTransport()` passes `scenario`/`autoSimulate`; new `resumeTransport()` |
| `frontend/src/pages/TransportMonitoring.jsx` | The client-driven simulation loop removed entirely (`runSimulationTick`, `simIndexRef`, `simTimerRef`, the dead `buildRoute`/`buildWrongRoute` copies); `startSimulation`/`pauseSimulation`/`resumeSimulation` now just call the corresponding backend endpoints; the `transport:end` handler simplified now that there's no local interval to tear down |
| `frontend/src/pages/Dashboard.jsx` | Had zero socket listeners — now listens for `transport:start/pause/end`, `gps:update`, `envelope:updated`, `alert:new` (debounced 2s, since `gps:update` fires every ~3s per active vehicle and the dashboard's own figures don't need sub-second precision) |
| `frontend/src/pages/LiveMonitoring.jsx` | Had zero GPS/transport awareness — added a small, additive "Active Transport" widget (vehicle/envelope/speed per active session) fed by the existing `gpsService.getLive()` and refreshed on the same transport socket events |
| `frontend/src/pages/SecurityCommandCenter.jsx` | Added the one missing listener, `transport:pause` (already had `transport:start`/`transport:end`) |

## 4. Files created

None — every requirement was satisfiable by extending existing files. No new pages, services, or database models.

## 5. Verification performed

- Every claim in §1's table was checked against the actual code (the unmount-clears-interval behavior was confirmed by reading the `useEffect` cleanup directly, not assumed from memory of building it).
- **4 new real tests** for the ported route-building functions, including confirming every interpolated point genuinely lies on the real route (distance ~0) and that `buildWrongRoute`'s points are genuinely beyond the real deviation threshold — not just "the function runs without throwing."
- Traced the pause/resume interaction carefully before implementing: confirmed that if the auto-simulation loop *didn't* explicitly skip ticks while a session is `PAUSED`, it would call `updateLocation()` on the next tick regardless, which — via the existing, unmodified auto-resume-on-update logic — would silently un-pause the session 3 seconds after every pause. This is why the tick function checks live session status before acting, and why `resumeTransport()` was added rather than left implicit.
- Every modified backend file syntax-checked individually.
- Full import-graph check on every modified backend file plus `server.js`/`app.js`.
- **32/32 backend tests passing** (28 pre-existing + 4 new) — no regressions.
- A genuine `node src/server.js` boot attempt, confirmed to fail with the same known, already-documented Prisma-generate error — not a new one.
- Every modified frontend file syntax-checked individually, then a full production build (2855 modules, zero errors — same count as before, since every frontend change was an edit to an existing file, not a new one).

**Not verified**: an actual live run — starting a transport session and watching it animate on the Dashboard, Live Monitoring, and Security Command Center simultaneously while the Transport page itself is closed — for the same disclosed Prisma-engine network restriction that has applied to every backend feature verification in this project since Phase 1. The interaction was traced by hand against the real code (both the new backend simulation loop and each page's new listener), not assumed to work correctly.

## 6. Known limitations

- **The "Vehicle Stop (simulated)" and "Lost GPS (simulated)" friendly event-log entries that used to appear on the Transport Monitoring page are gone.** They were pushed by the old client-driven loop at the exact moment those scenarios kicked in; the backend loop that replaced it doesn't currently emit a dedicated event for "a scenario transition just happened" (only the real, resulting alerts — Vehicle Stopped, GPS Signal Lost — still fire correctly and appear in every Active Alerts panel, unaffected). A small, real gap in demo polish, not in the underlying alerting.
- **`stopTransport()`'s validation is unchanged** — it still only accepts an `ACTIVE` session (matching its pre-existing behavior, not modified per "do not redesign existing modules"), so a `PAUSED` session must be resumed before it can be stopped. This was true before this sprint too; not a new limitation, just carried forward deliberately.
- **The in-process simulation state (`activeSimulations` Map) is per-server-instance**, same scope assumption every other in-process state in this codebase already makes (`alertedConditions`, `offlineSessions`, etc., all in `gps.service.js` itself) — this project has always been a single-server deployment; a multi-instance deployment would need this moved to shared state (e.g. Redis), which is a pre-existing architectural assumption this sprint did not change.
- **Dashboard's socket-triggered refresh is debounced to 2 seconds**, not instantaneous — a deliberate tradeoff (see §3) between genuine real-time behavior and not re-fetching the full dashboard summary on every single 3-second GPS tick from every active vehicle.
