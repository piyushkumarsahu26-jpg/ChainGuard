# ChainGuard — Final Verification & Stabilization Sprint — Bug Log

Running log, updated as the audit proceeds. Each entry: severity, area, finding, fix status.
Severity: CRITICAL / HIGH / MEDIUM / LOW / NOTE (observation, not a bug)

## Status: AUDIT IN PROGRESS (session 1)

---

## CONFIRMED & FIXED

### [HIGH] Chain of Custody: TRANSPORT_START/TRANSPORT_END/CHECKPOINT never created
**Area:** GPS / Chain of Custody
**Found:** `gps.service.js` never imported or used `custodyRepository` anywhere. `TRANSPORT_START`, `TRANSPORT_END`, and `CHECKPOINT` have existed as real `CustodyEventType` values since early in the project, but `startTransport()`/`stopTransport()`/the checkpoint-detection loop only ever wrote `AuditLog` entries, never `ChainOfCustody` events. Real, visible hole in the custody timeline between preparation and QR verification -- this was found and reported (not fixed) in the prior sprint, when GPS was explicitly off-limits.
**Fix:** Added `custodyRepository.create()` calls at all three points, reusing the exact same pattern used everywhere else in the codebase. `TRANSPORT_START`/`TRANSPORT_END` attributed to the session's own officer (established pattern); `CHECKPOINT` created once per checkpoint reached, matching the original workflow spec's diagram which shows "Checkpoint" appearing multiple times.
**Verified:** syntax + no-undef + full import-graph check + 64/64 tests, no regressions.

---

### [MEDIUM] JWT verification did not explicitly pin the accepted algorithm
**Area:** Security / Authentication
**Found:** `jwt.util.js`'s `verify()` calls relied on `jsonwebtoken`'s default behavior rather than explicitly whitelisting the algorithm. Not currently exploitable (`jsonwebtoken@9.x` already safely rejects `alg: none` and cross-algorithm attacks by default), but explicit algorithm pinning on verify is a standard OWASP defense-in-depth recommendation.
**Fix:** Added `algorithms: ['HS256']` to both `verifyAccessToken`/`verifyRefreshToken`, and `algorithm: 'HS256'` explicitly on both sign functions (same default behavior, now explicit).
**Also found:** this security-critical file had zero test coverage. Added 7 real tests covering sign/verify round-trips, wrong-secret rejection, expired-token rejection, tampered-payload rejection, a hand-constructed `alg:none` token (confirms the hardening fix genuinely works, not just in theory), and refresh/access token cross-use rejection.
**Verified:** all 7 tests pass; full suite unaffected.

---

### [MEDIUM] Analytics `confidence-trend` endpoint had zero validation
**Area:** Backend / Missing validation
**Found:** `GET /analytics/confidence-trend?days=...` had no validator attached at all. `req.query.days` went straight into `Number()` (producing `NaN` for any non-numeric input) and then into a raw SQL query parameter with no check. Not a SQL injection risk -- the query uses Prisma's tagged-template `$queryRaw` form, which auto-parameterizes `${}` interpolations -- but a malformed value would produce an unhandled 500 instead of a clean 400.
**Fix:** Added `backend/src/validators/analytics.validator.js` (this file didn't exist before) with a real `isInt({min:1,max:365})` check, wired into the route.
**Verified:** syntax + no-undef + full suite.

---

### [HIGH] File upload: saved extension derived from unvalidated client input, not the validated mimetype
**Area:** Security / File upload
**Found:** `upload.middleware.js`'s `fileFilter` validates `file.mimetype` (an allowlist check), but the saved filename's *extension* was derived separately from `file.originalname` -- fully client-controlled and never checked against anything. These two client-supplied fields don't have to agree: a client could send `mimetype: image/jpeg` (passing the filter) while setting `originalname: xss.svg` and uploading actual malicious SVG/script content. The saved file would keep the attacker-chosen `.svg` extension. Since `express.static()` (serving `/uploads`) sets `Content-Type` from file extension, this file could be served back as `image/svg+xml` -- SVGs can contain and execute embedded JavaScript, making this a real stored-XSS vector on direct navigation to the uploaded file's URL. `helmet()`'s default `nosniff` header (already present) mitigates some MIME-confusion attacks but does not close this specific one, since the *declared* Content-Type itself would genuinely be SVG.
**Fix:** The saved extension is now derived from `file.mimetype` via a fixed allowlist map (`extensionForMimeType`), never from `originalname`. Confirmed via Multer's documented behavior that `fileFilter` always rejects before `filename` runs for the same file, so by the time the extension is chosen, `mimetype` is guaranteed to be one of the 5 allowed values.
**Verified:** module load-tested directly (this file has no Prisma dependency, so this is a real, live check, not just syntax). 3 new tests confirm every allowed mimetype maps correctly and that no unrecognized mimetype (including `image/svg+xml`, `text/html` explicitly) can produce a real extension even if called directly. Full suite: 74/74 passing throughout this session, no regressions.

---

---

### [HIGH] Privilege escalation: custody scan/verify/handover endpoints had no role-level authorization
**Area:** Security / Broken access control
**Found:** `custody.routes.js` applied `authenticate` on `/scan`, `/verify` (both GET and POST forms), `/handover/initiate`, and `/handover/accept`, but never `authorize(...)`. `VIEWER` and `AUDITOR` are explicitly documented as read-only roles in `custody.service.js`'s own `CUSTODY_ELIGIBLE_ROLES` comment, but nothing actually prevented either from calling any of these four endpoints, each of which performs a real, mutating action (a custody event, a `qrVerifiedAt` write with possible transport auto-completion, or an actual custody transfer). Also found: `/verify`'s own route comment ("read-only, no custody event created") is stale, predating this project's own Phase 7 work that made it genuinely mutating.
**Fix:** Exported the existing `CUSTODY_ELIGIBLE_ROLES` constant (already used for the handover target-officer-role check) from `custody.service.js` and applied it via `authorize(...CUSTODY_ELIGIBLE_ROLES)` at the route layer for all four endpoints -- one role list, reused, not a second one that could drift out of sync. Genuinely read-only routes in the same file (`/handover/pending`, `/search`, `/track`, the plain list) were left open to any authenticated role, correctly.
**Verified:** syntax + no-undef + full import-graph check (confirmed no circular import from the route file now importing the service layer directly) + 74/74 tests, no regressions -- confirming no existing test relied on the over-permissive behavior.

---

### [MEDIUM/DEPLOYMENT] `trust proxy` not configured -- rate limiting may be ineffective behind a real reverse proxy
**Area:** Security / Deployment configuration
**Found:** Neither `app.js` nor `server.js` calls `app.set('trust proxy', ...)`. `express-rate-limit` (and `req.ip` generally) defaults to the raw socket IP. If deployed behind a reverse proxy or load balancer (very common in real production), `req.ip` would resolve to the proxy's own IP for every request -- rate limits would be shared across all real users rather than applied per-client, and IP-based logging (e.g. the QR scan `ipAddress` field) would record the proxy's IP, not the real client's.
**Not fixed, deliberately:** blindly setting `app.set('trust proxy', true)` would itself be a regression if the app is *not* behind a trusted proxy -- an attacker could spoof `X-Forwarded-For` directly to bypass rate limiting and falsify logged IPs. The correct value depends on the real deployment topology, which isn't something to guess at from inside this codebase. Documented here and flagged for the Production Readiness Assessment: set `trust proxy` to the exact hop count once the real deployment topology is known -- never `true` unconditionally.

---

### [HIGH] cookie.secure defaulted insecurely, and .env.example shipped with the insecure value hardcoded
**Area:** Security / Authentication
**Found:** `cookie.secure` (governing whether the httpOnly refresh-token cookie requires HTTPS) defaulted to `false` unless `COOKIE_SECURE=true` was explicitly set -- an easy flag to forget in a real deployment. Made worse by `.env.example` itself hardcoding `COOKIE_SECURE=false`, so even a deployment that carefully copies the example and fills in real secrets would still ship an insecure cookie in production, since the explicit value correctly overrides any code-level default.
**Fix:** `cookie.secure` now defaults based on `NODE_ENV` (secure automatically when `NODE_ENV=production`), extracted into a pure, directly-tested `resolveCookieSecure()`. `.env.example`'s hardcoded value was removed (commented out with an explanation) so the safe default actually takes effect.
**A methodology note worth including**: my first two live-verification attempts both showed the fix failing, and I investigated both fully before concluding anything. The first was my own test error -- deleting `COOKIE_SECURE` from `process.env` caused `dotenv` to treat it as unset and re-populate it from the pre-existing `.env` file. The second attempt, done correctly (removing `.env` from the filesystem entirely), is what surfaced the real `.env.example` finding.
**Verified:** live subprocess tests across 4 real scenarios, both before and after a cleanup pass that removed confusing redundant logic from my first draft. 6 new permanent tests for `resolveCookieSecure`. Full import-graph check (this file is imported almost everywhere). 80/80 tests passing, no regressions.

---

### [CRITICAL] Complete, trivial privilege escalation via self-registration
**Area:** Security / Authentication / Broken access control
**Severity: the most severe finding of this entire audit.**
**Found:** `POST /auth/register` requires no authentication (fully public, as it must be for self-registration). Its validator (`registerValidator`) accepted an optional `role` field, validated only against "is this the name of a real role" (`isIn(ALL_ROLES)`) -- which includes `ADMINISTRATOR`. The controller passed `req.body` directly into `authService.register()`, which destructured `role` from it and passed it straight through to `userRepository.create()` with zero restriction.
**Real-world impact:** anyone, with no account and no prior access of any kind, could send `POST /auth/register` with `{ name, email, password, role: "ADMINISTRATOR" }` and receive a fully privileged Administrator account on this exam-security system -- full access to every envelope, every examination, every user, every alert, and the ability to grant themselves or anyone else any further access. This is about as severe as a broken-access-control finding gets.
**Fix, defense-in-depth at two layers:**
1. **Service layer (the real fix):** `authService.register()`'s signature no longer destructures `role` from its input at all -- `async register({ name, email, password })`. Every self-registered account is now unconditionally created with `role: ROLES.VIEWER` (the lowest-privilege role), regardless of what the request body contains. This isn't just "validation now rejects it" -- the function literally never looks at a `role` field even if one is present in the input object, confirmed directly via Node's own destructuring semantics (an extra property on the input object is silently discarded, not accessible under any name).
2. **Validator layer:** `role` removed entirely from `registerValidator` -- it's no longer a recognized field for this endpoint at all, not even to reject it with a specific error; it's simply not looked at.
**How this connects to what's already correct:** an Administrator can still grant any role to any user, deliberately, via the already-correctly-gated `PATCH /users/:id/role` (`authorize(ROLES.ADMINISTRATOR)`, confirmed unchanged and correct). The fix removes the *unauthenticated* path to the same outcome, not the legitimate one.
**Checked for regressions before considering this done:** confirmed `prisma/seed.js` does not use `authService.register()` at all (creates demo users via direct Prisma calls with their intended roles, unaffected) and confirmed via a full repo-wide grep that `authController.register` is the only caller of `authService.register()` anywhere in the codebase -- nothing else depended on the old role-accepting behavior.
**Verified:** full import-graph check, no-undef sweep, direct confirmation of the destructuring behavior via a standalone Node script, 80/80 tests passing, no regressions.

---

## CHECKED, NO ISSUE FOUND
- Rate limiting exists and is reasonably configured (`authLimiter`: 20/15min; general `apiLimiter`: 300/15min)
- Refresh-token cookie CSRF protection: `httpOnly` + `SameSite=Strict` is genuinely solid, no additional CSRF token mechanism needed
- Error handler: logs `err.stack`/`err.message`, not raw request bodies; stack traces excluded from HTTP responses outside development
- No direct evidence of passwords/tokens being logged via `logger.*()` or `console.log()` calls (grepped for common patterns)
- Privilege escalation via user-management endpoints (`PUT/PATCH /users/:id/*`): correctly gated to `ADMINISTRATOR` only throughout

### [LOW] Path traversal defense-in-depth on QR file generation
**Area:** Security / File handling
**Found:** `generateEnvelopeQr(envelopeCode)` builds a file path directly from `envelopeCode` (`${envelopeCode}.png`) with no sanitization. **Not currently exploitable**: traced the only call site (`envelope.service.js`'s `create()`) and confirmed `envelopeCode` is always system-generated (`ENV-{timestamp}-{random}`), never accepted from a request anywhere in the codebase. But the function itself offered no protection if a future caller (e.g. a hypothetical "regenerate QR" feature) ever passed something less trusted.
**Fix:** Added an explicit rejection of any `envelopeCode` containing a path separator or `..` sequence, at the function's own boundary rather than relying on caller discipline.
**Verified:** 3 new tests (rejects `../` and `..\\` traversal attempts and plain path separators; confirms real envelope codes still work correctly). Full suite passing.

---

### [MEDIUM] `DELETE /envelopes/:id` is a dead endpoint with a confusing error for any real envelope
**Area:** Database / Error handling
**Found:** Traced the full delete path and verified directly against the live database (not assumed from Prisma's documented defaults) that `chain_of_custody`'s foreign key to `envelopes` has `delete_rule = RESTRICT`. This means deleting any envelope that has chain-of-custody history -- which is *every* real envelope, from the `CREATED` event logged the moment it's created -- is rejected by the database itself. No data-integrity risk (custody history genuinely cannot be lost this way), but the endpoint is effectively unusable, and the failure surfaced as a generic, unhelpful "Database request error" (P2003 wasn't handled by the error middleware at all, unlike P2002/P2025).
**Fix:** Added explicit P2003 handling to the global error handler with a clear message, matching the existing pattern for other known Prisma error codes.
**Not changed, and worth flagging as a design question rather than deciding unilaterally:** whether envelopes should be hard-deletable at all is a real question -- this project already uses soft-delete for `User` (`deletedAt`/`isActive`), and an envelope is at least as audit-critical. Left the endpoint's actual behavior alone (fixing only the confusing error message) since removing/redesigning it would be a bigger decision than this audit's "fix actual problems, don't redesign" scope calls for on its own.
**Verified:** syntax + no-undef + full suite, no regressions.

---

## CHECKED, NO ISSUE FOUND (this session)
- **Full database cascade-delete audit, verified directly against the live schema, not assumed**: queried every foreign key's actual `delete_rule` across the entire database. Result: exactly one `CASCADE` in the whole schema (`route_checkpoints` → `transport_routes`, confirmed correct -- checkpoints are part of a route's own definition, not historical data), every audit/historical table (`chain_of_custody`, `detections`, `transport_sessions`, `gps_locations`, `examinations`, `envelope_batches`, `reports`, etc.) uses `RESTRICT` on its required parent relations, and every `SET NULL` is on a genuinely optional field. This is a well-designed schema with respect to referential integrity -- worth stating plainly, not just reporting problems.

### [HIGH] Duplicate active transport sessions possible for the same envelope
**Area:** GPS / Data consistency / Race conditions
**Found:** `startTransport()` checked for an existing active session on the *vehicle* (`findActiveForVehicle`), but had no equivalent check for the *envelope*. Two dispatch requests for the same envelope with two different vehicles could both succeed, creating two simultaneous "active" transport sessions for a single physical envelope -- a logically impossible real-world state (an envelope cannot physically be on two vehicles at once), and exactly the "duplicate transport sessions" risk this audit's GPS section calls out by name.
**Fix:** Added `findActiveForEnvelope()`, mirroring the existing `findActiveForVehicle()` exactly, and a corresponding check in `startTransport()` placed right alongside the vehicle check. Checked against the real session table (not `envelope.transportStatus`, a derived field), for the same reasoning already established for the vehicle-side check: a derived field can theoretically go stale from a partial write, the real active-session query cannot.
**Verified:** syntax + no-undef + full import-graph check + 82/82 tests, no regressions.

---

## CHECKED, NO ISSUE FOUND (this session)
- **QR malformed/garbage input handling**: `decodeQrContent()` explicitly checks `typeof rawText !== 'string'` first, handles non-JSON gracefully via try/catch (returns a structured `{format:'invalid'}` rather than throwing), and explicitly checks for missing required fields after parsing. Genuinely defensive, well-designed code.
- **"No duplicate QR" requirement**: confirmed directly against the live database (not assumed from the schema file) that `qrCode` has a real, database-level unique constraint (`envelopes_qrCode_key`), which is race-condition-proof in a way application-level checks alone are not.

## DOCUMENTED AS A KNOWN, ACCEPTED LIMITATION (not a bug to fix)
- **True QR replay via physical duplication**: if a legitimate, validly-signed QR sticker were physically photographed/copied and attached to a different, fake envelope, the signature would still verify (it's genuinely the same, correctly-signed content). The existing duplicate-scan detection catches "scanned twice in quick succession by different parties" but wouldn't catch a replay happening days or weeks apart. A short-lived signature expiry isn't a fix -- it would break the real use case (a single QR must remain valid across an envelope's entire real-world journey, potentially days, from creation through final delivery). Fully solving this would require a redesign toward one-time-use or challenge-response tokens, out of scope for "fix actual problems, don't redesign." Documented here and for the final Security Report as an inherent tradeoff of signature-based QR authentication, not an oversight.

### [HIGH] QR image upload completely broken -- UI collapse, no verification request sent
**Area:** Frontend / QR Verification
**Reported directly** (real console error and reproduction steps provided, not found via general audit).
**Root cause, traced and confirmed:** `onFileSelected` called `setScannerMode('upload')` and then, synchronously in the same function, immediately tried to construct `new Html5Qrcode('qr-reader-region')` -- the camera's own DOM container id. That element only exists in the JSX branch rendered when `scannerMode` is truthy, but React state updates don't apply to the DOM synchronously -- at the exact moment the constructor ran, the DOM still showed the "choose how to verify" branch, which has no such element at all. This threw "HTML Element with id=qr-reader-region not found", caught by the `catch` block -- but since that block never reset `scannerMode`, the page stayed stuck on the other branch showing only its (empty, non-camera) content and Cancel button, with no verification request ever sent.
**Fix:**
- `onFileSelected` no longer touches `scannerMode` at all -- file decoding uses its own dedicated, unconditionally-rendered hidden element (`qr-file-decode-region`), completely independent of the camera's `qr-reader-region`, confirmed to always exist in the DOM before `onFileSelected` can possibly run.
- A new `decodingFile` state provides a real "Decoding QR Image… Please wait while we read the QR code" loading message shown *within* the same "choose how to verify" screen -- the page never goes blank.
- Wrapped in try/catch/finally; `decodingFile` always resets, so the page can never get stuck.
- Decode failure shows a clear toast rather than a blank page.

**Two additional real bugs found during live end-to-end verification, requested and performed after the initial static-analysis-only fix:**

1. **Camera mode had the exact same structural bug.** `startCamera()` also called `setScannerMode('camera')` then immediately constructed `Html5Qrcode` against an element not yet in the DOM. Confirmed via the `html5-qrcode` library's own source that the element-existence check happens synchronously in the constructor, not inside the later async `start()`/`scanFile()` calls -- meaning this was a deterministic, always-reproducible bug, not an intermittent one. It simply wasn't caught by the original report, which was focused on the upload path. **Fixed** the same way: `qr-reader-region` is now unconditionally rendered too, with visibility/size controlled by CSS based on `scannerMode` rather than conditional rendering.
2. **A real race condition in Cancel.** Clicking Cancel shortly after starting the camera -- a real thing a user can do, not just a test artifact -- threw an uncaught error (`Cannot stop, scanner is not running or paused`) because `scanning` is set `true` immediately in `startCamera()`, before the async `.start()` call actually resolves, and `stopCamera()`'s cleanup (specifically `.clear()`) had no error handling at all. **Fixed** by wrapping the cleanup defensively so it can never throw regardless of the scanner's actual internal state.

**Verified live, not just by static analysis, per explicit request:** the backend cannot be started in this sandbox (confirmed directly -- `prisma generate` and the documented `PRISMA_ENGINES_CHECKSUM_IGNORE_MISSING` workaround both fail, the entire `binaries.prisma.sh` domain is unreachable). Found a genuinely usable path instead: started the real Vite dev server, found a working headless Chromium already installed in this environment, and used Playwright to drive a real browser against the real running frontend, mocking only the backend's HTTP responses (a standard, legitimate testing pattern) rather than the browser or the React app itself.

**10/10 real browser-driven checks passed** on the final run: a real QR image was uploaded and genuinely decoded client-side, a real `POST /custody/verify` request was observed being sent, results displayed correctly, the page never collapsed; an invalid image produced a friendly error with the UI remaining fully usable; camera mode's DOM element exists and Cancel appears and correctly returns to the initial screen with zero errors. One test-mock bug of my own (wrong response shape for an unrelated endpoint, causing a `pendingHandovers.find is not a function` crash) was found, traced back to the real backend's actual code to confirm it was a mock error and not an application bug, and fixed in the test rather than the app. Two console-error checks initially "failed" on a Google Fonts CDN 403 -- confirmed via the network response event (not assumed) to be the *only* 403 on the entire page, and traced to this sandbox's own network allowlist blocking that external domain, unrelated to the application; excluded from the final assertion with the reasoning stated explicitly, not silently.

**Verified additionally:** full `no-undef` check, a clean production build performed after all fixes (not just before), and the full backend test suite (82/82, confirming no cross-cutting regressions) re-run at the end of this session.

## NOT YET AUDITED (remaining scope for subsequent sessions)
- Frontend audit (buttons, modals, dropdowns, routes, loading/error states, console warnings)
- Full database audit (all relations, cascade behavior, orphan-record risk)
- QR audit: replay-attack resistance, malformed/broken QR handling
- AI audit: confidence thresholds, bounding box review, model loading
- Alerts audit: duplicate-alert risk, severity/timestamp correctness
- Full analytics audit (every calculation, not just the one gap found)
- Remaining security: CSRF, rate limiting, path traversal beyond the upload fix, privilege escalation, sensitive logging
- Performance: N+1 queries, memory leaks, large loops/payloads, frontend re-renders
- UX audit
- Full end-to-end re-simulation after all fixes
- The 12 final deliverable reports (only a running bug log exists so far)
