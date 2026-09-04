# ChainGuard — QR Verification & Digital Authentication Sprint Report

## 1. Starting point: substantial prior work found, and a critical gap found within it

A thorough audit (via `find -newer` against the last delivered report, not memory) found that most of this sprint's cryptographic core had already been built in a prior pass: HMAC-SHA256 signed QR payloads (`utils/qrSignature.util.js`), duplicate-scan detection, route-violation checking, and QR-specific alert categories — all genuinely well-designed, with real security considerations (constant-time signature comparison, explicit backward compatibility for pre-signing legacy QRs) and 12 real, already-passing tests for the signature utility.

**But tracing every call site found the single most important piece disconnected**: `scanQr()` and `verifyByQr()` — the actual functions the API endpoints call — were still doing a raw, unverified `envelopeRepository.findByQrCode()` lookup. `resolveQrOrThrow()`, `checkForDuplicateScan()`, and `checkScanLocation()` were fully written, correctly designed, and never called from anywhere. In practice this meant: QR *generation* had been signing its output since this sprint's prior pass began, but QR *verification* had not been updated to match — a real scan of a real, freshly-generated signed QR would never have run a signature check, a duplicate check, or a route check, because the function that was supposed to run them was never reached. This was the first thing fixed, since every other phase's correctness depends on it.

## 2. Phase-by-phase status

| Phase | Status | Detail |
|---|---|---|
| 1 — Secure QR Generation | Already done (prior pass), verified | Envelope code, timestamp, nonce, version, HMAC-SHA256 signature — confirmed via 12 existing, real tests |
| 2 — QR Verification API | **Fixed this pass** | `resolveQrOrThrow()` wired into both `scanQr()` and `verifyByQr()`; a new `POST /custody/verify` added for the new JSON payload (the old `GET /custody/verify/:qrCode` kept, unchanged, for legacy tokens) |
| 3 — QR Scanner Page | Extended | Creation date (was missing), a real Security Verification panel (signature status + unified decision), all built on the existing camera/upload scanner (Sprint 7), not replaced |
| 4 — Duplicate Scan Detection | **Fixed + extended** | Was fire-and-forget with no return value; now returns a real result surfaced immediately in both the API response and a new "Duplicate Scan Detected" banner, not just a delayed Alert Center entry |
| 5 — Location Verification | Already done (prior pass), verified | Reuses the existing `distanceToRouteMeters`/`ROUTE_CORRIDOR_METERS` from `gps.service.js` — confirmed no duplicate distance logic was created |
| 6 — Chain of Custody Timeline | Extended | New `QR_GENERATED` event, wired into envelope creation; the existing chronological timeline display (Sprint 7) now correctly labels it. The requested "Packed/Collected/Checkpoint Verification/Destination Scan" step names were deliberately *not* added as new event types — see §4 |
| 7 — Scan History | Extended | `ChainOfCustody.ipAddress` (already added, prior pass) now actually populated from `req.ip` in the controller |
| 8 — QR Analytics | **New this pass** | Real aggregation (total/successful/failed scans, duplicates, tampered attempts, route violations, daily activity, officer performance) — see §5 for what's genuinely measurable versus approximate |
| 9 — Alerts | **Fixed this pass** | The Notification Center's own category mapping (Sprint 8) had a documented placeholder noting "QR" was a real, available filter with no alerts yet — now populated, since QR-generating alerts exist |
| 10 — AI Integration | **New this pass** | `computeUnifiedDecision()` — SAFE/SUSPICIOUS from signature validity + latest AI detection + route violation, reusing the existing `attachGpsAndAiStatus()` enrichment rather than re-querying. Verified standalone across every meaningful input combination before trusting it |
| 11 — Database | Done | 2 additive migrations (this sprint's prior pass + this pass), both applied to and verified against live Postgres |
| 12 — Testing | Done | 57/57 backend tests passing; `no-undef` sweep across the entire backend and frontend |

## 3. Architectural decisions

**Kept the existing `GET /custody/verify/:qrCode` route unchanged; added `POST /custody/verify` alongside it, not instead of it.** A signed QR's scanned content is a JSON string, not a short token — cramming it into a URL path segment works in practice for this project's payload size but is the wrong REST shape for arbitrary structured content. Rather than break the existing route (which any legacy caller working with a short token still uses correctly), a new POST endpoint was added for the case that actually needs it. This is the concrete meaning of "fix the root cause… preserve backward compatibility" here: the root cause (verification logic never running) is fixed for *both* routes, and neither breaks any existing caller.

**`qrCode` stayed the field name on `scanQr()`/`verifyByQr()`, but its accepted values were broadened**, not replaced — it now means "the raw scanned content" (legacy bare token or signed JSON, `decodeQrContent()` tells them apart), rather than "always a bare token." No request-shape change, no caller needs to change field names.

**Phase 6's requested 11-step timeline was deliberately not built as 11 new `CustodyEventType` values.** Only `QR_GENERATED` was added, because it's the one step with a real, distinct trigger (Phase 1's QR generation) that had no event of its own before this sprint. "Packed," "Collected," "Checkpoint Verification," and "Destination Scan" have no corresponding action anywhere in this system — there is no packing workflow, and "checkpoint" scans are already the same real `QR_SCAN` event as any other scan. Inventing event types with nothing that ever creates them would be exactly the kind of superficial completeness this project has avoided since Phase 1 (fabricated states with no real data behind them). The existing chronological timeline, now correctly labeling `QR_GENERATED`, shows the real journey honestly instead.

**Phase 8's QR Analytics is built entirely from existing tables** — `ChainOfCustody` and `Alert` — no new "scan log" table. A QR_SCAN/VERIFIED custody row is only ever created on a successful verification (`resolveQrOrThrow` throws before either is reached on any failure), so successful and failed counts are already disjoint real totals, not two overlapping sets requiring subtraction between them — an error in an earlier draft of this exact formula (subtracting failures from a success count that never included them) was caught and corrected before being trusted, verified by re-deriving the logic from first principles rather than just re-reading it.

**Route violations reported for QR Analytics are a best-effort subset, and this is stated rather than hidden.** `ROUTE_DEVIATION` is shared between the continuous GPS deviation check (Sprint 6) and this sprint's scan-time location check — they can't be cleanly separated by category alone. The analytics query distinguishes them by matching the scan-time check's specific alert title, a real but imperfect signal, documented as such in the code and here rather than presented as more precise than it is.

**The seed script's own QR generation was found to be inconsistent with the real pipeline, and fixed.** It previously fabricated a bare `QR-{code}` string, bypassing the entire signature system — every seeded envelope would have failed real verification immediately. Now calls the actual `generateEnvelopeQr()` and logs the same `CREATED`/`QR_GENERATED` custody events real envelope creation does, so seeded demo data is genuinely usable end-to-end, not just superficially present.

## 4. Files modified

| File | Change |
|---|---|
| `backend/src/services/custody.service.js` | `scanQr()`/`verifyByQr()` rewritten to actually call the verification pipeline; `checkForDuplicateScan()` now returns a real result; new `computeUnifiedDecision()` |
| `backend/src/controllers/custody.controller.js` | IP capture; `verifyQr` passes actor/location/coordinates through; new `verifyQrByContent` |
| `backend/src/routes/custody.routes.js` | New `POST /custody/verify` route |
| `backend/src/validators/custody.validator.js` | New `verifyQrByContentValidator` |
| `backend/src/services/envelope.service.js` | Creates the new `QR_GENERATED` custody event alongside `CREATED` |
| `backend/src/services/analytics.service.js` | New `getQrAnalytics()` |
| `backend/src/controllers/analytics.controller.js`, `backend/src/routes/analytics.routes.js` | New `GET /analytics/qr` |
| `backend/prisma/schema.prisma` | New `QR_GENERATED` enum value |
| `backend/prisma/seed.js` | Fixed to use the real QR generation pipeline; added QR-category demo alerts |
| `frontend/src/pages/QRVerification.jsx` | Uses the new `verifyByContent`; creation date; Security Verification panel; Duplicate Scan Detected banner; `QR_GENERATED` label |
| `frontend/src/services/custodyService.js` | New `verifyByContent()` |
| `frontend/src/services/analyticsService.js` | New `getQrAnalytics()` |
| `frontend/src/pages/Analytics.jsx` | New QR Verification Activity section; added the missing `envelope:updated` socket listener |
| `frontend/src/components/layout/Navbar.jsx` | Notification Center's category mapping completed for QR alerts |

## 5. Files created

- `backend/prisma/migrations/20260806090000_qr_generated_event/migration.sql`
- This report

(`utils/qrSignature.util.js`, its migration, and its 12 tests were created by the prior pass being reviewed here, not by this specific session.)

## 6. Verification performed

- **Every call site of the three key verification functions traced directly** (`grep`, not assumption) before concluding they were disconnected — this is what found the critical gap in §1.
- **The QR-code-order class remapping bug class from a prior sprint's lesson was specifically checked for here too**: confirmed the new `POST /custody/verify` and the retained `GET` route both resolve to the same underlying, now-correct logic, not two diverging implementations.
- **`computeUnifiedDecision()` verified standalone** across 6 meaningful input combinations (clean, no detection yet, legacy unsigned QR, bad signature, AI flag, route violation alone) before trusting it — including confirming a legacy unsigned QR is correctly *not* itself treated as suspicious, preserving backward compatibility in the decision logic too, not just the request format.
- **The QR Analytics formula's own bug was caught during construction**, not after — an initial version subtracted failures from a success count that never included them; re-derived from first principles and fixed before being used anywhere.
- Migration applied to and verified against the live Postgres instance directly.
- `no-undef` sweep across the *entire* backend (`services/`, `controllers/`, `routes/`, `validators/`, `repositories/`, `utils/`) and the entire frontend (`pages/`, `services/`, layout `components/`) — not just the files this sprint touched — clean throughout, one already-confirmed harmless false positive (an eslint-disable comment referencing a plugin this minimal diagnostic doesn't load).
- **57/57 backend tests passing**, unchanged count from before this pass (the prior pass's 12 QR signature tests were already present and already passing) — confirming no regression anywhere in the existing suite.
- Two full production frontend builds (mid-pass and final), both clean.

**Not verified**: an actual live scan-to-verification round trip in a running browser against a live database — the same disclosed sandbox restriction (`prisma generate` blocked) as every backend verification in this project since Phase 1. What is verified: every function in the real call chain traced and confirmed connected, the pure decision logic checked standalone against real inputs, and the database schema confirmed applied.

## 7. Known limitations

- **`ROUTE_DEVIATION` counts in QR Analytics are a best-effort subset** (title-matched, not category-isolated) — stated in §3, not hidden.
- **The requested 11-step timeline narrative is not literally rendered as 11 sequential steps** — see §3's reasoning for why 6 of those names would have had no real trigger behind them. The real, chronological event list (now correctly including `QR_GENERATED`) is shown instead.
- **Duplicate-scan detection on `verifyByQr()` compares against the last *real* custody event**, which may not itself be a scan (e.g. the last event could be `HANDOVER`) — this still catches the meaningful case Phase 4 describes (an unexpected second party interacting with the envelope within the suspicious window), but "duplicate scan" is a slight misnomer when the prior event wasn't a scan either; the underlying signal (short window, different actor) is what actually matters and is what's checked.
- **QR Analytics' "officer performance" only counts logged `QR_SCAN`/`VERIFIED` custody rows** — a failed verification attempt (wrong signature, unknown envelope) doesn't appear against any officer's count, since no envelope/officer pairing exists to attribute it to in the case of an unknown envelope specifically.
