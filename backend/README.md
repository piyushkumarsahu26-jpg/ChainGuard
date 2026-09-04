# ChainGuard Backend

AI Powered End-to-End Examination Paper Integrity Monitoring System — REST + real-time backend.

This service is designed to pair with an existing React + Vite + Tailwind frontend (not included
here) and, later, a FastAPI AI inference service for camera-based detection.

## Tech Stack

- Node.js / Express.js
- PostgreSQL + Prisma ORM
- JWT auth (access + refresh, rotation, RBAC)
- Socket.IO (real-time detection/alert/camera/envelope events)
- Multer (evidence uploads), QRCode (envelope tracking)
- helmet, cors, express-rate-limit, morgan + winston, cookie-parser

## Architecture

```
src/
  config/        env, db (Prisma client), logger, socket registry
  controllers/    HTTP request/response only — no DB access
  services/       business logic
  repositories/   Prisma queries only
  middleware/     auth, rbac, validation, error handling, rate limit, upload
  validators/     express-validator chains per route
  routes/         route wiring per resource
  sockets/        Socket.IO bootstrap + event registration
  utils/          ApiError, ApiResponse, asyncHandler, jwt, qrcode, pagination
  uploads/        evidence + QR images (gitignored, kept via .gitkeep)
prisma/
  schema.prisma   data model
  seed.js         seeds an admin + one officer per role
tests/            node:test unit tests
```

Request flow: **Controller → Service → Repository → Prisma**. Controllers never import Prisma directly.

## Getting Started

```bash
cp .env.example .env
# edit .env: set DATABASE_URL, JWT secrets, etc.

npm install
npx prisma migrate dev   # applies both existing migrations (Phase 1 init + Phase 2 admin/audit)
npm run prisma:seed   # optional: creates default users (see below)
npm run dev
```

Server starts on `http://localhost:5000` (configurable via `PORT`).

### Seeded accounts (password `ChangeMe123!` unless overridden in `.env`)

| Role | Email |
|---|---|
| Administrator | admin@chainguard.local (or `SEED_ADMIN_EMAIL`) |
| Printing Officer | printing.officer@chainguard.local |
| Transport Officer | transport.officer@chainguard.local |
| Exam Center Officer | center.officer@chainguard.local |
| Chief Examination Officer (Phase 2) | chief.examiner@chainguard.local |
| Storage Officer (Phase 2) | storage.officer@chainguard.local |
| Auditor (Phase 2) | auditor@chainguard.local |
| Viewer (Phase 2) | viewer@chainguard.local |

> Change these passwords before any real deployment.

## Roles

`ADMINISTRATOR`, `PRINTING_OFFICER`, `TRANSPORT_OFFICER`, `EXAM_CENTER_OFFICER`, `AI_SYSTEM`
(the AI_SYSTEM role is intended for a service-account JWT issued to the FastAPI inference service).

**Added in Phase 2** (additively — nothing above changed): `CHIEF_EXAMINATION_OFFICER`, `STORAGE_OFFICER`, `AUDITOR`, `VIEWER`. `AUDITOR` (plus `ADMINISTRATOR`) can read `/audit-logs`; every write action under `/users` remains Administrator-only.

## API

Base path: `/api/v1`. See `docs/API.md` for the full endpoint reference and
`docs/ChainGuard.postman_collection.json` for a ready-to-import Postman collection.

## Real-time Events (Socket.IO)

Client connects with `auth: { token: <accessToken> }`. Server emits:
- `detection:new`
- `alert:new`
- `camera:offline`
- `envelope:updated`

## Testing

```bash
npm test
```

## Notes for the FastAPI AI service integration

- Issue the AI service a JWT with `role: "AI_SYSTEM"` (reuse `signAccessToken` or mint one
  out-of-band with the same `JWT_ACCESS_SECRET`).
- The AI service should `POST /api/v1/detections` with `{ cameraId, prediction, confidence,
  boundingBox, imagePath }`. Detections at/above a confidence threshold automatically open an Alert
  and broadcast `detection:new` / `alert:new` over Socket.IO.
