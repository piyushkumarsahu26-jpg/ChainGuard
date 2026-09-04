# ChainGuard Backend — API Reference

Base URL: `http://localhost:5000/api/v1`

All responses follow:
```json
{ "success": true, "statusCode": 200, "message": "...", "data": { } }
```
Errors follow:
```json
{ "success": false, "statusCode": 400, "message": "...", "details": [ ] }
```

Authenticated routes require `Authorization: Bearer <accessToken>`.
The refresh token is stored in an httpOnly cookie (`chainguard_refresh_token`), set on login/refresh.

---

## Auth — `/auth`

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/auth/register` | Public | Register a user (`name`, `email`, `password`, `role?`) |
| POST | `/auth/login` | Public | Login (`email`, `password`) → access token + sets refresh cookie |
| POST | `/auth/refresh` | Refresh cookie | Rotates and returns a new access token |
| POST | `/auth/logout` | Bearer | Revokes stored refresh token |
| GET | `/auth/me` | Bearer | Returns the decoded token payload |
| PATCH | `/auth/change-password` | Bearer | Self-service password change (Phase 2) — requires `currentPassword`; logged as `PASSWORD_CHANGED`, distinct from admin-triggered `PASSWORD_RESET` below |

## Envelopes — `/envelopes`

| Method | Path | Roles | Description |
|---|---|---|---|
| POST | `/envelopes` | Administrator, Printing Officer | Create envelope (generates QR + CREATED custody event) |
| GET | `/envelopes` | any authenticated | List (filters: `sealStatus`, `center`, `exam`, `page`, `limit`) |
| GET | `/envelopes/centers` | any authenticated | Distinct exam centers that have envelopes (Phase 1) |
| GET | `/envelopes/:id` | any authenticated | Get one |
| PATCH | `/envelopes/:id` | Administrator, Printing/Transport/Exam Center Officer | Update fields / seal status |
| POST | `/envelopes/:id/scan` | Administrator, Printing/Transport/Exam Center Officer | **Sprint AI-4B.** Multipart image upload (field `file`) — the on-demand Scanner flow: creates an `Evidence` record, submits the image to the AI service, creates one `Detection` per finding (auto-alerting via the existing threshold logic), and broadcasts `evidence:processed` at each stage. Returns `{envelope, evidence, detections, alerts, aiProcessingTimeMs, modelVersion}`. If the AI service is unreachable, the Evidence record is still preserved — only the AI-submission step fails (503). |
| DELETE | `/envelopes/:id` | Administrator | Delete |

## Cameras — `/cameras`

| Method | Path | Roles | Description |
|---|---|---|---|
| POST | `/cameras` | Administrator | Register camera |
| GET | `/cameras` | any authenticated | List (filter: `status`) |
| GET | `/cameras/:id` | any authenticated | Get one |
| PATCH | `/cameras/:id` | Administrator | Update |
| DELETE | `/cameras/:id` | Administrator | Delete |
| POST | `/cameras/:id/heartbeat` | Administrator, AI System | Update status + heartbeat timestamp; broadcasts `camera:offline` when going offline |

## Detections — `/detections`

**Sprint AI-4B**: `cameraId` is now optional — a Detection needs *at least one* of `cameraId` (live/prerecorded feed) or `envelopeId` (manual scan), enforced by validation, not the database schema alone.

| Method | Path | Roles | Description |
|---|---|---|---|
| POST | `/detections` | AI System, Administrator | Submit a detection (`cameraId?`, `envelopeId?` — at least one required); auto-creates an Alert above the confidence threshold |
| GET | `/detections` | any authenticated | List (filters: `cameraId`, `envelopeId`, `prediction`) |
| GET | `/detections/:id` | any authenticated | Get one — includes `camera` and `envelope` relations |

## Evidence — `/evidence` (Sprint AI-4B)

No `POST` route here — Evidence is created internally by `POST /envelopes/:id/scan`, not a direct public upload endpoint (avoids a second, parallel upload path duplicating the AI-submission/detection-creation logic).

| Method | Path | Roles | Description |
|---|---|---|---|
| GET | `/evidence` | any authenticated | List (filters: `envelopeId`, `alertId`) |
| GET | `/evidence/:id` | any authenticated | Get one — includes `filePath`, `hash` (SHA-256 of the stored file), `fileType` |

## AI — `/ai` (Sprint AI-4B)

Thin proxy to the AI service — the frontend never calls the AI service directly, only through these, keeping one auth boundary (Phase 3A design, Step 10).

| Method | Path | Roles | Description |
|---|---|---|---|
| GET | `/ai/health` | any authenticated | Proxies the AI service's `/health` |
| GET | `/ai/models` | any authenticated | Proxies the AI service's `/models` |

## Alerts — `/alerts`

| Method | Path | Roles | Description |
|---|---|---|---|
| POST | `/alerts` | Administrator, AI System | Create manually |
| GET | `/alerts` | any authenticated | List (filters: `status`, `severity`) |
| GET | `/alerts/:id` | any authenticated | Get one |
| PATCH | `/alerts/:id` | Administrator, Exam Center Officer | Update status/severity |
| POST | `/alerts/:id/resolve` | Administrator, Exam Center Officer | Resolve (sets resolvedBy/resolvedTime) |

## Chain of Custody / Tracking — `/custody`

| Method | Path | Roles | Description |
|---|---|---|---|
| POST | `/custody/scan` | any authenticated | QR Scan API — records a new custody event for the scanned envelope |
| GET | `/custody/track/:envelopeId` | any authenticated | Tracking API — full chronological custody history |
| GET | `/custody` | any authenticated | List all events (filters: `envelopeId`, `eventType`) |

## Reports — `/reports`

| Method | Path | Roles | Description |
|---|---|---|---|
| POST | `/reports` | Administrator | Generate a report record (`title`, `type`, `filters?`) — creates a DB record only; PDF/CSV file rendering is not implemented yet, `filePath` stays `null` until a later phase |
| GET | `/reports` | any authenticated | List (filter: `type`) |

## Dashboard — `/dashboard`

| Method | Path | Roles | Description |
|---|---|---|---|
| GET | `/dashboard/summary` | any authenticated | Aggregate counts for the Mission Control / Dashboard homepage |
| GET | `/dashboard/activity` | any authenticated | Recent cross-module activity feed |

## Users / Administration — `/users` (Phase 1 read endpoints + Phase 2 CRUD)

Soft-deleted users (`deletedAt` set) are excluded from `list`/`search`/`officers` by default. Pass `includeDeleted=true` on `list`/`search` to include them.

| Method | Path | Roles | Description |
|---|---|---|---|
| GET | `/users/officers` | any authenticated | Lightweight `{id, name, role}` roster for dropdowns — no email/status exposed |
| GET | `/users/search` | Administrator | Same query/filters as `list`, dedicated path per the Phase 2 spec |
| GET | `/users` | Administrator | Full paginated user list. Query: `q`, `role`, `isActive`, `department`, `center`, `sortBy`, `sortDir`, `page`, `limit`, `includeDeleted` |
| POST | `/users` | Administrator | Create a user (`name`, `email`, `password`, `role`, plus optional `employeeId`/`department`/`designation`/`phone`/`assignedCenter`). Sets `createdById` to the acting admin. Audit: `USER_CREATED` |
| GET | `/users/:id` | Administrator | Single user, full profile (password hash / refresh token stripped) |
| PUT | `/users/:id` | Administrator | Update profile fields only (name/employeeId/department/designation/phone/assignedCenter) — role, status, and password each have their own endpoint below. Audit: `USER_UPDATED` |
| PATCH | `/users/:id/status` | Administrator | `{ isActive: boolean }` — activate/deactivate. Cannot target your own account. Audit: `ACCOUNT_ACTIVATED` / `ACCOUNT_DEACTIVATED` |
| PATCH | `/users/:id/role` | Administrator | `{ role }` — change role. Cannot target your own account (prevents accidental self-lockout from the only admin). Audit: `ROLE_CHANGED` (records from/to) |
| PATCH | `/users/:id/password-reset` | Administrator | `{ newPassword }` — no current-password check (admin authority). Also revokes the user's stored refresh token. Audit: `PASSWORD_RESET` |
| PATCH | `/users/:id/restore` | Administrator | Restores a soft-deleted user. **Not in the Phase 2 spec's literal endpoint list** — added because "Restore User" is a required lifecycle action with no listed route. Audit: `USER_RESTORED` |
| DELETE | `/users/:id` | Administrator | **Soft delete** (sets `deletedAt`), not a hard delete — user history and every foreign-key reference stays intact. Cannot target your own account. Audit: `USER_DELETED` |

## Audit Logs — `/audit-logs` (Phase 2)

**Not in the Phase 2 spec's literal endpoint list** — added because "Audit Logging" is a required section with no way to retrieve the log otherwise.

| Method | Path | Roles | Description |
|---|---|---|---|
| GET | `/audit-logs` | Administrator, Auditor | Paginated, filterable by `action`, `actorId`, `targetUserId`, `from`, `to` |

## Analytics — `/analytics` (Phase 1)

Real aggregations over stored `Detection`/`Alert`/`Camera` rows — no synthetic or hardcoded figures. Endpoints legitimately return empty arrays on a database with no AI-generated detections yet; that's expected until the AI service (Phase 3) is producing data, not a bug.

| Method | Path | Roles | Description |
|---|---|---|---|
| GET | `/analytics/scans-by-month` | any authenticated | Detection counts grouped by month |
| GET | `/analytics/tamper-breakdown` | any authenticated | Detection counts grouped by `prediction` |
| GET | `/analytics/confidence-trend?days=30` | any authenticated | Average `Detection.confidence` per day, as a percentage — labeled "confidence", not "accuracy", since there's no ground-truth comparison stored |
| GET | `/analytics/center-risk` | any authenticated | Alert counts grouped by the linked envelope's exam center (inner join — alerts with no `envelopeId` aren't counted) |
| GET | `/analytics/camera-status` | any authenticated | Live current status per camera (not historical uptime — no such table exists) |

## Health — `/health`

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/health` | Public | Liveness + DB connectivity check |

---

## Socket.IO Events (server → client)

- `detection:new` — `{ detection }`
- `alert:new` — `{ alert, type? }`
- `camera:offline` — `{ camera }`
- `envelope:updated` — `{ type, envelope | event }`
- `evidence:processed` — **Sprint AI-4B.** `{ status: 'PROCESSING'|'FAILED'|'COMPLETE', evidence, envelopeId, error?, detectionCount?, alertCount? }` — emitted at each stage of `POST /envelopes/:id/scan` (upload received, AI call failed, or scan complete), so a connected client sees scan progress without polling.

Connect with: `io(url, { auth: { token: accessToken } })`
