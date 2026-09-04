# ChainGuard — Integration Sprint 3 Implementation Report
## Scanner ↔ Transport ↔ AI ↔ Evidence ↔ Alert Integration

## 1. Investigation performed before writing any code

| Requirement | Finding |
|---|---|
| Scanner only allows scanning `DELIVERED` envelopes | **Confirmed missing** — `envelope.service.js`'s `scan()` had no transport-status check at all; any envelope, regardless of state, could be scanned. |
| Auto-preload transport session/officer/vehicle/timestamp/location | **Confirmed missing** — the scan request only ever captured the logged-in officer; nothing about which transport session, vehicle, or location was involved. |
| Create Detection/Evidence, generate alerts, emit events | **Mostly already true** — the real Scanner→AI→Detection→Evidence pipeline has existed since Sprint AI-4B. But checking the alert-generation logic directly surfaced a real, pre-existing bug (see §2). |
| Update envelope status after inference | **Confirmed missing** — grepped every service for `sealStatus` writes; nothing anywhere updated it based on AI results. |
| Refresh Dashboard/Analytics/Live Monitoring/Security Command Center in real time | **Mixed** — Security Command Center and Live Monitoring already had adequate `detection:new` coverage (checked directly). Dashboard was missing `detection:new`/`evidence:processed` (a gap in my own Integration Sprint 2 work). **Analytics had zero socket listeners of any kind** — confirmed by grepping for `getSocket`/`socket.on` and finding nothing. |

## 2. A real, pre-existing bug found and fixed

`detection.service.js`'s auto-alert logic checked only confidence (`>= 0.75`), never the predicted *class*. A confidently-classified `SAFE` (or `sealed`) detection — meaning no damage at all — would still raise a "suspicious activity detected" alert. This directly contradicts this sprint's own instruction to "generate alerts for tamper detections": a clean read is not a tamper detection, however confident the model was about it. Fixed by requiring the class to actually represent damage (see §3's `isTamperClass()`), in addition to the existing confidence threshold — not by lowering or removing the threshold itself.

## 3. Architectural decisions

**A new shared classification utility, not three copies of the same logic.** `riskScore.service.js` (Sprint 8) already had a private `DAMAGE_SEVERITY` mapping. This sprint needed the same concept in two more places — alert gating and seal-status updates — and copying it a second and third time would have created exactly the kind of drift "no duplicate logic" exists to prevent (three maps that could quietly disagree about what `TAPED` means). Extracted once into `utils/damageClass.util.js` (`damageSeverity`, `isTamperClass`, `sealStatusForPrediction`), and `riskScore.service.js` was updated to import from it instead of keeping its own copy.

**`sealStatusForPrediction()`'s mapping is a documented judgment call, stated plainly rather than hidden in code.** `OPENED` maps to `SealStatus.OPENED` directly. Every other real damage class (`TAPED`/`PARTIAL_DAMAGE`/`CRUSHED`/`TORN`) maps to `TAMPERED`, since none of them literally mean "someone opened it" the way `OPENED` does, but all indicate compromised integrity. `SAFE`/`SEALED` returns "no change" rather than resetting to `SEALED` — a clean AI read shouldn't silently overwrite a status a human officer may have deliberately recorded for a reason a single photo can't see.

**When multiple detections come back from one scan, the most severe implied status wins and cannot be downgraded by a later, less severe one.** Verified this specific behavior with a standalone script across every meaningful ordering (`TORN` then `OPENED` correctly stays `TAMPERED`; `OPENED` then `TORN` correctly upgrades to `TAMPERED`) before trusting it inside the real service.

**`Detection.transportSessionId`/`Evidence.transportSessionId` reuse the existing, real "most recently completed session" rather than inventing new state.** `envelope.service.js`'s `scan()` calls `transportSessionRepository.listByEnvelope()` (Sprint 7, already existed) and picks the session with the latest `endTime` among `COMPLETED` ones — the session that actually delivered this envelope. No new repository method was added.

**Tamper detections now create real `ChainOfCustody` events using `DAMAGED`/`TAMPERED`** — enum values Sprint 7 added to the schema but that no code path had ever actually created until now. This is squarely what "integrate existing modules" means here: connecting a real capability that already existed but sat unused, not building a new one.

**No new pages, services, or endpoints.** Every requirement was satisfiable by extending `envelope.service.js`, `detection.service.js`, `evidence.service.js`, adding one small shared utility, and extending 4 frontend pages' existing data-loading/socket logic.

## 4. Database changes

| Change | Detail |
|---|---|
| `Detection.transportSessionId` (new, nullable) | FK to `TransportSession`, `ON DELETE SET NULL` |
| `Detection.latitude`/`longitude` (new, nullable) | The delivering session's last known position at scan time |
| `Evidence.transportSessionId` (new, nullable) | Same reasoning as Detection's |
| `TransportSession.detections`/`evidence` (new reverse relations) | Required by Prisma for the above |

Applied to and verified against the live Postgres instance directly (`\d detections`, `\d evidence`), not assumed from the migration file's text.

## 5. Files modified

| File | Change |
|---|---|
| `backend/prisma/schema.prisma` | The 4 changes in §4 |
| `backend/src/services/envelope.service.js` | `scan()` rewritten: `DELIVERED` gate, auto-preloaded transport context, `sealStatus` update, real `ChainOfCustody` event, `transportContext` returned in the response |
| `backend/src/services/detection.service.js` | Fixed the alert-generation bug (§2); accepts `transportSessionId`/lat/lon |
| `backend/src/services/evidence.service.js` | Accepts `transportSessionId` |
| `backend/src/services/riskScore.service.js` | Now imports `damageSeverity` from the shared utility instead of its own local copy |
| `frontend/src/pages/EnvelopeScanner.jsx` | Filters the envelope list to `transportStatus === 'DELIVERED'` only; accurate empty-state message; displays the auto-preloaded transport context in the results panel |
| `frontend/src/pages/Dashboard.jsx` | Added `detection:new`/`evidence:processed` listeners (closing a gap from Integration Sprint 2) |
| `frontend/src/pages/Analytics.jsx` | Added real socket listeners — had none before this sprint |

## 6. Files created

- `backend/src/utils/damageClass.util.js`
- `backend/prisma/migrations/20260805100000_scan_transport_linkage/migration.sql`
- `backend/tests/damageClass.util.test.js` — 8 new tests
- This report.

## 7. Verification performed

- Every claim in §1's table checked against the actual code — including grepping for `sealStatus` writes across every service file to confirm the gap was real, not assumed.
- **The severity-picking logic verified with a standalone script** across every meaningful detection ordering, including the specific case that would be wrong if implemented naively (a later, less-severe detection incorrectly downgrading an already-established `TAMPERED` status) — confirmed correct before trusting it in the real service.
- **8 new real tests** for the shared classification utility — including confirming `isTamperClass()`'s result matches `damageSeverity() > 0` exactly for every class, so the two functions can't silently drift apart from each other.
- Migration applied to and verified against the live Postgres instance directly.
- Every modified backend file syntax-checked individually.
- Full import-graph check on every modified/new backend file plus `server.js`/`app.js`.
- **40/40 backend tests passing** (32 pre-existing + 8 new) — no regressions.
- A genuine `node src/server.js` boot attempt, confirmed to fail with the same known, already-documented error — not a new one.
- Every modified frontend file syntax-checked individually, then a full production build (2855 modules, zero errors — unchanged count, every change was an edit to an existing file).

**Not verified**: an actual live scan against a `DELIVERED` envelope — watching the seal status change, the custody event appear, and all four pages update simultaneously in a browser — for the same disclosed Prisma-engine network restriction that has applied to every backend feature verification in this project since Phase 1. The full chain was traced by hand against the real code at every step (including the specific severity-ordering test above), not assumed to work correctly end to end.

## 8. Known limitations

- **The `DELIVERED` gate is enforced correctly on both frontend (filter) and backend (real rejection)**, but a scan attempted via a direct API call against a non-`DELIVERED` envelope returns a `409 Conflict` with a descriptive message rather than any more specific error code — consistent with how every other business-rule rejection in this codebase (e.g. GPS's `pauseTransport` on a non-`ACTIVE` session) already behaves, not a new inconsistency introduced here.
- **`sealStatusForPrediction()`'s OPENED-vs-TAMPERED mapping is a reasonable judgment call, not a specification this project has ever formally defined.** If the actual intended taxonomy differs (e.g., `TAPED` should mean something more specific than generic tampering), this is the one place to adjust it.
- **A scan can only ever reflect one delivering session** — if an envelope somehow has more than one `COMPLETED` session in its history (not a normal flow, but the schema doesn't prevent it), the most recently completed one is used and the others are not considered. Reasonable for how this project's data actually looks today; worth revisiting only if multi-leg transport ever becomes a real feature.
- **`Analytics.jsx`'s and `Dashboard.jsx`'s socket-triggered refreshes are debounced to 2 seconds**, the same deliberate tradeoff from Integration Sprint 2 (genuine real-time behavior vs. not re-fetching an entire analytics/dashboard payload on every single event).

Waiting for direction on the next integration sprint.
