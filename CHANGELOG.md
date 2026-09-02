# Changelog

All notable changes to ChainGuard are documented here, phase by phase.

## Architectural Integration Sprint — Frontend Completion & End-to-End Verification

Found `ExaminationSetup.jsx` and `QRGeneration.jsx` already built from a prior pass — reviewed both in full, cross-checked every service call against its real backend signature, found them genuinely correct. The one real gap: neither was wired into routes or navigation, built but unreachable. Fixed, in the exact nav order originally requested.

Traced the complete workflow end to end and found two real, worth-reporting things. First: `TransportMonitoring.jsx`'s envelope dropdown had no filtering at all — any envelope, ready or not, was selectable, which would produce a confusing dispatch rejection instead of never appearing as an option. Fixed by adding a `prepStatus` filter to the existing envelope list endpoint (same pattern as its existing filters) and wiring the dropdown to use it.

Second, and left unfixed on purpose: `gps.service.js` never imports or uses `custodyRepository` anywhere — `TRANSPORT_START`, `TRANSPORT_END`, and `CHECKPOINT` all exist as real custody event types, some since the very first phase of this project, but none have ever actually been created. `startTransport()`/`stopTransport()` write real AuditLog entries but no ChainOfCustody events, leaving a real, visible hole in the timeline between preparation and QR verification. Given explicit instructions not to touch GPS this pass, this is reported rather than fixed.

Also fixed two small, low-risk gaps: `WRONG_CENTRE` (added in an earlier session) was missing from both the Notification Center's category list and the QR Analytics category list/failure-count formula — one-line additions to existing arrays, not new logic.

Enhanced `EnvelopeDetails.jsx`: prepStatus badge, real Download QR button, Examination/Batch linkage, Assigned Vehicle/Officer, every new custody event label, and corrected two stale placeholder messages that incorrectly claimed AI detections and evidence "aren't connected yet."

### Verification performed
`no-undef` sweep across every modified file. Two full production builds, both clean. 64/64 backend tests passing throughout, no regressions. Every service call's arguments checked against its real signature before trusting it. Full detail, including the honest accounting of what wasn't fixed and why: `docs/chainguard-e2e-verification-and-frontend-completion-report.md`.

## QR Verification & Digital Authentication Sprint

Found substantial prior work already built — HMAC-SHA256 signed QR payloads, duplicate-scan and route-violation detection, QR-specific alert categories, 12 real already-passing tests for the signature utility. **Traced every call site and found the single most critical piece disconnected**: `scanQr()`/`verifyByQr()`, the functions the real API endpoints call, were still doing a raw unverified lookup — the fully-built signature/duplicate/location verification logic was never actually called. QR generation had been signing its output; QR verification had never been updated to check it. Fixed as the first priority, since every other phase depends on it.

**Added a new `POST /custody/verify`** (correct for a full signed JSON payload) **alongside the unchanged existing `GET /custody/verify/:qrCode`** (kept for legacy short tokens) — the root cause fixed for both, neither broken. Duplicate-scan detection now returns a real result instead of being fire-and-forget, surfaced in a new "Duplicate Scan Detected" banner. New `QR_GENERATED` custody event (Phase 6), migration applied and verified. New QR Analytics aggregation (Phase 8) — caught and corrected a real formula bug in an early draft (double-counting failures against a success count that never included them) before it shipped. New unified SAFE/SUSPICIOUS decision (Phase 10), verified standalone across 6 real input combinations including the important "a legacy unsigned QR isn't itself suspicious" case. Completed a category mapping in the Notification Center that Sprint 8's own comment had documented as a placeholder waiting for QR alerts to exist.

**Found and fixed a real inconsistency in the seed script**: it fabricated an unsigned `QR-{code}` string that bypassed the entire signature pipeline — seeded envelopes would have failed real verification immediately. Now uses the actual QR generation function.

Deliberately did *not* invent 6 new custody event types for the requested 11-step timeline narrative where no real trigger exists for them (no packing workflow, etc.) — fabricating event types nothing ever creates would be exactly the kind of superficial completeness this project avoids.

### Verification performed
`no-undef` sweep across the entire backend and frontend, not just files this sprint touched. 57/57 backend tests passing, unchanged count (no regressions). Migration applied to and verified against live Postgres. Two full production builds, both clean. Full detail, including what a live database round-trip could not verify in this sandbox: `docs/chainguard-qr-verification-digital-authentication-report.md`.

## Critical Bug Fix — "Vehicle already on an active transport session" With No Active Sessions

Traced every write to `Vehicle.status` directly and found the actual root cause: neither the backend's duplicate-prevention check nor the previous frontend fix's "Resume Active Session" button were ever checking for a real active `TransportSession` — both trusted `Vehicle.status`, a field only kept in sync by two separate, unwrapped database writes (session-status update, then vehicle-status reset) with no atomicity between them. If the second write ever failed to run after the first committed, the vehicle stayed `IN_TRANSIT` forever with no session left to explain why — exactly the reported symptom: a clean session table, a permanently stuck vehicle.

**Fixed the cause, not the symptom**: `startTransport()` now queries the real source of truth (`transportSessionRepository.findActiveForVehicle()`, new) instead of the derived field, and self-heals a stale `IN_TRANSIT` flag with no session backing it rather than silently tolerating it. Both places that end a session now wrap the session-status and vehicle-status writes in a real Prisma transaction, reusing the existing `update()` functions via a new optional `client` parameter rather than a second write path. A related robustness gap found during this investigation — one session's processing failure could silently skip every other active session's checks for that tick — was fixed alongside it with per-session error isolation in the stale-session watcher.

The frontend had an independent version of the same mistake: the button label checked the same stale field, completely disconnected from the mount-time reconnect logic that already checked real session data correctly. Replaced with real, socket-kept-fresh session tracking.

### Verification performed
Every write site to `Vehicle.status` traced directly via grep, not inferred from the symptom. `no-undef` sweep across the entire backend repositories/services directories. 45/45 backend tests passing, no regressions. Real server-boot attempt, same known error. Clean production build. The Prisma transaction pattern checked against its documented API before use. Full detail, including what a live database reproduction could not verify in this sandbox: `docs/chainguard-critical-bugfix-vehicle-status-desync.md`.

## Critical Bug Fix — Live GPS Simulation Breaking on Page Navigation

Investigated first: re-verified directly (not re-assumed from the Integration Sprint 2 report) that the backend simulation genuinely has zero dependency on any frontend connection — traced `runSimulationTick()`/`activeSimulations` in the current code and confirmed Integration Sprint 4's later `raiseAlert()` signature change is a separate path that didn't touch this mechanism. **The real bug was entirely on the frontend**: `TransportMonitoring.jsx` had no way to discover an already-running session on mount, so it auto-selected fresh defaults every time — which, on a return visit, is very often the exact vehicle the still-running backend simulation already marked `IN_TRANSIT`. The reported error ("Vehicle is already on an active transport session") was the pre-existing backend safeguard correctly doing its job with nothing on the frontend checking first.

**Fix, built entirely from two endpoints that already existed**: `GET /gps/live` (already used elsewhere) discovers an active session on mount; `GET /gps/history/:sessionId` (existed since Sprint 5/6) restores the full view — map position, travelled route, checkpoints, and simulation state — before the user sees anything. A second, independent safeguard was added at the button level (re-checks immediately before ever calling `startTransport()`, covering a session started in another tab), and the button now reads "Resume Active Session" whenever the selected vehicle is already `IN_TRANSIT`.

No backend file was changed. No new endpoint was created.

### Verification performed
Confirmed by grep that `stopTransport`/`pauseTransport` are only ever called from their explicit button handlers, never from a `useEffect` cleanup — the concrete proof that unmounting never stops the backend. Both endpoints' real response shapes verified against their repository implementations before relying on them. The `no-undef` lint sweep run after each substantial edit, not just once at the end. Clean production build. Full detail, including what a live click-through in this sandbox could and couldn't verify: `docs/chainguard-critical-bugfix-gps-navigation.md`.

## AI Improvement Phase — Dataset Expansion, Annotation Quality, Retraining

Generated 1,498 new synthetic images (1,888 total), added a genuinely distinct new class (`SEAL_OPEN` — a localized broken-seal mark, not a duplicate of `OPENED`'s full-width flap cavity, verified to actually differ in generated output), and implemented real annotation-quality improvement: bounding boxes are now tightened using actual pixel-level difference from the clean envelope, verified to correctly go both tighter *and* appropriately wider (not a naive shrink heuristic). Diversity widened across backgrounds (3→7 themes), envelope stock, lighting, viewing angle, and camera distance, each reasoned individually. A real bug (an unlearnable 4×4 box on small envelope crops) was found and fixed during verification.

**Training-time augmentation and NMS were completely unexposed as config before this phase** — confirmed by reading the schema directly. Added and reasoned individually (not left at defaults out of inertia). Trained to 40 real epochs across 8 resumed sessions; a genuine environment quirk was discovered and handled safely (a background process survived past the tool's own execution limit; the safe response was to wait and poll rather than start a conflicting resume). A related registry-bookkeeping issue (one continuous run scattered across 9 entries by repeated resumes) was found and consolidated into one honest record.

**The most important finding in this phase**: a naive comparison showed the new model marginally behind the current champion's self-reported mAP50 (0.947 vs 0.951). A genuinely fair, same-image comparison was built instead — remapping this project's validation labels into the champion's own different class ordering (a real bug, `SAFE`/`sealed` failing to map, was caught and fixed during verification of the remap itself) — and revealed the champion scores mAP50 ≈ 0.016 on this project's own visual domain, essentially random. The champion's headline number was never a reliable predictor of its performance on what this system actually processes. The new model was promoted on this basis, using the existing `should_promote()`/registry mechanism unmodified — no inference code, API, or backend integration touched.

Confidence threshold (0.5 → 0.25) was tuned from 6 real, independently-measured validation passes, prioritizing recall for a tamper-detection use case where a missed real event is worse than a reviewable false alarm.

### Verification performed
73/73 tests passing (68 pre-existing + 5 new). Real 40-epoch training run confirmed via results.csv, not a log tail. Cross-model class remapping independently spot-checked against filenames. Confirmed by reading (not modifying) `inference/model_loader.py` that the existing champion-loading mechanism picks up the new model with zero code changes. Full detail, including the honest limitation that no real-world validation exists or was possible: `docs/chainguard-ai-improvement-phase-report.md`.

## Integration Sprint 4 — Automatic Incident Response Workflow

A thorough inventory found most of this sprint's backend already built in a prior pass: a new shared `incidentResponse.service.js` (one function, called from both the AI-tamper path and the transport-anomaly path — the concrete meaning of "one automatic incident response workflow"), `AuditAction` extended with `INCIDENT_RECORDED`, and `detection.service.js` extended with class-aware alert severity. Reviewed line-by-line rather than trusted because it looked complete.

**A real, severe bug found and fixed before it could ship**: `envelope.service.js`'s tamper-handling code called `incidentResponseService` without importing it — meaning the very first real tamper detection through the Scanner would have crashed. Same class of bug, same silent-until-runtime failure mode, as the `ensureDemoData` regression fixed last turn. Verification for this sprint was built specifically around catching this: a `no-undef` lint check (re-confirmed to actually work before being trusted) run across the *entire* backend and frontend source trees, not just the files this sprint's brief named — found the missing import immediately, then confirmed clean everywhere else.

**Every one of `raiseAlert()`'s 7 real call sites in `gps.service.js` individually checked** against its new `session`-based signature (changed by the prior work) — exactly the "signature changed, not every call site updated" risk that caused the last regression, checked deliberately this time.

**`severityForDetection()` moved from a private function in `detection.service.js` to the shared `utils/damageClass.util.js`** — not a logic change, a testability fix: `detection.service.js` can't be imported without a live database, so this genuinely pure function had no way to be unit-tested where it sat. 5 new tests, including one that directly encodes the bug this sprint fixes as an assertion (a `TAPED` and a `TORN` detection at identical confidence must not score the same severity).

**Alert Center — the page literally dedicated to alerts — had zero socket listeners**, confirmed by checking directly. Added the one real-time gap this sprint's prior work hadn't closed; every other named page (Dashboard, Analytics, Live Monitoring, Security Command Center) was already correctly wired from earlier sprints and needed no change.

### Verification performed
`no-undef` sweep across the entire backend and frontend source trees (not just sprint-specific files), first proven against a known-broken test case. Every `raiseAlert()` call site individually inspected. 5 new tests. 45/45 backend tests passing. Real server-boot attempt, same known error. Clean production build. Full detail: `docs/chainguard-integration-4-report.md`.

## Regression fix — `ensureDemoData is not defined` on Live GPS "Start Simulation"

**Root cause, confirmed by direct inspection**: Integration Sprint 2's rewrite of `TransportMonitoring.jsx` (moving the GPS simulation loop to the backend) replaced a large line range of the file in one block. `ensureDemoData()` — added earlier in the Transport-module hotfix sprint — sat inside that range. The replacement preserved every *call* to it but not its own definition, deleting it while leaving the call intact.

**Why this went undetected**: a production build does not catch a plain undefined runtime identifier the way it catches a bad import — the error only surfaces when that line actually executes in a browser. Verification at the end of Integration Sprint 2 was a syntax check plus a build, both of which passed despite the bug.

**Fix**: restored `ensureDemoData()` exactly per the hotfix sprint's own documented behavior (cross-checked against `docs/chainguard-transport-demo-hotfix-report.md`, not reconstructed from memory alone) — same fields, same "create only if missing" logic, same position in the file. Nothing else was touched.

**Verification, strengthened specifically because a build alone missed this class of bug**: ran a targeted `no-undef` lint pass — first confirmed against a deliberately broken test file that the check actually detects this error class, then ran it clean against the fixed file, then extended it to every other page touched across Integration Sprints 2 and 3, not just the one reported. All clean (one flagged line in `QRVerification.jsx` confirmed to be a harmless false positive, an eslint-disable comment, not a real bug). Full detail: `docs/chainguard-regression-fix-ensureDemoData.md`.

## Integration Sprint 3 — Scanner ↔ Transport ↔ AI ↔ Evidence ↔ Alert Integration

Investigated first: confirmed the scan flow had no transport-status gate, no transport-session linkage, and never updated `sealStatus` from AI results (grepped every service for `sealStatus` writes and found none). Found Security Command Center and Live Monitoring already had adequate `detection:new` coverage; Dashboard was missing `detection:new`/`evidence:processed` (a gap from Integration Sprint 2); **Analytics had zero socket listeners at all**.

**A real, pre-existing bug found and fixed**: alert generation checked only confidence, never the predicted class — a confident `SAFE` detection would still raise a "suspicious activity" alert. Fixed to require the class actually represent damage, matching "generate alerts for tamper detections" literally.

**A new shared `utils/damageClass.util.js`** extracts the damage-severity concept `riskScore.service.js` (Sprint 8) already had privately — needed in two more places this sprint (alert gating, seal-status updates), and copying it a second/third time would risk exactly the kind of drift "no duplicate logic" exists to prevent. `riskScore.service.js` now imports from it instead of keeping its own copy.

**`envelope.service.js`'s `scan()` rewritten**: gates on `transportStatus === 'DELIVERED'`, auto-preloads officer/vehicle/timestamp/location from the real delivering transport session (via Sprint 7's existing `listByEnvelope`, no new repository method), links Detection/Evidence to it, updates `sealStatus` from real AI results (verified with a standalone script across every detection-ordering case before trusting it), and creates real `ChainOfCustody` events using `DAMAGED`/`TAMPERED` — enum values Sprint 7 added but no code path had ever actually used until now.

Dashboard and Analytics gained real socket listeners for detection/evidence/alert/transport events. No new pages, services, or endpoints.

### Verification performed
8 new real tests for the shared classification utility. Migration applied to and verified against live Postgres. Every file syntax-checked, full import-graph check including `server.js`/`app.js`. 40/40 backend tests passing, no regressions. Real server-boot attempt, same known error. Clean production build. Full detail: `docs/chainguard-integration-3-report.md`.

## Integration Sprint 2 — Transport ↔ Live GPS Integration

Investigated first: confirmed directly (not assumed) that `Dashboard.jsx` had zero socket listeners and `LiveMonitoring.jsx` had zero GPS/transport awareness — two real gaps. But the central finding was architectural: the GPS simulator's `setInterval` lived inside `TransportMonitoring.jsx`, tied to that component's lifecycle — confirmed by reading the unmount cleanup directly. Navigating away silently killed the simulation, which made "must display live on other pages without manual refresh" structurally impossible to satisfy no matter how many socket listeners got added elsewhere.

**The fix: moved the simulation loop from the frontend to the backend.** `gps.service.js`'s `startTransport()` now starts a server-side interval that calls the *exact same* internal `updateLocation()`/`stopTransport()` functions the HTTP layer already used — no new business logic, just the same functions invoked directly instead of waiting for a request. Route interpolation was ported from the frontend to `utils/geo.util.js` as pure, tested functions (4 new tests, including confirming every interpolated point genuinely lies on the real route). The frontend's role changed from "driver" to "observer" — `TransportMonitoring.jsx`'s entire client-driven loop was deleted, and it now just starts/stops/pauses/resumes real sessions and watches the same events every other page watches.

**A new `resumeTransport()`/`POST /gps/resume` was added, genuinely necessary, not scope creep**: once the simulation runs server-side and correctly skips sending updates while paused (traced by hand to confirm — without this it would auto-resume itself 3 seconds after every pause via the existing update-triggered auto-resume logic), nothing could flip a session back to `ACTIVE` without an explicit action.

**Dashboard and Live Monitoring gained real socket listeners** (reusing the exact same events other pages already emit/listen for) — Dashboard debounced to 2s given `gps:update` fires every ~3s per vehicle; Live Monitoring gained a small, additive "Active Transport" widget, not a duplicate of the full Transport page.

No new pages, services, or database models — every requirement was satisfiable by extending existing files.

### Verification performed
4 new real tests for the ported route-building logic. Every modified backend file syntax-checked, full import-graph check including `server.js`/`app.js`. 32/32 backend tests passing, no regressions. Real server-boot attempt, same known error, not a new one. Clean production build (2855 modules). Full detail: `docs/chainguard-integration-2-report.md`.

## Sprint Integration-1 — Envelope ↔ Transport Integration

Investigated every requirement against the actual current system before writing anything — found most were already true (QR/ID/initial-status generation on creation, Transport Session auto-creation on start, GPS module recognizing an active session immediately since it's a live query, not cached). Narrowed the real scope to exactly two genuine gaps: no `AuditLog` entries existed for envelope/transport events, and `Envelope` had no field distinguishing "at rest" from "in transit" (`sealStatus` is a different, physical-seal concept — conflating the two would make real states unrepresentable).

**`AuditLog` extended, not duplicated**: 3 new `AuditAction` values (`ENVELOPE_CREATED`, `TRANSPORT_STARTED`, `TRANSPORT_ENDED`), using the *existing* `metadata Json?` field for the envelope reference — no new column. `AuditLog` (system-wide action log) and `ChainOfCustody` (per-envelope physical history, Sprint 7) now both record these events for two genuinely different audiences, same as before this sprint.

**New `Envelope.transportStatus`** (`AT_REST`/`IN_TRANSIT`/`DELIVERED`, default `AT_REST`) — written, not purely derived, since a queryable field is directly filterable without a join on every read. Set to `IN_TRANSIT` on `startTransport()`, `DELIVERED` on a normal `stopTransport()` completion, and reverted to `AT_REST` on the existing "unexpectedly ended" watcher path (for symmetry — nothing was actually delivered there, so leaving it stuck at `IN_TRANSIT` would have been a half-finished integration).

**Socket notification reuses the existing `envelope:updated` event** (already emitted on creation, already listened to by the Security Command Center) — no new event name introduced.

No new pages, services, or endpoints — every requirement was satisfiable by extending 2 existing services and 1 schema.

### Verification performed
Migration applied to and verified against live Postgres. Both files syntax-checked, full import-graph check including `server.js`/`app.js`. 28/28 backend tests passing before and after. Real server-boot attempt, same known error, not a new one. Clean production build. Full detail: `docs/chainguard-integration-1-report.md`.

## Sprint 8 — AI Intelligence, CCTV Monitoring & Security Command Center

**A scope decision stated upfront**: Part 12 asked for "fake AI detections... so the Command Center looks alive during demonstrations." Built the way every simulation feature in this project has been built since Sprint 5 — real data through real pipelines (the Envelope Scanner's real inference, the GPS Simulator's real endpoint calls, the QR page's real handover workflow), not fabricated database rows. No new "Simulation Control Panel" was built — it would either duplicate the real endpoints the existing simulators already call, or insert synthetic-looking data directly, which this project has never done.

**New services, all honestly labeled for what they actually are**: `systemHealth.service.js` (real Postgres/AI-service/Socket.IO/disk/memory/CPU checks — genuinely unavailable metrics like GPU on this CPU-only deployment are reported as unavailable, not faked), `riskScore.service.js` (a real, documented weighted formula, explicitly **not** a trained ML model — its own header comment says so), `predictiveIntelligence.service.js` (real historical aggregation, explicitly **not** a forecasting model). `report.service.js`'s long-standing honest stub (its own original comment said "would query aggregate data" — and didn't) now computes real content for 5 report types by orchestrating the services above.

**New API**: `/system/health`, `/system/ai-health`, `/system/camera-health`, `/intelligence/predictions`, `GET /envelopes/:id/risk-score`, `GET /reports/:id`. `POST /reports` extended (backward compatible — the pre-existing PDF/CSV export flow is untouched).

**New frontend**: `SecurityCommandCenter.jsx`, reusing every existing service and the existing Socket.IO connection rather than anything parallel. **A real bug caught and fixed**: `EnvelopeDetails.jsx` had no query-param support, so "click an AI feed item → open its details" would have silently done nothing — fixed with a minimal, backward-compatible `?id=` deep-link. The Navbar's already-real notification dropdown was extended with filters and categorization rather than replaced. `Reports.jsx` gained the 5 new report types with an in-app content viewer.

**Also fixed in passing**: `dashboard.service.js`'s `aiAccuracy` had been a hardcoded `99.1` placeholder since Phase 1 — now the real champion model's mAP50.

### Verification performed
Every new file syntax-checked; full import-graph check including `server.js`/`app.js` at multiple checkpoints through the sprint; both migrations applied to and verified against live Postgres; the risk-score weight formula's arithmetic independently verified before use; 28/28 backend tests passing throughout, no regressions; a real server-boot attempt, same known error, not a new one; full production frontend build verified twice, zero errors both times. Full detail: `docs/chainguard-sprint8-command-center-report.md`.

## Sprint 7 — Secure Chain of Custody & QR Workflow

**Backend substantially pre-existed this session** — schema, migration, `custody.service.js`/controller/routes/validator were already built from a prior pass (own "Sprint 7" comments throughout). This session inspected and verified that work rather than rebuilding it, per the sprint's own "reuse existing services, do not rewrite existing modules" instruction, and built the entire frontend, which didn't exist yet.

**Database** (reviewed, verified against live Postgres): `CustodyEventType` +5 values (`VERIFIED`, `HANDOVER_ACCEPTED`, `DAMAGED`, `TAMPERED`, `ARCHIVED`), `ChainOfCustody` gained nullable `toOfficerId`/`latitude`/`longitude`/`device` and a `confirmed` boolean (default `true`, so every existing row is correctly "not pending" with zero backfill) for the two-step handover workflow.

**New API**: `GET /custody/verify/:qrCode` (read-only — envelope + live GPS + latest AI detection, no custody event created), `POST /custody/handover/{initiate,accept}`, `GET /custody/handover/pending`, `GET /custody/search`. Transfer verification checks eligible roles, rejects self-transfer and double-pending transfers; GPS/AI status are non-blocking warnings on a handover, not hard rejections — a desk-to-desk transfer legitimately has neither.

**New frontend**: `custodyService.js` rewritten (was missing every Sprint 7 method), and a new `QRVerification.jsx` page — camera scan or image upload (`html5-qrcode`) → verify → live Chain of Custody timeline, a GPS panel (reusing Sprint 5/6's transport data) and an AI panel (reusing Sprint AI-4B's detection data, read-only, AI module untouched) → Initiate/Accept Handover via the existing `Modal` component → Search History. Built as one cohesive page with clear sections rather than six separate routes (explained in the report) — a stated judgment call, not an oversight.

### Verification performed
Confirmed the actual pre-existing state via direct file review before writing anything, not assumed from comments alone. Live Postgres schema check. Full import-graph including `server.js`/`app.js`. A real server-boot attempt, same known error, not a new one. **3 new real tests** for QR generation — including reading the generated file's actual bytes and confirming real PNG magic-byte headers, the one genuinely-testable-without-a-database piece this sprint touched (everything in `custody.service.js` is DB-orchestration end to end, same category as `gps.service.js`). 28/28 backend tests passing. Real production build: 2853 modules, zero errors.

### Known limitations
Camera-based scanning is real, complete code (checked against the installed `html5-qrcode` package's own type definitions), not live-tested — no camera in this sandbox, same category as every webcam-dependent feature in this project. Full detail: `docs/chainguard-sprint7-qr-custody-report.md`.

## Hotfix — Transport module unusable on fresh install

**Reported**: the Live GPS page's "Start Simulation" button was permanently disabled, and the whole simulator UI was hidden behind an empty-state message requiring pre-existing vehicles and envelopes.

**Root cause**: Sprint 5/6's demo vehicles and routes were seeded via raw SQL directly into this development sandbox's own Postgres instance, never into `prisma/seed.js` or any code path that runs on a fresh install. `npx prisma db push` creates schema, not data — a genuinely fresh database has zero vehicles, envelopes, or routes, and the Transport Monitoring page had no path for a first-time user to get past that.

**Fix, frontend-only, zero backend files touched**: removed the page-level gate that hid the entire UI when no vehicles/envelopes existed; removed the Start button's dependency on pre-populated dropdown selections; added `ensureDemoData()`, which auto-creates exactly one demo envelope/vehicle/route the moment Start Simulation is clicked, using only existing, unmodified endpoints (`POST /envelopes`, `POST /vehicles`, `POST /routes`) — no new backend capability. The demo "officer" is the already-logged-in user, not a newly created account. Added the two genuinely missing live-update fields from the original Sprint 5 spec: Travelled Distance and ETA.

**Verification**: confirmed by file-modification-time that only 3 frontend files changed and no AI Scanner/Envelope Scanner/Authentication file was touched; full production build (2827 modules, zero errors); full backend test suite re-run (25/25, unaffected). Full detail, including the one thing this sandbox still cannot verify live (an actual `npx prisma generate` + fresh-install click-through, same disclosed network restriction as every backend feature since Phase 1): `docs/chainguard-transport-demo-hotfix-report.md`.

## Sprint 6 — Geofencing, Route Deviation & Smart Transport Alerts

Extends Sprint 5's GPS tracking module — no AI/evidence/scanner/auth file touched, no existing feature removed.

**No duplicate alert table**: rather than a separate "Transport Alerts" model, the existing `Alert` table (used since Phase 1) gained one nullable `category` field (`ROUTE_DEVIATION`, `VEHICLE_STOPPED`, `LATE_ARRIVAL`, `GPS_SIGNAL_LOST`, `BATTERY_LOW`, `CHECKPOINT_MISSED`) — every existing alert consumer keeps reading one table, unchanged.

**Routes are now real and DB-backed** (`TransportRoute`/`RouteCheckpoint`, nullable `TransportSession.routeId`) — Sprint 5's hardcoded `PREDEFINED_ROUTES` frontend constant is gone, replaced by a real `GET /api/v1/routes` call returning the same three seeded routes (Direct/Via Ring Road/Express) with the identical checkpoints as before.

**Real route-deviation geometry**: new `pointToSegmentDistanceMeters`/`distanceToRouteMeters` in `utils/geo.util.js`, comparing a vehicle's position to the nearest point on the *whole route path*, not just the nearest single checkpoint. Verified against known geometric cases (exact midpoint → 0, endpoint clamping, perpendicular-offset ordering) before use. One test's own tolerance was wrong, not the code — a ~13km test case's ~0.10% discrepancy against true haversine was cross-checked and confirmed to be exactly what the function's documented "under 1% at this scale" accuracy predicts; fixed the test, not the function.

**New detection logic in `gps.service.js`**: checkpoint-missed detection (a later checkpoint reached without an earlier one on the route), per-checkpoint geofence enter/exit tracking (`GeofenceEvent`, distinct from Sprint 5's "reached once" `TransportCheckpoint`), route deviation with a grace period before alerting, and delay/late-arrival detection added to the existing periodic watcher (time-based, same reasoning as Sprint 5's signal-loss check).

**New Socket.IO events**: `checkpoint:reached`, `route:deviation` (start/end), `transport:delay`. All 5 Sprint 5 events unchanged.

**Frontend**: five simulation scenarios (Normal, Wrong Route, Vehicle Stop, Battery Low, Lost GPS) — each genuinely exercises the real detection pipeline rather than faking an alert; map gained checkpoint-radius circles, an expected-route line, and a deviation highlight; a live event log for the new chronological timeline events; two new Dashboard widgets (Vehicles Delayed, Vehicles Off Route) added to Sprint 5's widget row, original 5 cards untouched.

### Verification performed
Migration applied to and confirmed against live Postgres. 6 new real tests for the route-distance geometry (25/25 full suite passing). Full import-graph check including `server.js`/`app.js`. A genuine server boot attempt, confirmed to fail with the same known, already-documented error, not a new one. Real production frontend build: 2827 modules, zero errors.

### Known limitations
Live end-to-end behavior (simulator → detection → socket → map) is unverified against a running server, same disclosed sandbox restriction as every backend feature since Phase 1. "Deviation Area" on the map is a simplified circle around the current position, not a precise buffered corridor. The Vehicle Stop scenario genuinely takes the real 5-minute threshold to trigger — not shortened for the demo. Full detail: `docs/chainguard-sprint6-geofencing-report.md`.

## Sprint 5 — Live GPS Tracking

**Purely additive** — no file under `ai/`, no evidence/scanner/auth logic, and no existing Dashboard card was touched. Four new Prisma models (`Vehicle`, `TransportSession`, `GPSLocation`, `TransportCheckpoint`), applied via hand-written migration and verified against the real, live Postgres instance directly (`\dt`/`\d`, not assumed from the schema text).

**Backend**: full `Route → Controller → Service → Repository` stack for `/api/v1/gps/{start,update,stop,live,history/:sessionId}`, following the exact layering already established. Checkpoint detection (Haversine proximity, 300m radius) and battery/stopped-vehicle alerts run inline on `POST /gps/update`, reusing the existing `Alert` model and `alertRepository`/`getIo().emit('alert:new', ...)` pattern from `detection.service.js` — no new alerting mechanism invented. "GPS signal lost" is the one condition that can't be detected on update (it's defined by the *absence* of one) — a small `setInterval` watcher, started once from `server.js` after Socket.IO initializes, is the only new background-timer mechanism this sprint introduced. All 5 required Socket.IO events (`gps:update`, `transport:start`, `transport:end`, `vehicle:online`, `vehicle:offline`) are real and wired.

**Frontend**: new `TransportMonitoring.jsx` — a `react-leaflet` map (checkpoints, live vehicle marker, traveled-route polyline), a live status card, and a step timeline, all driven by real Socket.IO events rather than the simulator's own HTTP responses (so a second browser tab watching the same page sees the same live movement). The "GPS simulator" (no mobile app exists yet) calls the real backend endpoints on a genuine 3-second timer — every simulated point is a real `POST /gps/update`, written to Postgres and broadcast over the real socket channel, not faked client-side. Battery deliberately drains toward the 20% alert threshold over a simulated run, so that feature is naturally exercised by using the simulator once, not left designed-but-never-seen.

**A real dependency conflict found and resolved, not forced through**: `react-leaflet@5` (latest) requires React 19; this project is on React 18.3.1. Installed `react-leaflet@^4.2.1` instead — the version that actually matches, confirmed via the real `npm install` error rather than guessed.

**Two small, explicitly-flagged additions beyond the sprint's literal endpoint list**: `GET/POST /api/v1/vehicles` (the spec's 5 GPS endpoints have no way to discover or register a vehicle, which the frontend genuinely needs) and two demo vehicles seeded directly via SQL (same reason every other seed data in this project has gone in via direct SQL — `prisma/seed.js` needs a generated Prisma Client this sandbox's network restriction still blocks).

### Verification performed
Migration applied to and confirmed against live Postgres. Full import-graph check on every new/modified file, **including `server.js`/`app.js` this time** — deliberately closing the exact gap that let an earlier, unrelated bug through undetected. A genuine `node src/server.js` boot attempt, failing with the expected, already-known Prisma-generate message (this sandbox's long-standing network restriction) rather than anything new. Real production frontend build: 2827 modules (+45 from `leaflet`/`react-leaflet`), zero errors. **5 new real unit tests** (`tests/geo.util.test.js`) for the Haversine/checkpoint logic — which required extracting that logic into a new dependency-free `utils/geo.util.js` module first, since `gps.service.js` itself transitively imports `config/db.js` and can't even be *imported* in this sandbox without a generated Prisma Client. One test's own first-draft expected value (an estimated ~1.6km) was wrong and caught by the test itself; cross-checked independently with a separate Python implementation (confirmed 1463.67m), then the test — not the code — was corrected.

### Known limitations
Live end-to-end behavior (simulator → API → DB → socket → map) is unverified in this sandbox, for the same disclosed reason as every backend feature since Phase 1. Alert debouncing is in-process only, not persisted. The "vehicle stopped >5 minutes" alert uses the real 5-minute threshold, not shortened for demo convenience — a full simulator run won't naturally trigger it. No dedicated vehicle-registration UI yet (the API exists; the page only reads the seeded list).

### Extension round — Pause/Resume, multiple routes, Dashboard widgets, richer timeline
A second, more detailed Sprint 5 request added: `PAUSED` transport status (new migration, no `transport:resume` event — resuming is just the next real `gps:update` arriving, mirroring the existing offline/online auto-recovery pattern); a "Transport unexpectedly ended" alert (10 minutes of lost signal, distinct from the 45-second warning); `GET /gps/history/by-envelope/:envelopeId`; new Dashboard widgets (Vehicles Online, Active Transport, Average Speed, GPS Signal Status, Live Alerts) via one new additive field on the existing `/dashboard/summary` response; three selectable predefined routes; and the timeline extended from 7 to 9 steps, now starting from Envelope Printed → AI Scan → Officer Accepted. **A real bug caught while extending this**: making the live map/dashboard show paused vehicles (not drop them) meant broadening `listActive()` to include `PAUSED` sessions — which would have made the stale-signal watcher treat an intentional pause as a lost signal. Fixed with a second, narrower repository method (`listActiveOnly()`) used specifically by the watcher. 19/19 backend tests still passing (no new tests this round — the new logic is DB orchestration, not pure functions like the first round's Haversine math, so there wasn't meaningful new logic to unit-test in isolation). Full details: `docs/chainguard-sprint5-gps-tracking-report.md`'s addendum.

## AI Model Merge — externally-trained YOLOv8s champion

**Request**: merge a separately-developed AI project's verified trained model (`best.pt`, YOLOv8s, 6 classes) into this project, without rebuilding any existing architecture.

**Architecture comparison performed before touching anything**: the uploaded project (`chainGuard-ai.zip`) is a complete, independent codebase — its own `api/main.py` (FastAPI, different endpoints: `/predict`, `/predict/all`, `/model-info`), its own `inference/predict.py` (different response schema: `{label, confidence, bbox: [x1,y1,x2,y2]}`), its own training/dataset tooling. **Only the trained weights were merged — none of its API, routing, or response-schema code.** Confirmed this was viable, not assumed: loaded `best.pt` directly with this project's own `ultralytics.YOLO()` and inspected the checkpoint's embedded metadata directly (`task: detect`, standard `DetectionModel`, class names `sealed/torn/taped/crushed/opened/partial_damage`, trained at `imgsz=224`) — a completely standard YOLOv8 detection checkpoint, fully loadable by this project's existing, unmodified `inference/model_loader.py`.

**Files actually modified**: `ai/requirements-ml.txt`... no — see the full merge report (`docs/chainguard-ai-model-merge-report.md`) for the precise, complete list. In summary: the *inference pipeline itself* (`model_loader.py`, `image_inference.py`, `video_inference.py`, `batch_inference.py`, all FastAPI routers) required **zero changes** — already generic across any YOLO checkpoint, confirmed by this exact merge working without touching them. One frontend file (`EnvelopeScanner.jsx`) needed a small, additive, case-insensitive fix, since the new model's classes are lowercase (`sealed`) while this project's own previously-trained models used uppercase (`SAFE`) — without it, detection badges/bounding-box colors would have silently fallen back to a generic neutral color for every new-model detection. No backend file, no API contract, no request/response format, no database schema changed.

**Registered via the existing, unmodified model registry** — `services/model_registry.register_model()` and `evaluation/compare_models.should_promote()`, exactly as designed for this scenario. The new model (mAP50 0.951) correctly out-competed and was promoted over the prior in-project-trained champion (mAP50 0.919) based on real metric comparison, not a hardcoded decision. Both prior models (`smoke_test_6bc0803a`, `repair_full_99503f10`) remain in the registry's history, `isChampion: false`, fully reversible.

**Verified end-to-end for real**: loaded the model directly, ran real predictions against the uploaded project's own validation images (11/12 correct on an honest, non-cherry-picked spot check across all six classes — one genuine miss reported, not hidden), then booted the actual FastAPI service and confirmed via real `curl` requests — `GET /health` reports the new champion, `POST /predict/image` against a real file returns a correct, high-confidence, correctly-shaped detection. 68/68 AI tests and 14/14 backend tests still passing, with zero test changes required this time (the dynamic champion-version assertions from the earlier model-repair work paid off).

**Delivered as a separate `ChainGuard_Final_AI_Merged` package**, not overwriting any prior delivery, per instruction — built from this same working copy (duplicating its ~6GB Python environment to build a second, fully independent copy was not feasible in this sandbox's available disk; the zip itself never included dependencies in any delivery regardless, so the actual deliverable is unaffected).

## Model Repair (post Sprint AI-4B)

**Reported**: after full end-to-end integration testing, every scan returned "No findings above the confidence threshold" and the UI showed a `smoke_test_xxxxx` model version.

**Investigation, not assumption**: confirmed directly against `models/weights/manifest.json` and `training/experiments.json` that exactly one model has ever been trained in this project's history — Sprint AI-3's deliberate smoke test (2 epochs, 24 training images, 0.0 on every metric, by explicit design to prove the pipeline mechanically works). Confirmed no fallback, placeholder, or fake-prediction logic exists anywhere in `inference/` or `services/model_registry.py` — the system was correctly loading the only model that had ever been registered. **Root cause: absence of real training, not a bug.**

**Fix**: generated a new dataset (390 images, 13x the smoke test, still synthetic) and ran a real training pass (35 completed epochs, up from 2). Registered and promoted via the existing, unmodified `compare_models.py`/`model_registry.py` logic — no new promotion code was needed.

**Two real bugs found while executing the fix, unrelated to the original report but blocking it**:
1. Ultralytics 8.3.55 (the original pin) calls `np.trapz`, removed in numpy>=2.0 (which Sprint AI-3 had pinned for an unrelated scipy/opencv-headless compatibility fix). The smoke test never hit this — its near-empty validation set never reached that code path; a real training run with real validation data does. Fixed by upgrading to `ultralytics==8.4.115`, which handles the numpy 2.x transition internally (confirmed by reading its source, not assumed from a changelog).
2. That same version upgrade changed how `ultralytics.YOLO.train()` resolves a *relative* `project` path — it started resolving against Ultralytics' own internal runs-directory concept instead of the current working directory, silently writing checkpoints to the wrong location. Fixed by passing an absolute path in `training/train.py`.

**New champion**: `repair_full_99503f10` — precision 0.927, recall 0.883, mAP50 0.919, mAP50-95 0.642, F1 0.905 (vs. 0.0 across every metric for the smoke test). Confirmed with real, non-cherry-picked predictions across all six classes, including honest reporting of where confusion remains (`PARTIAL_DAMAGE`, which is *by design* a blended/reduced-intensity version of another damage class, is the hardest class to separate — expected, not a defect). Confirmed live through the actual running FastAPI service via real `curl` requests, not just direct function calls.

**Class names confirmed unchanged and correct**: `SAFE`, `TORN`, `OPENED`, `CRUSHED`, `TAPED`, `PARTIAL_DAMAGE` — established since Sprint AI-2, used consistently through training and inference. (The investigation request phrased these as "Sealed"/"Partially Damaged" — a reasonable colloquial paraphrase, not evidence of an actual naming mismatch in the code.)

**Old smoke-test model**: not deleted — still present in `models/weights/manifest.json` with `isChampion: false`, per the model registry's "never overwrite, promotion is a flag flip" design (Sprint AI-1). Fully reversible if ever needed.

**Test suite**: 4 tests updated — 3 hardcoded the old champion's version string/image size (now query the real registered champion dynamically, so a future retraining doesn't require editing tests again), and 1 test fixture (`sample_video`) was fixed to explicitly resize frames rather than assume every file under `datasets/synthetic/` shares one resolution — a real fragility this exact repair work exposed (the folder now legitimately contains images from two differently-sized generation runs). 68/68 passing.

## Hotfix — Backend silent startup failure (post Sprint AI-4B)

**Reported by the user**: the exported Sprint AI-4B backend didn't start — `node src/server.js` exited immediately with zero output, even with `throw new Error(...)` inserted as the literal first line of the file. This was a real, confirmed bug, not an environment issue on the user's end, found by actually running `node src/server.js` from a clean extraction (something no verification in this project had done before — every prior check imported individual files wrapped in `try/catch`, which never exercises the true uncaught-exception path a real process boot does).

**Root cause**: `backend/src/config/logger.js` configured Winston with `exceptionHandlers: [new winston.transports.File({ filename: 'logs/exceptions.log' })]`. Setting `exceptionHandlers` makes Winston register its own internal `process.on('uncaughtException', ...)` listener — so when anything throws an uncaught exception during startup (e.g. `@prisma/client did not initialize yet` before `prisma generate` has run), **Winston intercepts it instead of Node's default handler**, and tries to write it to `logs/exceptions.log`. Two compounding problems made this completely silent:
1. `logs/` is gitignored and stripped from every packaged export (correctly — log files shouldn't be committed) — so on a fresh checkout, the directory doesn't exist, and the File transport fails to write.
2. `exceptionHandlers` only listed a File transport — even when `logs/` *did* exist and the write succeeded, nothing was ever printed to the console. The error was real, logged, and completely invisible in the terminal either way.

**Fix** (`backend/src/config/logger.js`): `fs.mkdirSync('logs', { recursive: true })` before constructing any transport, and a `Console` transport added to both `exceptionHandlers` and the new `rejectionHandlers` — so any startup-time uncaught exception or unhandled rejection is now always visible immediately, with the file log still available for later debugging.

**Also fixed, found during re-verification of the export pipeline itself**:
- The packaging zip lost its top-level `chainguard/` wrapper folder starting with Sprint AI-3 (an inconsistency, not present in Phase 1/2 or Sprint AI-1/AI-2 exports) — restored.
- A real packaging bug: re-running the `zip` command against an already-existing output file *appends/updates* rather than replacing it, which silently duplicated every file path (with and without the wrapper prefix) in one export attempt during this fix. Caught before delivery by inspecting the resulting file list, not assumed correct from a successful `zip` exit code — fixed by deleting the previous output file before every re-package.

**Verification this time**: real `npm install`, real `node src/server.js` execution (not import-graph checks) from a completely clean `/tmp` extraction of the actual delivered zip — confirmed the exact original failure (reproduced it first), confirmed the fix resolves it (the terminal now shows the real, actionable Prisma error instead of silence), and confirmed the frontend (`npm install` + `npm run dev`, real HTTP 200) from the same clean extraction. `npx prisma generate` itself still cannot be verified to succeed in this development sandbox specifically — `binaries.prisma.sh` is outside its network allowlist, unchanged since Phase 1 — this is a restriction of this project's sandbox, not of the exported code, and does not affect a normal machine with regular internet access.

## Sprint AI-4B — ChainGuard AI Integration

**The AI service and Node backend are genuinely connected — both directions tested against real running counterparts, not mocks.**

**Schema**: `Detection.envelopeId` added (flagged since Phase 3A); `Detection.cameraId` relaxed to nullable — a real, necessary discovery beyond what Phase 3A anticipated, surfaced by actually implementing the scan flow (a manual envelope photo has no camera). Migration applied to a live Postgres instance, verified via `\d detections`. `detection.validator.js` now enforces "at least one of cameraId/envelopeId" as a business rule.

**New: `backend/src/services/aiClient.service.js`** — Node → AI communication (health check, prediction request) using native `fetch`/`FormData` (no new npm dependency). Retry (exponential backoff, configurable), timeout (`AbortController`, configurable), and errors translated to a new `ApiError.serviceUnavailable()` (503) factory.

**New: `ai/services/detection_client.py`** — AI → Node communication, JWT-authenticated (reusing the existing backend auth system in full, not a second scheme). New `backend/scripts/mint-ai-token.js` mints the long-lived `AI_SYSTEM` service token — minted for real this sprint and verified against the backend's own `verifyAccessToken()`.

**New: API key auth on the AI service** (`utils/auth.py`, guards `/models` and `/predict/*`) — matches `env.aiService.apiKey`, scaffolded on the Node side since Phase 1, unused until now. Verified in all four states (no key, wrong key, correct key, `/health` exempt) directly against the live service.

**New: `POST /envelopes/:id/scan`** (`envelope.service.js`'s `scan()`) — the full Evidence Pipeline: image upload → `Evidence` record (wiring up the repository orphaned since Phase 1) → AI submission → `Detection` creation per finding → existing auto-alert logic (Phase 1, unmodified) → `evidence:processed` Socket.IO broadcasts at each stage. Evidence is created *before* the AI call, so an upload is never lost if the AI service happens to be down.

**Dashboard/Reports/Analytics: zero code changes needed** — confirmed, not assumed — Phase 1's services already aggregate `Detection`/`Alert` generically; this sprint is what starts producing rows with real envelope context for them to surface.

### A real bug found by this sprint's own test suite, and fixed
`aiClient.service.js`'s retry logic only recognized `ECONNREFUSED` as a retryable network failure. A test simulating a mid-request connection drop (a realistic failure mode, not an edge case) threw a different error (`UND_ERR_SOCKET`, nested under Node fetch's generic `TypeError: fetch failed`) that fell through as non-retryable. Root-caused by inspecting the actual error object, fixed to match on fetch's real failure signature instead of one specific error code, re-verified against both the test suite and the live Node↔AI round trip.

### A real environment problem solved, not worked around
Background processes (`nohup cmd &`) weren't surviving between separate tool calls in this sandbox — diagnosed (foreground worked, backgrounded silently died) and fixed with `setsid cmd < /dev/null &`, now documented in `Troubleshooting.md`.

### Verification performed
- Schema migration applied to and verified against a live Postgres instance.
- Real Node code (`aiClientService`) called the real running FastAPI service — health check, model listing, and an actual multipart image upload, not simulated.
- `detection_client.py` tested against a real local HTTP server (Python's `http.server`), not mocks.
- `aiClient.service.js` tested against a real local HTTP server (Node's `http` module), not mocked `fetch`.
- 68/68 AI-side tests, 14/14 backend tests passing.
- Import-graph verification for every new/modified backend file (same established pattern since Phase 1 — Prisma's query engine remains blocked by this sandbox's network allowlist, unchanged since Phase 1).

### Known limitations
The full scan pipeline has not been executed against a live Express+Prisma server (same long-standing Prisma-engine-binary limitation as every backend phase since Phase 1, not new this sprint) — verified instead via live-tested cross-service HTTP calls plus code review, the same standard applied throughout this project. Report PDF/CSV rendering remains unimplemented (flagged since Phase 1). No frontend listener for the new `evidence:processed` event yet (frontend work was out of this sprint's scope). No dedicated rate limit on `/scan` specifically.

## Sprint AI-4A — AI Inference Platform

**Real, standalone inference — no database records, no alerts, no Socket.IO, no backend/frontend integration, per explicit sprint scope.** Implements `inference/{model_loader,image_inference,video_inference,webcam_inference,batch_inference,performance}.py` and wires `routers/{models,inference,metrics}.py` + extends `routers/health.py` into `main.py`.

**A design decision verified empirically before writing code, not assumed**: does `ultralytics.YOLO()` really provide one interface for `.pt` and `.onnx`? Tested directly — yes, but doing so surfaced a real bug: ONNX exports have a fixed input shape, so inference fails with a dimension-mismatch error unless `imgsz` is passed explicitly. Fixed by extending `services/model_registry.ModelEntry` with a required `imageSize` field (migrated the existing manifest entry, updated `evaluation/compare_models.py`'s promotion path, re-ran the full 40-test suite to confirm nothing broke before adding the 20 new tests).

**Every inference mode tested against the real Sprint AI-3 trained model**: image (real annotated JPEG, visually inspected), batch (6 real images, real JSON/CSV reports), video (synthesized a real MP4 from the sample dataset, processed it, read the annotated output back with OpenCV to confirm frame count matched). Webcam inference is real code — reuses video inference's shared frame processor, per the Phase 3A design's "live and prerecorded feeds share one path" decision — but honestly untested live (no camera in this sandbox); only its correct-failure path (clean 503, not a crash) is verified.

**All 7 required endpoints implemented and tested through the real HTTP layer** (FastAPI `TestClient`, not direct function calls): `GET /health` (extended with real `lastInferenceAt`/`totalPredictions`), `GET /models`, `POST /predict/image`, `POST /predict/video`, `POST /predict/webcam`, `POST /predict/batch`, `GET /metrics`.

### Real bugs and gaps found and fixed during verification, not left in
- **ONNX fixed-input-shape bug** (above) — the sprint's core empirical finding.
- **A real test-fragility issue caught before it shipped broken**: the in-process performance-metrics singleton is shared across every test module in one pytest run — `test_health.py`'s original assertion that `lastInferenceAt is None` would have become order-dependent once inference tests existed alongside it. Fixed to a type-check with the reasoning documented inline.
- **A real deployment gap**: `ai/Dockerfile` still only installed Sprint AI-1's core API dependencies, but the service now genuinely needs the full ML stack to serve predictions. Fixed — and explicitly documented as build-untested in this sandbox (same disk constraint as Sprint AI-3's venv install), rather than silently claimed as verified.

### Documentation
`docs/AI/Inference_Guide.md` rewritten with real content (was an honest "doesn't exist yet" stub since Sprint AI-3). New `docs/AI/API_Guide.md` — every endpoint with real captured example requests/responses, not hand-written samples. `Deployment_Guide.md` and `Troubleshooting.md` updated with this sprint's real findings.

### Known limitations
Champion model is still the Sprint AI-3 smoke test (0.0 confidence everywhere) — the inference *pipeline* is real and verified, the model's predictive quality is not, by design. No authentication on any endpoint (true since Sprint AI-1, still true). `psutil` memory reporting is approximate under Docker/cgroups. `POST /predict/webcam` models a bounded capture session, not a continuous live stream (deliberate — plain REST only, no WebSocket this sprint).

## Sprint AI-3 — AI Training Platform

**Real training, not mocked — no inference APIs, no frontend/backend integration, per explicit sprint scope.** Rewrites Sprint AI-1's `NotImplementedError` training/evaluation stubs with working code, actually exercised against a real YOLOv8 training run.

**The real feasibility question this sprint answered first**: could YOLOv8 training run at all in this sandbox (no GPU, ~8.9GB free disk at the start, `download.pytorch.org` outside the network allowlist)? Investigated PyPI wheel sizes before committing, discovered the plain PyPI `torch` wheel needs the full `nvidia-*-cu12` dependency chain (~11 packages) even for CPU-only use (it eagerly `dlopen()`s CUDA libraries at import time), installed the full stack with disk monitored throughout — landed at ~3GB free. **It worked.**

**New, real modules**: `training/{config,dataset_prep,experiments,environment_info,export,reports,cli}.py`, rewritten `training/train.py`, rewritten `evaluation/{evaluate,compare_models}.py`. Experiment tracking mirrors the model-registry/dataset-versioning JSON-registry pattern for the third time across three sprints.

**Actually trained a model** — 2 epochs, 24 training / 6 validation images (Sprint AI-2's sample dataset, newly split stratified-per-class via `training/dataset_prep.py`, which Sprint AI-2 explicitly deferred building). Metrics are honestly 0.0 across the board — expected for this scale, documented as a smoke test, not hidden or inflated. Real Ultralytics output committed: checkpoints, confusion matrix, loss curves, training history CSV, ONNX export, and generated Markdown/JSON/CSV reports — all at `ai/training/runs/smoke_test_6bc0803a/`.

**A genuine full-circle verification**: registered the trained model as champion in Sprint AI-1's `services/model_registry.py` (built but never exercised with real data until now) and confirmed `GET /health` (also Sprint AI-1) correctly flips from `modelLoaded: false` to `true` with the real champion version.

### Real bugs found and fixed during verification, not left in
- Ultralytics' ONNX exporter tried to auto-install `onnxslim` via the system pip, which failed under Debian's PEP 668 protection — fixed by installing into the venv directly and pinning both `onnxslim`/`onnxruntime` in `requirements-ml.txt`.
- Renaming a venv directory (`.venv_train_test` → `.venv`) broke every generated console script's hardcoded shebang path (`pip`, etc.) — discovered when `pip` reported "not found" despite `ls` showing the file; worked around by using `python3 -m pip` throughout, documented in `docs/AI/Troubleshooting.md`.
- **A real cross-sprint dependency conflict**: Sprint AI-2's `numpy==1.26.4` pin is incompatible with the training stack's `scipy`/`opencv-python-headless` (need `numpy>=2.0`). Fixed by bumping the pin in `requirements-dataset.txt` to `2.5.1` — but only after re-running Sprint AI-1 + AI-2's full 27-test suite against the new version first to confirm nothing broke.
- **A Sprint AI-1 test that fell out of date, not silently left broken**: `test_health.py` asserted "no model has ever been trained" — true when written, false now that this sprint shipped a real champion. Updated to assert the new, equally-honest reality.

### Documentation
New `docs/AI/`: `Dataset_Guide.md`, `Training_Guide.md`, `Inference_Guide.md` (honest that inference doesn't exist yet), `Deployment_Guide.md`, `Troubleshooting.md` (real issues actually hit this sprint, not speculative).

### Known limitations
The shipped model is a smoke test (0.0 metrics by design), not a usable detector — real training needs the production-scale dataset config already built in Sprint AI-2. Per-class metrics aren't threaded through experiment records yet, so model promotion compares on aggregate mAP only. `.pt` vs. `.onnx` for serving isn't decided — a Sprint AI-4 question. Training verified CPU-only; the CUDA code path exists but couldn't be tested (no GPU in this sandbox).

## Sprint AI-2 — Dataset Platform

**Real implementations, not skeletons — no training, no inference, per explicit sprint scope.** Rewrites Sprint AI-1's `NotImplementedError` dataset stubs with working code: synthetic generator, augmentation, quality validation, real-data collection, versioning, and metadata management.

**Generated a small representative sample (30 images), not thousands**: `ai/datasets/synthetic/` now has 5 real generated images per class × 6 classes, produced by actually running `python -m datasets.generator.cli --config datasets/configs/sample.yaml`. The same tool generates production-scale datasets from `datasets/configs/production_example.yaml` — see `ai/datasets/README.md`, "Generating datasets of any size."

**New, real modules**: `datasets/config.py` (YAML-based `GenerationConfig`/`AugmentationConfig`), `datasets/manifest.py` (CSV metadata management), `datasets/versioning.py` (mirrors Sprint AI-1's `model_registry.py` pattern deliberately), `datasets/generator/{synthetic_generator,damage_overlays,backgrounds,cli}.py`, `datasets/augmentation/augmentor.py`, `datasets/validator/quality_validator.py`, `datasets/statistics/dataset_stats.py` + `stats_cli.py`, `datasets/collector/{collectors,naming}.py`.

**Documented deviation from the Phase 3A design document**: augmentation uses Pillow/numpy instead of the named Albumentations — Albumentations' real advantage (bbox-aware training-time augmentation) doesn't apply yet since no training exists; `requirements-ml.txt` still has it versioned for whichever future sprint needs it. New `requirements-dataset.txt` (Pillow, numpy, PyYAML, ImageHash) — still no OpenCV/torch.

### Verification performed
- Real venv, real install — clean.
- **27/27 tests passing**, including real `BatchImporter` tests against actual generated JPEG files (not mocks).
- **Actually ran the generator CLI** and inspected the real output (correct file structure, valid YOLO labels, populated manifest, cut version).
- **Visually inspected** generated images (TORN/SAFE/TAPED) and an augmented output — confirmed valid, non-corrupted, visually distinct results, not just "no exception thrown."

### A real bug found and fixed during verification
The first CLI run put `manifest.csv`/`versions.json` inside `datasets/data/` instead of `datasets/`, because the code's `output_dir` default didn't match the Phase 3A design document's actual folder structure. Caught by inspecting real output paths, not assumed correct from code review. Fixed in `datasets/config.py`, both YAML configs, and the generator's relative-path logic; re-ran and confirmed.

### Also fixed
`ai/.gitignore` was blanket-excluding `datasets/synthetic/*` — which would have silently dropped this sprint's actual deliverable (the sample dataset) if committed. Narrowed to not ignore the shipped sample.

### Known limitations
`WebcamCollector` is real code but untestable in this sandbox (no camera device) — flagged explicitly rather than claimed verified. No train/validation/test split tool yet (deliberately — no training pipeline exists to consume it). Damage-overlay rendering is first-pass/clearly-synthetic, adequate for bootstrapping per the design document's stated purpose, not photorealistic.

## Sprint AI-1 — AI Infrastructure Platform

**Infrastructure only — no training, no inference, no dataset generation, per explicit sprint scope.** Builds the `ai/` FastAPI service skeleton per the Phase 3A design document's Step 4.1 repository structure.

**Real, working, and tested**: `main.py` (FastAPI app with a single `/health` endpoint), `config/settings.py` + `logging_config.py` (mirrors `backend/src/config/env.js`/`logger.js`'s conventions), `utils/exceptions.py` + `schemas/common.py` (mirrors the Node backend's `ApiError`/`ApiResponse` envelope shape), and `services/model_registry.py` — genuine `manifest.json` read/write logic (not a stub — reading/writing a JSON file isn't "training" or "inference," it's infrastructure).

**Skeletons, honestly**: `datasets/{generator,collector,augmentation,validator,statistics}/`, `training/{train.py,callbacks.py}`, `evaluation/{evaluate.py,compare_models.py}` — every file has a real, documented Python interface with an explicit `NotImplementedError` body, each docstring citing the exact section of `docs/chainguard-ai-technical-design-phase3a.md` it implements.

**New dependency-management split**: `requirements.txt` (core — fastapi/uvicorn/pydantic, what this sprint's code actually imports) vs. `requirements-ml.txt` (ultralytics/torch/opencv/albumentations/onnx — versioned now, not installed until a future sprint's code actually needs them). Not specified in the Phase 3A design document; added because installing a multi-GB ML stack for code that never imports it would misrepresent "production-ready infrastructure."

**New root `docker-compose.yml`**: real `postgres` + `ai` services; `backend`/`frontend` are documented as comments (checked first — neither has a Dockerfile yet), not falsely declared as buildable.

### Verification performed
- Real venv, real `pip install -r requirements.txt` — clean, no errors.
- `pytest tests/ -v` — **7/7 passing**, covering the health endpoint's response shape and the model registry's load/save/promote/demote logic (against a temporary manifest, never the real one).
- **Actually booted the live server** and hit it with real `curl` requests — `/health` (correct envelope, honestly reports `modelLoaded: false`), `/docs`, `/openapi.json` all verified working.
- `docker-compose.yml` validated as syntactically correct YAML via `pyyaml`, confirmed it declares only the two services that actually work.

### Bugs found and fixed during verification (not left for later)
- `@app.on_event` triggered a `DeprecationWarning` on the installed FastAPI version — rewrote `main.py` to use the modern `lifespan` context-manager pattern; re-verified 7/7 tests still pass, zero warnings.
- A stray literal-brace directory (`{config,routers,...}`) was created by an initial `mkdir` command assuming bash brace-expansion in a shell that's actually `/bin/sh` (dash) — the same class of bug found in the originally-uploaded project back in the Phase 1 review. Caught and removed before packaging.

### Deliverables
Full new `ai/` directory (see `docs/chainguard-sprint-ai1-completion-report.md` for the complete file list) + new root `docker-compose.yml`. **No existing file in `backend/` or `frontend/` was modified.**

### Known limitations / explicitly deferred
No dataset exists, no model has ever been trained (manifest is genuinely empty). `requirements-ml.txt` packages aren't installed. Only `routers/health.py` exists — `inference.py`/`models.py`/`training.py` routers don't exist yet, per this sprint's explicit scope. `docker-compose.yml`'s `backend`/`frontend` blocks are documentation, not working services.

## Phase 3A — AI Platform Technical Design & Architecture

**Design-only phase — no code, no schema, no dependencies changed.** Produced `docs/chainguard-ai-technical-design-phase3a.md`, the complete blueprint for Phase 3B's AI service implementation.

**Key decisions**: separate Python/FastAPI service (`ai/`) using YOLOv8, communicating with the Node backend exclusively over REST as the `AI_SYSTEM` role — reusing the existing `POST /api/v1/detections` endpoint, auto-alert logic, and Socket.IO broadcasting entirely unchanged. The AI service never touches the database or the socket layer directly.

**One schema change identified for Phase 3B** (not made yet): `Detection.envelopeId` (nullable, additive) — closes the long-standing gap (flagged since Phase 1) preventing per-envelope AI observations.

**Two orphaned Phase-1 features get a concrete wiring plan**: `Evidence`'s controller/route and `upload.middleware.js` (technical debt item D1 since the Phase 1 review) are designed as the evidence-storage path for AI-flagged frames.

**Explicitly out of scope, called out rather than silently ignored**: Demo Mode/Scenario Engine, Storage Room AI, Transport AI (all Phase 4+ concerns), and OCR/QR-verification/face-recognition/anomaly-detection are documented at the architecture level only, per the spec's explicit request, with face recognition specifically flagged as needing a consent/privacy review before any implementation, not just a technical design.

## Phase 2 — User & Administration Management

**Objective:** full user CRUD, role management, account lifecycle (activate/deactivate/soft-delete/restore), password management, and audit logging — extending the existing architecture, not redesigning it.

### Conflict found and resolved
The Phase 2 spec's role list (`Chief Examination Officer`, `Storage Officer`, `Auditor`, `Viewer`, alongside the existing roles) didn't match the real `Role` enum from Phase 1 (`ADMINISTRATOR`/`PRINTING_OFFICER`/`TRANSPORT_OFFICER`/`EXAM_CENTER_OFFICER`/`AI_SYSTEM`). Renaming or replacing the enum would have broken every seeded user and every existing `authorize(ROLES.X)` check. Resolved by **additively expanding** the enum — all 4 new roles added, all 5 existing roles and every existing RBAC check untouched. Verified directly against a live Postgres instance (see Verification below).

### Database
- **Migration `20260731140000_phase2_user_admin_audit`** (additive only, no existing column/table/row altered):
  - `Role` enum: +`CHIEF_EXAMINATION_OFFICER`, +`STORAGE_OFFICER`, +`AUDITOR`, +`VIEWER`
  - New `AuditAction` enum (12 values)
  - `users` table: +`employeeId` (unique), +`department`, +`designation`, +`phone`, +`assignedCenter`, +`lastLoginAt`, +`profileImagePath`, +`deletedAt`, +`createdById` (self-referencing FK)
  - New `audit_logs` table: `action`, `actorId`, `targetUserId`, `ipAddress`, `metadata` (JSONB), `createdAt`, with indexes on all four filterable columns
- Soft delete (`deletedAt`) is deliberately kept separate from the existing `isActive` toggle — a soft-deleted user is excluded from every listing entirely, which is a stronger state than merely inactive.

### Added — Backend
- `PATCH /api/v1/auth/change-password` — self-service password change (requires current password), distinct from the admin-triggered reset below so the two are never ambiguous in the audit trail.
- Full Administration module on `/api/v1/users`: `POST /`, `PUT /:id`, `PATCH /:id/status`, `PATCH /:id/role`, `PATCH /:id/password-reset`, `PATCH /:id/restore`, `DELETE /:id` (soft delete), `GET /search`.
  - `PATCH /:id/restore` is **not in the Phase 2 spec's literal endpoint list** — added because "Restore User" is a required lifecycle action with no listed route.
- New `/api/v1/audit-logs` module (`GET /`, Administrator/Auditor only) — **also not in the spec's literal endpoint list**, added because "Audit Logging" is a required section with no way to retrieve it otherwise.
- New `utils/password.util.js` — shared `hashPassword`/`comparePassword`, extracted so the new admin-creation path and the existing `auth.service.js` don't duplicate bcrypt logic.
- New `auditLog.repository/service/controller/routes.js`. `auditLogService.record()` is deliberately best-effort — a logging failure is caught and logged via Winston, but never blocks the login/logout/admin action it's describing.
- Privilege-escalation guards in `user.service.js`: an Administrator cannot change their own role, deactivate their own account, or delete their own account through these endpoints (route-level RBAC already prevents any non-Administrator from reaching them at all — this is an additional safety net against accidental self-lockout).

### Changed — Backend (existing files, extended carefully)
- `auth.service.js`/`auth.controller.js`: audit logging on `LOGIN`/`LOGOUT`/`LOGIN_FAILED`, `lastLoginAt` tracking, a soft-delete guard added to `login()`/`refresh()` (alongside the existing `isActive` guard), `ipAddress` plumbed from the controller. Core credential-check logic is unchanged.
- `user.repository.js`: extended `list()`'s projection with the new profile fields and a `createdBy` summary; added `updateLastLogin()`.
- `models/roles.model.js`: added the 4 new roles, matching the schema.
- `prisma/seed.js`: added one demo user per new role (with `employeeId`/`department`), backfilled `createdById` on the Phase 1 officer seeds, and seeded 3 demo audit log entries.

### Added — Frontend
- `pages/UserManagement.jsx` — searchable, filterable, paginated user list with a Create User modal.
- `pages/UserDetails.jsx` — view/edit profile, change role, reset password, activate/deactivate, soft delete/restore — all with confirmation dialogs, and self-action buttons disabled when viewing your own account. Includes a Recent Activity panel (via `auditLogService`) showing that user's audit trail — added specifically so audit logging isn't a backend-only feature with no UI, the same "built but orphaned" gap flagged as technical debt in the Phase 1 review.
- `services/userService.js` extended with the full Phase 2 API surface; new `services/auditLogService.js`.
- `constants/roles.js` — single shared list of role options/labels, so `UserManagement`/`UserDetails` can't drift out of sync with each other.
- `components/layout/ProtectedRoute.jsx` extended with an optional `allowedRoles` prop — every existing usage is unaffected (prop is optional); only the new `/admin/users*` routes pass it.
- `Sidebar.jsx`: an "Administration" nav item, visible only when `user.role === 'ADMINISTRATOR'`.
- `Settings.jsx`: the Security tab's fake 2FA/session-lock/IP-allowlist toggles were replaced with a real password-change form wired to `authService.changePassword` and a real Session Information panel. Fixed a latent bug in the Profile tab (`user.avatarInitials` referenced a field that never existed on the real user object — now computes initials from `user.name`, matching the pattern already used in `Navbar.jsx`).

### Deliberately deferred (see root README's Known Gaps)
Profile image upload UI, Notification Preferences, a theme switcher (explicit non-goal, not a gap), and self-view of one's own extended profile fields (currently Administrator-only via `GET /users/:id`).

### Verification performed
- **Schema/migration verified against a real, live Postgres instance** (not just written): applied the Phase 1 `init` migration, then this Phase 2 migration, directly via `psql` — zero errors. Confirmed via `\d users`, `\d audit_logs`, and `enum_range` that every new column, table, index, foreign key, and all 9 role values landed exactly as designed.
- All new/modified backend files pass `node --check` and resolve correctly through Node's real ESM loader — the only failure point anywhere is the Prisma query-engine binary (blocked by this sandbox's network egress allowlist, same limitation as Phase 1 — not a code defect).
- Frontend: clean `npm install`, and a full production build (`npm run build`) — 2781 modules transformed, zero errors. This caught a real issue during development: `App.jsx` imported `UserDetails.jsx` before that file existed, which would have failed the build; it's written now and the build is clean.
- **Note on `Settings.jsx` scope:** only the Security tab (Change Password, Session Information) is real, Phase 2 functionality. The General/Notifications/AI Model/Database/API Keys/Theme tabs contain static, non-persisted UI that predates this phase (and Phase 1) — left untouched per "extend, don't redesign," not newly introduced fake functionality. Wiring those to real backend persistence would need new schema (org/notification-preference tables) and isn't scheduled for a specific phase yet.
- **Not verified in this environment:** a live, DB-backed request/response cycle through the actual Express app (same Prisma-engine limitation as above), and the `prisma/seed.js` script's runtime execution (also needs the generated Prisma Client). Run the manual testing checklist in your real environment before treating this phase as fully closed.
- **Found and fixed a pre-existing bug** (predates Phase 2): `package.json`'s `"test": "node --test tests/"` script never actually worked on Node v22 (silently failed to resolve the directory) — the test suite had never really been run via `npm test`. Fixed to `node --test tests/*.test.js` and confirmed all 8 tests (including 3 new ones added this phase) pass for real.

## Phase 1 — Complete Frontend & Backend Integration

**Objective:** convert the remaining frontend pages from static dummy data to real backend integration, without modifying UI/styling/component structure, and without breaking any existing working module.

### Fixed
- **Critical:** `frontend/src/services/authservice.js` renamed to `authService.js`. The mismatched casing worked by accident on case-insensitive filesystems (Windows/Mac) but would fail the build on any case-sensitive filesystem (Linux, most CI, most container deployments).
- `socket.io-client` was installed at the *repository root* `package.json` instead of `frontend/package.json`, where it's actually required by `src/services/socket.js`. Moved it to the correct location — a fresh `npm install` inside `frontend/` alone now works without depending on npm's hoisting behavior from an unrelated root install.
- Removed a leftover literal folder (`src/{components/layout,...}`) caused by a `mkdir` brace-expansion pattern that wasn't expanded by the shell it ran in.
- Removed the dead, duplicate `GET /reports/dashboard/summary` endpoint (backend `report.service.js`/`report.controller.js`/`report.routes.js`) — it computed an overlapping, unused subset of what the real `GET /dashboard/summary` already provides, and no frontend code called it.

### Added — Backend
- `GET /api/v1/envelopes/centers` — distinct exam centers, powers the Reports filter dropdown.
- `GET /api/v1/users/officers` — lightweight `{id, name, role}` roster for dropdowns, available to any authenticated role.
- `GET /api/v1/users` and `GET /api/v1/users/:id` — Administrator-only full user list/detail.
- New `analytics` module: `GET /api/v1/analytics/scans-by-month`, `/tamper-breakdown`, `/confidence-trend`, `/center-risk`, `/camera-status` — all real aggregations over existing `Detection`/`Alert`/`Camera` data, reusing existing repositories (with new aggregation methods) rather than parallel query paths.

### Added — Frontend
- New service wrappers: `envelopeService.js`, `custodyService.js`, `reportService.js`, `userService.js`, `analyticsService.js`.
- `cameraService.js` extended with `update()` and `heartbeat()`, reusing existing backend routes.

### Changed — Frontend pages
- **CameraManagement.jsx** — now fetches real cameras; "Restart" calls the real heartbeat endpoint, "Settings" persists via a real `PATCH`; status badges cover all four real `CameraStatus` values (`ONLINE`/`OFFLINE`/`DEGRADED`/`MAINTENANCE`), not the three the old mock data had.
- **Analytics.jsx** — every chart now reads from the new `/analytics/*` endpoints. Two charts were redesigned around what's actually real rather than patched to hide the gap: "Camera Uptime Heatmap" → "Live Camera Status" (no historical uptime table exists, so this shows real current status instead of a fabricated percentage), and "AI Accuracy Trend" → "Average Detection Confidence" (confidence is a real stored value; "accuracy" would require ground truth that isn't tracked).
- **Reports.jsx** — filter dropdowns (center/envelope/officer) now come from real endpoints; "Generate" creates a real `Report` record via `POST /reports`. Because the backend doesn't render actual PDF/CSV files yet, the UI is honest about this — a report with no `filePath` shows "Not yet available" rather than a fake working download link.
- **EnvelopeDetails.jsx** — rebuilt around real data: envelope core fields, real QR code (with a graceful fallback when `qrImagePath` is null, which is true for all current seed data), and the real chain-of-custody timeline from `custodyService`. The old "Seal Integrity/Damage Probability" gauges and "AI Observations" — which were never backed by real schema (there is no `Detection`↔`Envelope` relation) — were replaced with clear `EmptyState`s explaining that link arrives with the AI module phase, not silently dropped or faked.
- **Navbar.jsx** — the notification bell now fetches real open-alert counts via `alertService`, matching the same plain fetch-on-mount pattern already used by `AlertCenter.jsx` (no new socket subscription introduced).

### Documentation
- `backend/docs/API.md` — added Users/Analytics/Dashboard sections, added `/envelopes/centers`, removed the dead `/reports/dashboard/summary` line.
- `backend/docs/ChainGuard.postman_collection.json` — added Users/Analytics/Dashboard folders, added Get Envelope Centers, removed the dead Dashboard Summary request from Reports.
- `frontend/README.md` — corrected stale claims ("any password works", "all data is mocked") that no longer reflect the real, integrated state.
- Added root `README.md` (didn't exist before) and this changelog.

### Verification performed
- All new/modified backend files pass `node --check` and resolve correctly through Node's real ESM loader (verified via a script that imports every touched module) — the only failure point anywhere is the Prisma query-engine binary, which this sandbox's network restrictions block from downloading; that is an environment limitation, not a code defect.
- `backend`: clean `npm install` (299 packages, no errors).
- `frontend`: clean `npm install` (204 packages, no errors) and a full production build (`npm run build`) completed successfully — 2777 modules transformed, zero errors.
- **Not verified in this environment:** a live, DB-backed request/response cycle. My sandbox's network egress allowlist blocks `binaries.prisma.sh`, which Prisma needs to download its query-engine binary — this is a restriction specific to my sandbox, not something expected in your own environment. Please run the manual testing checklist above in your real setup (with normal internet access, `prisma generate`/`migrate` should work as usual) before treating this phase as fully closed.

### Database
No schema changes. No migration added.
