# ChainGuard — Repository Architecture (Part 2A)
**Status:** Target architecture, reconciled against the stated existing stack
**Principle:** Existing code is the foundation. Nothing below implies a rewrite — it implies a destination that current modules grow into.

---

## 0. How to read this document

Every folder below is tagged:

- `[EXISTING]` — you've said this already exists in some form (Auth, Dashboard, Live Monitoring, Alerts, Analytics, Reports, Socket.IO, Camera, AI Detection). These get **extended**, not replaced.
- `[TARGET]` — not yet built. These are added incrementally, in later spec parts, without disturbing `[EXISTING]` folders.
- `[RECONCILE]` — likely exists already under a different name/shape. Needs your actual file tree to map correctly instead of guessing.

This lets you diff your real repo against this doc later instead of trusting it blindly.

---

## 1. Monorepo Root

```
ChainGuard/
├── README.md
├── LICENSE
├── CHANGELOG.md
├── .env.example
├── .gitignore
├── docker-compose.yml
├── docs/                     [TARGET]
├── frontend/                 [EXISTING - extend]
├── backend/                  [EXISTING - extend]
├── ai/                       [EXISTING - extend]
├── simulation/                [TARGET]
├── datasets/                  [TARGET]
├── scripts/                   [TARGET]
├── deployment/                 [TARGET]
├── tests/                      [TARGET]
└── assets/                      [TARGET]
```

**Why simulation/ is a sibling of backend/, not inside it:** the simulation engine (GPS replay, route playback, prerecorded CCTV feeds) must be runnable and testable independently of the API server, and must feed data *into* the backend the same way real hardware eventually would. Treating it as a peer service — not a folder buried inside `backend/utils` — is what makes the "swap simulation for real hardware later" story actually true rather than aspirational.

---

## 2. Frontend — `frontend/src/`

```
frontend/src/
├── api/                      [RECONCILE — likely your existing api.js lives here]
│   ├── client.js              (axios instance, interceptors)
│   ├── endpoints/
│   └── socket.js               (Socket.IO client bootstrap)
├── assets/
├── components/                (truly generic, cross-feature UI only: Button, Modal, Table, Skeleton)
├── contexts/                  [RECONCILE — likely where AppContext.jsx lives]
├── config/
├── constants/
├── features/
│   ├── authentication/        [EXISTING]
│   │   ├── components/          (Login.jsx, etc.)
│   │   ├── hooks/
│   │   ├── services/            (authService.js)
│   │   └── types/
│   ├── missionControl/        [TARGET — becomes the new homepage]
│   ├── dashboard/              [EXISTING]
│   ├── liveMonitoring/         [EXISTING]
│   ├── scanner/                [EXISTING — AI Detection module UI]
│   ├── camera/                 [EXISTING]
│   ├── storage/                [TARGET]
│   ├── transport/              [TARGET]
│   ├── gps/                    [TARGET]
│   ├── vehicles/               [TARGET]
│   ├── alerts/                  [EXISTING]
│   ├── timeline/                 [TARGET — Chain of Custody]
│   ├── analytics/                [EXISTING]
│   ├── reports/                    [EXISTING]
│   ├── settings/                    [TARGET]
│   ├── userManagement/               [TARGET]
│   ├── roleManagement/                [TARGET]
│   ├── qrManagement/                    [TARGET]
│   └── demo/                              [TARGET — Demo Mode / Professor Mode]
├── hooks/                       (shared hooks: useSocket, useAuth, usePermission)
├── layouts/
├── pages/                       (route-level composition only — no business logic)
├── routes/                       (route table + role-based route guards)
├── services/                       (cross-feature services only, e.g. notification toasts)
├── store/                            (global state — see §5 on state management decision needed)
├── styles/
├── types/
└── utils/
```

Each `features/<name>/` folder is self-contained: its own `components/`, `hooks/`, `services/`, `types/`. A feature never reaches into another feature's internals directly — cross-feature communication goes through `store/`, `contexts/`, or Socket.IO events, never a direct import of `features/transport/components/X` from inside `features/timeline/`.

**Migration note for your current files:** `api.js`, `authService.js`, `AppContext.jsx`, and `Login.jsx` map onto `api/client.js`, `features/authentication/services/authService.js`, `contexts/AppContext.jsx`, and `features/authentication/components/Login.jsx` respectively. Moving them (if they aren't already there) is a mechanical relocation, not a rewrite — file contents stay identical, only paths and imports change. We do this later, not now, and only with the real files in front of us.

---

## 3. Backend — `backend/src/`

```
backend/src/
├── config/                    (env loading, constants, thresholds — nothing hardcoded)
├── routes/                    [EXISTING — extend]
│   └── (kebab-case route files: auth-routes.js, envelope-routes.js, transport-routes.js…)
├── controllers/               [EXISTING — extend]
│   (thin: parse request → call service → shape response. No business logic.)
├── services/                  [EXISTING — extend]
│   (all business logic lives here)
├── repositories/              [TARGET — introduces a clean data-access layer]
│   (wraps Prisma calls; controllers/services never call `prisma.*` directly)
├── middlewares/               [EXISTING — extend]
│   (auth guard, role guard, error handler, request logger)
├── validators/                [TARGET]
│   (schema validation per route, e.g. zod/Joi)
├── socket/                    [EXISTING — extend, but restructure internals]
│   ├── events/                (typed event name constants — single source of truth)
│   ├── handlers/               (inbound events from clients)
│   └── emitters/                (outbound events to clients — services call these, not `io.emit` directly)
├── jobs/                        [TARGET]
├── cron/                          [TARGET — e.g. scheduled ETA recalculation]
├── database/
│   └── prisma/                 [EXISTING — extend schema, never break existing models]
│       └── seed/
├── logs/                          [TARGET — structured logging, see §7]
├── storage/                        [EXISTING — extend]
│   ├── images/
│   ├── reports/
│   ├── detections/
│   └── uploads/
├── ai/                                [TARGET — thin HTTP client to the AI FastAPI service]
├── gps/                                 [TARGET — ingests simulated or real GPS events]
├── simulation/                            [TARGET — bridge that consumes simulation/ engine output]
└── utils/
```

**Key architectural rule carried over from your existing JWT setup:** `middlewares/auth.js` (access token verification) and the refresh-token flow stay exactly as they are once integrated — every new module (transport, gps, timeline) sits *behind* that same middleware and role-guard, it doesn't get its own auth logic.

**Layering discipline (this is the one rule most capstone projects violate under deadline pressure):**

```
Route  →  Controller  →  Service  →  Repository  →  Prisma  →  PostgreSQL
                              ↓
                        Socket Emitter (side-effect, not a return value)
```

A controller never touches Prisma. A route never contains an `if`. This is what lets a professor open any file and understand it in isolation — and it's what lets you truthfully say "production-grade" without it being marketing language.

---

## 4. AI Service — `ai/` (independent Python project)

```
ai/
├── datasets/
│   ├── generator/            (synthetic envelope image generator)
│   ├── collector/             (ingests your real captured images later)
│   ├── validator/
│   └── augmentation/           (Albumentations pipelines)
├── training/
│   ├── configs/                (YOLOv8 hyperparameter configs — no hardcoded values in code)
│   └── scripts/
├── evaluation/
│   └── metrics/                    (mAP, precision/recall per damage class)
├── models/
│   └── weights/                      (versioned .pt / exported .onnx)
├── fastapi/
│   ├── main.py
│   ├── routers/
│   │   ├── image_inference.py
│   │   ├── webcam_inference.py
│   │   └── video_inference.py
│   └── schemas/
├── inference/
│   ├── image/
│   ├── webcam/
│   └── video/                      (this is what also processes prerecorded CCTV footage — same code path as live camera)
├── utils/
├── config/
├── notebooks/
├── experiments/
└── exports/
```

**Why prerecorded CCTV goes through `inference/video/` and not a separate mock path:** this is the load-bearing design decision behind your "realistic simulation, not fake results" principle. A prerecorded storage-room video and a live RTSP camera feed both become a sequence of frames handed to the same YOLO/OpenCV pipeline. The AI never knows or cares whether the frames came from a webcam or an MP4 — which means the detections, confidence scores, and evidence images in the demo are *real model output*, not scripted. That's the difference between simulation and faking it, and it's worth preserving carefully as we build this out.

The AI service runs standalone (its own `.env`, own FastAPI process) and is called by `backend/src/ai/` over HTTP — it never imports backend code and the backend never imports Python. That boundary is what makes "future AI models addable without changing architecture" actually true.

---

## 5. Simulation Engine — `simulation/`

```
simulation/
├── gps/
│   ├── routes/                (replayable route JSON — lat/lng/timestamp sequences)
│   └── replay/                  (playback engine: emits position ticks at configurable interval)
├── transport/
│   └── sessions/                 (simulated vehicle/trip state machines)
├── storage/
│   └── events/                     (simulated storage-room activity events)
├── cameras/
│   └── videos/                       (prerecorded footage manifest, mapped to virtual camera IDs)
├── scenarioEngine/
│   ├── scenarios/                     (JSON/YAML scenario definitions: envelope scan → storage → transport → deviation → arrival)
│   └── player/                         (drives a scenario from step to step, timed or manual-advance)
├── alerts/                               (rule engine: deviation thresholds, delay thresholds — reads config, not hardcoded)
├── timeline/
├── missionControl/
└── demo/
    ├── professorMode/
    └── reset/                                (returns DB + simulation state to a known-good baseline between demo runs)
```

**Open design question, needs your decision before Part 2B builds this out:** should `simulation/` run as its own lightweight Node process (own `package.json`, own `.env`, communicates with `backend/` via internal HTTP calls or a message queue) — or as a library imported directly into the backend process? Running it standalone matches the "independent module" principle from your spec and makes "replace simulation with real GPS hardware later" a matter of swapping one service for another with the same event contract. Running it embedded is faster to build for a capstone deadline and has fewer moving parts to demo-day-debug. I'd lean toward **standalone process, but sharing the Prisma client/schema** as a middle ground — worth deciding before backend integration work starts, since it affects the socket/emitter structure above.

---

## 6. Supporting Directories

```
datasets/            synthetic/ real/ training/ validation/ testing/ — versioned, matches ai/datasets/ consumers
docs/                Architecture/ API/ Database/ AI/ Deployment/ Frontend/ Backend/ Testing/ UserGuide/ ProfessorDemo/
assets/              logos/ icons/ fonts/ illustrations/ demo/ (demo videos, sample envelope images)
deployment/          docker/ nginx/ production/ development/ monitoring/
tests/               frontend/ backend/ ai/ integration/ demo/
scripts/             one-off ops scripts (db reset, demo seed, dataset generation triggers)
```

---

## 7. Dependency Map

**Frontend** (extends existing): react, vite, tailwindcss, react-router-dom, framer-motion, lucide-react, recharts, socket.io-client, axios.
*New, needs a decision:* a global state library. Context alone (your existing `AppContext.jsx`) tends to strain once GPS ticks, socket events, and multi-role permissions all need to update the UI reactively — zustand is a light addition that plays well with Socket.IO event streams without adding Redux-level ceremony. Flagging this rather than deciding it for you, since it touches a file you already have conventions around.

**Backend** (extends existing): express, prisma, jsonwebtoken, bcrypt, socket.io, multer.
*New additions to support Part 2A's structure:* a schema validation library (zod, since it pairs cleanly with TypeScript-style types even in a JS codebase), a structured logger (winston or pino) to satisfy the "everything logged" requirement, pdf generation (puppeteer for layout fidelity, or pdfkit for lighter weight — puppeteer if reports need to visually match a designed template, pdfkit if speed matters more), helmet + express-rate-limit for the security folder, node-cron for the cron/ folder.

**AI service**: fastapi, uvicorn, ultralytics (YOLOv8), opencv-python, torch, numpy, albumentations, onnx / onnxruntime, pillow.

**Simulation engine** (if standalone Node process, per §5): express (minimal internal API), same Prisma client as backend (shared schema), a small scheduler for tick-based replay (or plain `setInterval`/`setTimeout` chains — no need for a heavy job queue at this scale).

---

## 8. Integration Flow — how a scene actually moves through the system

Using Scene 1 (envelope scan at the printing press) as the concrete example, since it touches every layer:

```
1. Officer captures/uploads envelope image
   frontend/features/scanner  →  api/client.js  →  backend routes/envelope-routes.js

2. backend/controllers/envelopeController.js
   receives request, calls service — no logic here

3. backend/services/envelopeService.js
   → backend/ai/ (HTTP client) → ai/fastapi/routers/image_inference.py
   → YOLOv8 model returns: { class: "TORN" | "SAFE" | ..., confidence, boxes }

4. Service persists result:
   backend/repositories/envelopeRepository.js → Prisma → PostgreSQL
   (envelope record, detection evidence path, QR code, timestamp)

5. Service triggers side effects via socket emitter, not directly:
   backend/socket/emitters/envelopeEmitter.js → io.emit('envelope:scanned', payload)

6. Frontend receives via hooks/useSocket:
   → updates features/dashboard, features/missionControl, features/timeline live,
     without a page refresh

7. Chain of Custody entry created:
   backend/services/timelineService.js appends the event —
   every subsequent scene (storage, transport, arrival) appends to the same timeline,
   which is what reports/ later reads to generate the full PDF.
```

The same shape — Route → Controller → Service → (AI or Simulation call) → Repository → Emitter → Frontend — repeats for storage monitoring, transport/GPS, and arrival verification. The only thing that changes per scene is *which* service and *which* external call (AI inference vs. simulation engine tick vs. GPS replay event). That consistency is what makes Part 2A's "every feature must integrate with every other feature" requirement achievable rather than aspirational — there's exactly one integration pattern to learn, not seventeen.

---

## 9. Module Relationship Matrix

| Frontend feature | Backend module | External dependency | Key DB entities |
|---|---|---|---|
| authentication | routes/controllers/services: auth | — | User, RefreshToken |
| scanner | envelope | ai/ (FastAPI inference) | Envelope, Detection |
| liveMonitoring / camera | storage | ai/ (video inference, live or prerecorded) | Camera, StorageEvent |
| transport / gps | transport, gps | simulation/ (route replay) | Vehicle, Trip, GpsPing |
| alerts | alerts | rule engine (reads transport + storage + gps events) | Alert |
| timeline | timeline | (aggregates envelope + storage + transport + arrival events) | TimelineEvent |
| reports | reports | pdf generator | (reads Timeline, Detection, Alert, Trip — no new writes) |
| analytics | analytics | (aggregation queries over above) | (read-only aggregates) |
| missionControl | (aggregates system status across all above) | socket status pings | (read-only) |
| demo | demo | simulation/scenarioEngine | (writes + resets across all entities) |

---

## 10. Naming & Coding Standards (recap, applied consistently)

- Folders: `camelCase` — `liveMonitoring/`, not `LiveMonitoring/` or `live-monitoring/`.
- React components: `PascalCase.jsx` — `EnvelopeScanner.jsx`.
- Hooks: `useX` — `useEnvelopeScan.js`.
- Backend files: `camelCase` — `envelopeService.js`.
- API routes: `kebab-case` — `/api/envelope-scan`, `/api/transport-sessions`.
- Prisma models: `PascalCase` — `Envelope`, `TimelineEvent`.
- Socket event names: `domain:action` — `envelope:scanned`, `transport:deviation-detected`, `alert:raised`.
- Constants: `UPPER_SNAKE_CASE`, always sourced from `config/`, never inline.

---

## 11. What I need from you before Part 2B

Part 2B will presumably move into either the database schema or the first real module build-out. Before that touches actual code, it'd help to have:

1. Your real current folder tree (`frontend/src` and `backend/src`, even just an `ls -R` or a screenshot) so I can map `[RECONCILE]` items precisely instead of guessing at your existing shape.
2. A decision on the simulation engine question in §5 (standalone service vs. embedded library) — it changes how the socket/emitter layer gets structured.
3. Your current `schema.prisma`, if one exists, so any new models (Envelope, Trip, GpsPing, TimelineEvent, Alert) get added as extensions rather than guessed at cold.
