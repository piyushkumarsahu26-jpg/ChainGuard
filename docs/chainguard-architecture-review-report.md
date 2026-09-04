# ChainGuard — Architecture Review Report

**Scope reviewed:** full `backend/src` (all controllers, services, repositories, middleware, routes, validators, utils, config, sockets), `prisma/schema.prisma` + migration + seed, and all of `frontend/src` (pages, services, context, components). `node_modules`, lockfiles, and logs were excluded as not architecturally relevant.

**Headline finding:** the codebase is genuinely further along than a typical capstone-in-progress. The backend follows its own layering rules consistently, not just in the modules that were shown first. There is **one critical issue** (below) — everything else is debt or improvement-grade.

---

## 1. Architecture Strengths

- **Layering discipline is real, not aspirational.** `Route → Controller → Service → Repository → Prisma` is followed in 8 of 9 backend modules (auth, envelope, camera, detection, alert, custody, report, dashboard's routes). Controllers are uniformly thin — they parse, delegate, respond, nothing else.
- **Auth is production-grade.** bcrypt (12 rounds) password hashing, JWT access + refresh tokens, refresh token hashed at rest and rotated on every use, refresh token delivered via `httpOnly`/`sameSite=strict` cookie while the access token travels in the `Authorization` header. This is not a simplified capstone version — it's how you'd do it in a real system.
- **Consistent cross-cutting concerns.** Every endpoint uses the same `ApiError` / `sendSuccess` response envelope; the global error handler specifically translates Prisma error codes (`P2002`, `P2025`) into meaningful HTTP responses and hides stack traces in production. `asyncHandler` means no controller can silently swallow a rejected promise.
- **RBAC is applied thoughtfully, not just present.** The `AI_SYSTEM` role is already threaded through `detection.routes.js` and `camera.routes.js` (heartbeat), which is exactly the seam the future FastAPI service will plug into — this wasn't just designed for humans.
- **Socket.IO reuses the same JWT**, verified at handshake time, rather than inventing a second auth mechanism to maintain.
- **The frontend auth integration is real end-to-end**, not a partial wire-up: axios interceptor with automatic silent refresh-and-retry on 401, session restore on page reload, Socket.IO client authenticated with the same access token, protected routing.
- **Four of eight frontend pages (Dashboard, LiveMonitoring, AlertCenter, AIDetection) are already fully migrated** to real REST + live Socket.IO updates, which proves the intended pattern works end-to-end rather than only in theory.
- **Schema is normalized and indexed sensibly** (`role`, `sealStatus`, `center`, `cameraId + timestamp`, `status`, `severity`) and matches the enums actually used in code — no drift between schema and application logic.
- **Seed script provisions one user per role**, which is exactly what a live demo needs for switching between officer views.
- **Validation runs before business logic**, consistently, via `express-validator` chains + a shared `validate` middleware — no controller trusts unvalidated `req.body`.

---

## 2. Technical Debt

| # | Item | Detail |
|---|---|---|
| D1 | **Evidence pipeline scaffolded but orphaned** | `Evidence` Prisma model, `evidenceRepository`, and `upload.middleware.js` (Multer, with MIME-type filtering) all exist — but nothing calls them. No controller, no route, no service references either. Currently there's no way to actually upload/store evidence through the API. |
| D2 | **User management has no API surface** | `userRepository.list()` exists, but there's no `/api/v1/users` route/controller/service. Admins can't currently list or manage users except via `/auth/register` and `/auth/me`. |
| D3 | **Duplicate "dashboard summary" logic** | `reportService.getDashboardSummary()` is mounted at `/api/v1/reports/dashboard/summary` and computes a subset of figures that overlap with `dashboardService.getSummary()` at `/api/v1/dashboard/summary` — the one the frontend actually calls. The `report.service.js` version looks like an earlier attempt that was superseded but never removed. |
| D4 | **One layering inconsistency** | `dashboard.service.js` imports `prisma` directly for `getActivity()` instead of going through `alertRepository`, breaking the repository pattern that's otherwise clean everywhere else. |
| D5 | **Socket event-naming inconsistency** | Alert resolution re-emits `alert:new` with a `type: 'RESOLVED'` flag instead of a distinct `alert:resolved` event, diverging from the `domain:action` convention used for `camera:offline` and `envelope:updated`. |
| D6 | **Minimal test coverage** | Only two unit test files exist, covering `ApiError` and the pagination helper. No service-, controller-, or integration-level tests exist for auth, envelopes, alerts, detections, or custody. |
| D7 | **Four pages fully on static dummy data** | `Analytics.jsx`, `CameraManagement.jsx`, `Reports.jsx`, `EnvelopeDetails.jsx` import zero services — no backend calls at all yet. |
| D8 | **`Navbar.jsx` reads alerts from dummy data** | Everywhere else alerts come from `alertService`; the notification-bell count in the nav still reads the static array. |
| D9 | **Minor repo hygiene** | A stray `socket.io-client` dependency sits in the *root* `package.json` (should be `frontend/`'s only); a leftover literal folder named `src/{components/layout,...}/` exists in `frontend/src` from an un-expanded brace pattern. Both harmless, both worth a two-minute cleanup. |

---

## 3. Critical Issues

| # | Item | Why it's critical |
|---|---|---|
| C1 | **`AppContext.jsx` imports `../services/authService` (capital S); the actual file is `services/authservice.js` (lowercase).** | This resolves fine on Windows/Mac because their filesystems are case-insensitive — so it will look completely fine in local dev. It **will fail to resolve on Linux, most CI runners, and most container-based deployment targets**, which are case-sensitive. If your demo machine, a grading VM, or any deployment step runs on Linux, the entire app fails to build. This is the one item that could turn a working demo into a broken one with no warning until that moment. |

No other issue found rises to "breaks core functionality or security" — everything else is debt or improvement-grade. **Per your stated plan: since this is the only critical issue and it's a one-line fix, there's no architectural blocker to starting the dummy-data migration next; I'd just fix this first, in passing, since it costs almost nothing.**

---

## 4. Recommended Improvements

- **R1.** Fix the `authService` import casing (pairs with C1 — same fix).
- **R2.** Remove or repurpose `reportService.getDashboardSummary()` — either delete the dead route or explicitly repurpose it (e.g., as a `/reports` filter default) so there's one dashboard-summary source of truth.
- **R3.** Route `dashboard.service.js`'s `getActivity()` through `alertRepository` (extend the repository with a `listRecentWithRelations()` method) instead of importing `prisma` directly.
- **R4.** Rename the alert-resolution socket event to `alert:resolved` for naming consistency.
- **R5.** Wire up `/api/v1/users` (list/update role/deactivate) — needed for any future admin/user-management UI and for Settings.jsx to eventually be real.
- **R6.** Wire the Evidence + upload pipeline into detection/alert creation — this is genuinely good news for the AI phase, since the storage layer already exists and just needs a route.
- **R7.** Add service- and controller-level tests for at least auth, envelope, and alert flows before the codebase grows further — right now a regression in login or alert resolution wouldn't be caught by anything automated.
- **R8.** Repo hygiene: move `socket.io-client` into `frontend/package.json` only, delete the stray brace-expansion folder.
- **R9.** Migrate `Analytics`, `CameraManagement`, `Reports`, `EnvelopeDetails`, and the `Navbar` alert count off dummy data onto the existing (or soon-to-exist) service layer.

---

## 5. Priority Ranking

| Priority | Items |
|---|---|
| **Critical** | C1 (authService import casing) |
| **High** | R9 (finish dummy-data migration — your stated next phase), R6 (wire Evidence/upload pipeline — blocks real AI-detection storage) |
| **Medium** | R2 (duplicate dashboard summary), R5 (User management API), R7 (test coverage), R3 (layering inconsistency in dashboard.service.js) |
| **Low** | R4 (socket event naming), R8 (repo hygiene) |

---

## 6. Development Roadmap

**Phase 0 — Hotfix (small, do first, ~15 minutes total)**
Fix C1 (authService import), R8 (repo hygiene). No design decisions needed, no conflicts to negotiate — trivial and unambiguous. I'd fold this into the start of Phase 1 rather than running it as its own full 10-step cycle.

**Phase 1 — Complete frontend/backend integration (your stated next step)**
Migrate `Analytics`, `CameraManagement`, `Reports`, `EnvelopeDetails`, and `Navbar`'s alert count off dummy data onto real endpoints. Along the way: R5 (wire `/api/v1/users`, since `EnvelopeDetails`/`Reports` need officer lists that currently come from the dummy `officers` array) and R2 (retire the duplicate dashboard-summary route so we don't propagate the confusion into more pages). This phase gets the entire frontend onto one consistent data source before any new module is added.

**Phase 2 — Evidence & upload pipeline (R6)**
Small, self-contained, and a direct prerequisite for the AI module: wire the already-existing `Evidence` model, `evidenceRepository`, and `upload.middleware.js` into an actual controller/route, and attach evidence creation to detection/alert flows. Doing this *before* the AI phase means the AI service has somewhere real to write to on day one instead of that being invented mid-phase.

**Phase 3 — AI FastAPI/YOLOv8 service**
Builds on Phase 2's evidence storage and the existing `AI_SYSTEM` role already wired through `detection.routes.js`. This is where the `ai/` directory from the target architecture gets built out for real.

**Phase 4 — Transport / GPS / Simulation module**
The scenario/simulation engine, GPS replay, and transport tracking — the piece that turns individual working modules into the full printing-press-to-exam-centre story.

**Ongoing, threaded through every phase**: R7 (add tests as each module is touched, rather than as a separate catch-up phase), R3/R4 (fixed opportunistically whenever those specific files are next opened for another reason, per your "extend, don't rewrite for its own sake" principle).

---

Given this, Phase 1 is unblocked — no critical architecture issue stands in its way once the one-line hotfix lands. Ready to start the full 10-step workflow on Phase 1 whenever you are.
