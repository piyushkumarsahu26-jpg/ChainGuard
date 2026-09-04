# ChainGuard — Final Verification & Stabilization Sprint
## Running Findings Log (updated as the audit proceeds)

Status legend: 🔴 confirmed bug, fixed | 🟡 confirmed bug, not yet fixed | 🔵 investigated, not a bug | ⚪ not yet investigated

---

## Security Audit (partial — reviewed prior pass's work + own investigation)

🔴 **JWT algorithm confusion (defense-in-depth)** — `verifyAccessToken`/`verifyRefreshToken` now explicitly pin `algorithms: ['HS256']`. Verified: not currently exploitable given jsonwebtoken@9.x's own safe defaults, but correct standard hardening. New tests in `jwt.util.test.js` include a hand-crafted `alg:none` forgery attempt (built byte-by-byte since `jwt.sign()` refuses to produce one) and a cross-secret forgery attempt — both correctly rejected. Independently verified by reading the test assertions, not just trusting the comment.

🔴 **File upload extension spoofing** — `upload.middleware.js`'s saved filename previously derived its extension from `file.originalname` (fully client-controlled, never validated against the actual checked mimetype). An attacker could pass the mimetype allowlist while choosing an arbitrary extension for the real (malicious) content — served with that extension's Content-Type by `express.static`. Fixed: extension now derives only from the validated mimetype via `extensionForMimeType()`. Verified independently: confirmed Multer's documented execution order (fileFilter runs before filename/destination, and rejection skips storage entirely) actually guarantees `file.mimetype` is already validated by the time the extension is chosen — not just trusting the fix comment's claim. New tests confirm the fallback is safe even without the filter's protection, plus a regression guard on the function's arity (`.length === 1`) to catch any future change that reintroduces a path from `originalname`.

🔵 **SQL injection review of raw queries** — `detection.repository.js`'s `avgConfidenceByDay` uses `$queryRaw` with Prisma's tagged-template form (auto-parameterized), confirmed safe by reading the actual query, not assumed. `analytics.service.js`'s `getQrAnalytics` also uses `$queryRaw` — reviewed, same tagged-template form, same conclusion.

🔴 **Missing input validation on `/analytics/confidence-trend`** — `days` query param went straight into `Number()` then into the raw SQL interval cast with zero validation; a malformed value (e.g. `?days=abc`) would produce `NaN`, which fails Postgres's interval cast and surfaces as an unhandled 500 instead of a clean 400. Fixed with a real validator (`isInt({min:1,max:365})`). Verified by tracing the exact data flow from controller to raw query.

🔴 **Privilege escalation: `/custody/scan`, `/custody/verify` (both forms), `/handover/initiate`, `/handover/accept` had no role-level authorization** — `custody.routes.js` applied `authenticate` (any logged-in user) but never `authorize(...)` on any of these four mutating endpoints. `VIEWER` and `AUDITOR` are explicitly documented elsewhere in the same file (`custody.service.js`'s own `CUSTODY_ELIGIBLE_ROLES` comment) as read-only roles, but nothing actually prevented either from calling `/scan` to create a real custody event, or `/verify` to set `qrVerifiedAt`/write a `VERIFIED` event/auto-complete a transport session — a genuine broken-access-control gap, not just a missing nice-to-have. Also found in passing: the `/verify` route's own comment ("read-only verification, no custody event created") is stale — it predates the Architectural Integration sprint's Phase 7 work, which made this endpoint genuinely mutating. Fixed: exported the existing `CUSTODY_ELIGIBLE_ROLES` list (already used for the handover target-role check) and applied it via `authorize(...)` at the route layer for all four endpoints, reusing the one existing role list rather than maintaining a second one that could drift. `/handover/pending`, `/search`, `/track`, and the plain list route remain open to any authenticated role, correctly, since they're genuinely read-only. Verified: full test suite (74/74) unaffected, confirming no existing test depended on the over-permissive behavior; import-graph checked for circularity given the route file now imports directly from the service layer.

🔴 **Dead/misleading health check** — `systemHealth.service.js`'s storage check called `fs.stat()` but never checked the result; `fs.access()` alone doesn't confirm the path is actually a directory, so a misconfigured `UPLOAD_DIR` pointing at a plain file would have reported "green/writable." Fixed with a real `stat.isDirectory()` check.

## Chain of Custody / GPS Audit

🔴 **Real, confirmed gap, now fixed**: `gps.service.js` never imported or used `custodyRepository` anywhere in the file. `TRANSPORT_START`, `TRANSPORT_END`, and `CHECKPOINT` all exist as real `CustodyEventType` values (some since the very first phase of this project) but were never actually created — only `AuditLog` entries were written. This is the exact gap I found and reported (but deliberately left unfixed, per explicit instruction not to touch GPS) in the prior end-to-end verification pass. Now correctly fixed in all three places (`startTransport`, checkpoint detection, `stopTransport`), each attributed to the transport session's own officer, consistent with the established "no synthetic system user" decision. Verified by reading each of the three fixes in full and confirming correct placement, attribution, and no duplication.

## Dead code / cleanup found

🔵 `custody.service.js`'s `completeTransportIfActive()` had an unused `actorId` parameter (never referenced in the function body — `gps.service.js`'s `stopTransport()` derives the officer from the session itself). Removed cleanly; call site updated to match. Verified: no other call site still passes the old signature.

## Testing

74/74 backend tests passing (up from 64) — 10 new tests added this pass (`jwt.util.test.js`: 7, `uploadMiddleware.test.js`: 3), all genuinely adversarial/rigorous, not superficial happy-path checks. No regressions found in the two files that changed without explicit fix comments.

## Performance Audit (partial — own investigation)

🔴 **N+1 query on the GPS dashboard stats endpoint** — `getDashboardStats()` called `gpsLocationRepository.latestForSession(session.id)` once per active session, sequentially, inside a loop — real N+1 pattern on a frequently-polled dashboard endpoint. Fixed with a new `latestForSessions()` batch method using Postgres's `DISTINCT ON`, which the existing `[sessionId, timestamp]` composite index (already in the schema) makes efficient without needing a new index.

**Verification note worth being explicit about**: while building this fix, I searched externally to verify `Prisma.join()`'s exact behavior rather than rely on training knowledge for a raw-SQL correctness question, and that search surfaced a real, documented Prisma issue (prisma/prisma#18367) where `Prisma.join()` can fail with exactly one array element. A single active transport session is an entirely ordinary case here, not a rare edge — handled with an explicit equality-check fallback for that specific case rather than risk it. Table name (`gps_locations`) and column names verified directly against the schema (no field-level `@map` directives) before trusting the query, not assumed from the Prisma model name.

Screened the other 7 candidate loops found by the same search (grep for `for` loops containing an `await` on a repository/prisma call): all but this one were either pure in-memory iteration (no DB call at all — false positives from the search pattern) or deliberate, already-documented sequential writes (batch envelope creation, the preparation cascade, the per-session watcher) where sequential execution is the actual design goal, not an oversight — reusing an established pattern rather than re-litigating decisions already made and reasoned through earlier in this project.
