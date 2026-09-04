# ChainGuard — AI Platform Technical Design Document
**Phase 3A — Design Only. No code in this document is meant to be run; it is the blueprint Phase 3B implements against.**

---

## Step 1 — Architecture Review: what the AI platform reuses

The existing system already has more of the AI platform's landing surface built than a green-field design would assume. Reviewed against the real Phase 2 codebase:

| Existing piece | State | AI platform's relationship to it |
|---|---|---|
| `Detection` Prisma model (`cameraId`, `prediction`, `confidence`, `boundingBox` JSON, `imagePath`, `timestamp`) | Real, in use since Phase 1 | **The** table AI inference writes to. No new detections table. |
| `POST /api/v1/detections` (`detection.service.js`) | Real, working | **The** ingestion endpoint. Already auto-creates a HIGH/CRITICAL `Alert` at confidence ≥ 0.75/0.90 and emits `detection:new`/`alert:new` over Socket.IO. AI service calls this exact endpoint — it is not rebuilt. |
| `AI_SYSTEM` role (`Role` enum) | Real, already exists, already authorized on `/detections` POST and `/cameras/:id/heartbeat` | The AI service authenticates as this role. No new role needed. |
| `env.aiService.url` / `env.aiService.apiKey` (`config/env.js`) | Scaffolded in Phase 1's `.env.example`, never consumed | This phase is what finally uses them. |
| `upload.middleware.js` (Multer, disk storage, UUID filenames, image/video/pdf allow-list) | Real, but **orphaned** — no controller/route calls it (flagged as technical debt D1 in the Phase 1 review, still unresolved) | Becomes the evidence-ingestion path for AI-flagged frames. This phase finally wires it up. |
| `Evidence` Prisma model (`envelopeId?`, `alertId?`, `fileType`, `filePath`, `hash?`) | Real, also orphaned (no controller/route) | Becomes where AI evidence images are recorded, once wired in Phase 3B. |
| Socket.IO (`sockets/index.js`, JWT handshake via `auth.token`) | Real, working | AI service does **not** get its own socket channel — the backend remains the single broadcaster. AI results reach clients exactly the way they do today: AI → REST → backend → `getIo().emit(...)`. |
| `analytics` module (`scans-by-month`, `tamper-breakdown`, `confidence-trend`, `center-risk`, `camera-status`) | Real, reads `Detection`/`Alert` directly | Needs **zero changes** — these endpoints already aggregate real `Detection` rows; they've been returning empty arrays only because nothing has been writing detections yet. Phase 3B makes them light up, not requires them to be rebuilt. |
| `AIDetection.jsx` (frontend) | Real, already wired to `aiDetectionService` + `detection:new` socket event | Reused as-is for live detection display. Its `modelStats`/`accuracyTrend` dummy placeholders get replaced once a real model-registry endpoint exists (Step 4). |
| `Camera` model + heartbeat endpoint | Real | AI service reports camera-adjacent health via the existing heartbeat endpoint — no new camera-status mechanism. |
| Reports module | Real | Consumes `Detection`/`Alert` rows the same way it already consumes `Envelope`/`ChainOfCustody` — no AI-specific report logic needed at the schema level. |

**The one real, load-bearing gap**: `Detection` has no relation to `Envelope`. This has been flagged in every phase's review since Phase 1 and is finally addressed head-on in Step 4.

---

## Step 2 — Current System Analysis

**What already exists and works:** the entire ingestion→alert→socket→analytics pipeline described above. A synthetic `POST /detections` call today, with a fake `cameraId`, already produces a real alert, a real socket broadcast, and real analytics movement. This is a significant head start — the AI service's job is narrower than "build detection infrastructure"; it's "produce good predictions and call an endpoint that already does the rest."

**What must remain unchanged:** the `Detection`/`Alert`/`Camera` schema shapes, the `POST /detections` contract, the socket event names and payload shapes, the RBAC pattern (`AI_SYSTEM` role gated the same way as any other role), and the Controller→Service→Repository layering on the Node side. The AI service is a peer process, not a rewrite of anything.

**What's genuinely new:**
1. A Python/FastAPI service (`ai/`) — doesn't exist at all yet.
2. A `Detection.envelopeId` relation (small, additive schema change).
3. Wiring `Evidence` + `upload.middleware.js` together (schema exists, plumbing doesn't).
4. A model-registry surface (version, metrics) so `AIDetection.jsx`'s placeholder stats become real — currently there's no table or endpoint for "which model version produced this prediction, and how accurate is it."
5. Everything dataset/training/inference-pipeline related (Steps 5–9) — genuinely greenfield, Python-side, and intentionally outside the Node backend's boundary.

---

## Step 3 — AI Design Decisions

**Why a separate AI service, not an in-process Node module.** Node's ecosystem for computer vision (YOLO inference, OpenCV, torch) is thin compared to Python's, and training/inference workloads have a completely different resource profile (GPU-bound, long-running, memory-heavy) than the request/response REST API. Keeping it a separate process means a training run or a slow inference batch can never block a login request or an envelope lookup — the two processes share nothing but an HTTP boundary and, optionally, a filesystem for evidence.

**Why Python.** It's the only realistic choice given the stack (Ultralytics YOLOv8, OpenCV, PyTorch, Albumentations are all Python-first, with no comparable Node equivalents at the same maturity).

**Why FastAPI specifically, not Flask/Django.** Native async support (matters for handling concurrent inference requests and webcam/video streams without blocking), automatic OpenAPI schema generation (useful documentation for a service two other people — the Node backend and, later, a professor reviewing the demo — need to understand), and Pydantic request/response validation, which mirrors the discipline already used on the Node side (`express-validator` chains before every controller).

**Why YOLOv8 (Ultralytics) specifically.** It's a single-stage detector, meaning it does classification and localization in one pass — appropriate for a real-time-ish "is this envelope torn/opened/taped" classification task where a bounding box on the damaged region is exactly the evidence the demo needs to show. It has a mature, well-documented training/export pipeline (including direct ONNX export, needed for Step 8's deployment story) and pretrained weights that transfer-learn well from a modest dataset — important given Step 5's dataset is bootstrapped synthetically before real captured data exists. YOLOv8 is a design choice, not a hard dependency the rest of this document leans on structurally — Step 4's pipeline design (dataset → train → evaluate → export → serve) would hold with a different single-stage detector if that became necessary later; only the training config and export step (Step 8) are YOLO-specific.

**How the frontend talks to AI: it doesn't, directly.** The frontend never calls the FastAPI service. It calls the Node backend (as it always has), and the backend either proxies specific request-response inference calls (e.g., "run inference on this uploaded image now") or simply reads `Detection` rows the AI service already wrote via `POST /detections`. This keeps exactly one authentication boundary (the JWT scheme already built) instead of two, and keeps the frontend's `api.js` axios client the single place that knows how to talk to "the backend."

**How the backend talks to AI: two directions.**
- *AI → Backend* (primary path, already exists): AI service authenticates as `AI_SYSTEM`, calls `POST /api/v1/detections`. This is how live/batch/video detections land.
- *Backend → AI* (new, request/response): for on-demand actions like "scan this specific envelope image now" (the Scanner feature from the original Part 1 spec), the Node backend makes a synchronous HTTP call to the FastAPI service (`POST {AI_SERVICE_URL}/inference/image`), gets a prediction back, and *then* calls its own `detectionService.create()` internally — reusing the exact same auto-alert/socket-broadcast logic rather than duplicating it. The AI service in this path never touches the database or Socket.IO directly; it only predicts.

**How detections flow, end to end:**
```
Camera / uploaded image / video frame
        │
        ▼
  AI Service (FastAPI + YOLOv8)
        │  produces: prediction label, confidence, bounding box, evidence image
        │
        ├─(live/batch path)──► POST /api/v1/detections  (as AI_SYSTEM)
        │                              │
        │                              ▼
        │                     detectionService.create()
        │                              │
        │                    ┌─────────┴─────────┐
        │                    ▼                   ▼
        │            Detection row        Alert row (if confidence ≥ threshold)
        │                    │                   │
        │                    └────────┬──────────┘
        │                             ▼
        │                  Socket.IO: detection:new / alert:new
        │                             │
        │                             ▼
        │                   Frontend (AIDetection.jsx, Dashboard,
        │                   AlertCenter, Analytics) — already listening
        │
        └─(on-demand scan path)──► Backend calls AI synchronously,
                                    then re-enters the same
                                    detectionService.create() path above
```

**How evidence is stored:** the AI service writes the annotated frame/crop to a shared evidence directory (mirroring `upload.middleware.js`'s existing `src/uploads/evidence/` convention — same root, so one static-file-serving config covers both human-uploaded and AI-generated evidence), and passes the resulting relative path back to the backend as `imagePath` on the detection (already a field) and, once Step 4's schema addition lands, as an `Evidence` row linking to the specific `Alert`/`Envelope`.

**How reports consume AI results:** unchanged from today's `reportService` pattern — a report's `filters` JSON can reference a date range/camera/prediction type, and (once report *rendering* is built, still a Phase-1-flagged gap, not part of this phase) the render step queries `Detection`/`Alert`/`Evidence` the same way it already queries `Envelope`/`ChainOfCustody`.

**How Socket.IO broadcasts detections:** exactly as it does today — the AI service never opens a socket connection itself. Only the Node backend emits, using the same `detection:new`/`alert:new` events already implemented and already consumed by the frontend. This is a deliberate constraint: one broadcaster, one source of truth for "what just happened," even though two systems (Node and Python) can now cause it to happen.

---

## Step 4 — AI Platform Architecture

### 4.1 Repository structure

```
ai/                              # peer of backend/ and frontend/, own package/venv
├── .env / .env.example
├── requirements.txt
├── Dockerfile
├── main.py                      # FastAPI app entrypoint
├── config/
│   ├── settings.py               # pydantic-settings: reads env vars
│   └── logging_config.py
├── models/
│   └── weights/                  # versioned .pt / .onnx files, gitignored except a manifest
│       └── manifest.json         # {version, trainedAt, metrics, filename} per model
├── inference/
│   ├── image_inference.py
│   ├── webcam_inference.py
│   ├── video_inference.py
│   ├── batch_inference.py
│   └── postprocess.py            # confidence filtering, bbox formatting, evidence crop/save
├── training/
│   ├── train.py
│   ├── configs/                  # one YAML per training run, versioned
│   └── callbacks.py              # early stopping, checkpoint saving
├── evaluation/
│   ├── evaluate.py                # mAP/precision/recall/F1 against a held-out test split
│   └── compare_models.py          # champion/challenger comparison, see Step 8
├── datasets/
│   ├── generator/                 # synthetic dataset generation (Step 6)
│   ├── collector/                  # real-image ingestion (Step 7)
│   ├── augmentation/
│   ├── validator/                  # quality control, dedup
│   └── statistics/
├── routers/                        # FastAPI route modules
│   ├── health.py
│   ├── inference.py
│   ├── models.py                    # model registry read endpoints
│   └── training.py                   # trigger/status endpoints (admin/internal only)
├── services/
│   ├── detection_client.py           # calls back into Node's POST /detections as AI_SYSTEM
│   ├── evidence_storage.py           # writes to the shared uploads/evidence path
│   └── model_registry.py
├── schemas/                          # Pydantic request/response models
├── utils/
├── tests/
└── notebooks/                        # exploratory only, never imported by app code
```

**Design rule carried over from the Node backend's own convention**: routers stay thin (parse request, call a service, return a response), services hold the actual logic, and nothing in `routers/` touches the model weights or the filesystem directly — that's `services/`' job. This is the same Controller→Service→Repository discipline the Node side already enforces, translated to FastAPI's terms (Router→Service→[Model/Storage]).

### 4.2 Training pipeline (high level — full detail in Step 8)
`datasets/` → `training/train.py` (reads a config from `training/configs/`) → checkpoints written under `models/weights/<version>/` → `evaluation/evaluate.py` scores the checkpoint → if it beats the current champion, `models/weights/manifest.json` is updated to point at it.

### 4.3 Inference pipeline (high level — full detail in Step 9)
Request (image/frame) → `inference/*_inference.py` loads the current champion model (from the manifest, not hardcoded) → runs prediction → `postprocess.py` filters by confidence threshold and formats the bounding box → `services/evidence_storage.py` saves the annotated evidence image → `services/detection_client.py` calls `POST /api/v1/detections` on the Node backend.

### 4.4 Model management & versioning
Every trained model gets a version string (`v{major}.{minor}.{patch}`, e.g. `v1.2.0`), a manifest entry (`{version, trainedAt, datasetVersion, metrics: {precision, recall, mAP50, f1}, filename, isChampion}`), and its weights file is never overwritten — old versions stay on disk (subject to a retention policy, e.g. keep last 5) so a bad promotion can be rolled back by flipping `isChampion` in the manifest, no retraining required. `GET /ai/models` (Step 10) exposes this manifest to the Node backend, which is what finally replaces `AIDetection.jsx`'s hardcoded `modelStats` placeholder with real data.

### 4.5 Evidence storage
Shared convention with the existing `upload.middleware.js`: same root directory (`UPLOAD_DIR/evidence/`), same UUID-filename pattern, so the Node backend's static file serving doesn't need a second code path for "AI evidence" vs. "human-uploaded evidence." The AI service needs filesystem write access to this shared path (Docker Compose detail in 4.9) or, as a stated alternative for a fully decoupled deployment, uploads the evidence file via a small internal `POST /internal/evidence` endpoint on the Node backend instead of writing to a shared disk directly — **recommended for Phase 3B is the shared-volume approach** (simpler, fewer network hops, appropriate for a single-host capstone deployment), with the internal-endpoint approach documented here as the migration path if the AI service and backend are ever split across hosts.

### 4.6 Prediction storage
Nothing new at the schema level beyond Step 4.8's `Detection.envelopeId` addition — predictions are `Detection` rows, exactly as today.

### 4.7 AI logs, error handling, monitoring
- **Logs**: Python's standard `logging` module, configured in `config/logging_config.py` to match the Node side's convention (structured, leveled, written to `ai/logs/` — gitignored, same pattern as `backend/logs/`).
- **Error handling**: FastAPI exception handlers translate internal errors (model load failure, corrupt image, out-of-memory) into a consistent JSON error shape, deliberately mirroring the Node backend's `{success: false, statusCode, message}` envelope so a future unified error-display component on the frontend (out of scope for this phase) could handle both without special-casing.
- **Monitoring**: `GET /health` (already planned in `routers/health.py`) reports model-loaded status, current champion version, and last-inference timestamp — consumed the same way the Node backend's own `/api/v1/health` already is.

### 4.8 Schema change required for this phase's design to hold together

This is the one Prisma change Phase 3B's implementation will need, flagged here so it isn't a surprise later:

```
model Detection {
  ...
  envelopeId String?
  envelope   Envelope? @relation(fields: [envelopeId], references: [id])
  ...
}
```
Nullable, additive, identical in spirit to every Phase 1/2 migration — a detection from a storage-room or transport camera may have no specific envelope in frame, so this must stay optional rather than required. This single field is what finally makes "AI Observations" on `EnvelopeDetails.jsx` (explicitly stubbed out with an honest `EmptyState` in Phase 1, precisely because this relation didn't exist) buildable in Phase 3B without redesigning anything else.

### 4.9 Configuration, environment variables, Docker

**New `ai/.env.example`:**
```
# Server
PORT=8000
ENV=development

# Model
MODEL_DIR=models/weights
ACTIVE_MODEL_VERSION=          # empty = use manifest's isChampion

# Backend integration
BACKEND_URL=http://localhost:5000/api/v1
AI_SERVICE_JWT=                # long-lived AI_SYSTEM-role token, minted by the backend (see Step 10)

# Storage (shared with backend's UPLOAD_DIR when using the shared-volume approach)
EVIDENCE_DIR=../backend/src/uploads/evidence

# Inference
CONFIDENCE_THRESHOLD=0.5        # below this, a prediction isn't even returned
AUTO_ALERT_THRESHOLD=0.75       # informational only — the actual alert threshold lives
                                 # in the Node backend's detection.service.js and isn't
                                 # duplicated here, to avoid the two ever drifting apart
```

**Docker**: a `Dockerfile` for the AI service (Python base image, installs `requirements.txt`, copies `ai/`, runs `uvicorn main:app`) plus an addition to the existing root-level `docker-compose.yml` (referenced in the original Part 1 spec, not yet built) with three services — `frontend`, `backend`, `ai` — and a named volume shared between `backend` and `ai` for the evidence directory, matching 4.5's shared-volume recommendation.

---

## Step 5 — Dataset Design

Six classes, matching the original project brief exactly:

| Class | Definition |
|---|---|
| `SAFE` | Envelope seal fully intact, no visible damage, tape, or tampering. |
| `TORN` | Visible tear/rip in the envelope material, seal integrity compromised by a jagged opening. |
| `OPENED` | Envelope has been deliberately opened along a flap/seam — a clean opening, not a tear. |
| `CRUSHED` | Structural deformation — creased, folded, or compressed, independent of whether the seal itself is broken. |
| `TAPED` | Additional tape present on the envelope — ambiguous signal: could be legitimate resealing by an authorized officer (logged via a `ChainOfCustody` event) or a tampering cover-up, which is precisely why this class exists as its own label rather than being folded into `SAFE` or `OPENED`. |
| `PARTIAL_DAMAGE` | Damage present but not clearly matching a single category above (e.g. minor corner crush, small puncture) — a deliberate catch-all so the model isn't forced into an over-confident wrong guess between the five specific classes. |

For each class:

- **Collection strategy**: a mix of synthetic-first (Step 6) to bootstrap training before any real capture exists, then progressively replaced/supplemented with real captured images (Step 7) as the demo pipeline runs and produces genuine printing-press/storage photos.
- **Synthetic generation strategy**: programmatic compositing of a clean envelope template with class-specific damage overlays (tear masks, crush-warp transforms, tape rectangles) — full technique detail in Step 6, applies identically across all six classes with only the damage-overlay step differing.
- **Real image strategy**: captured via the webcam/batch-import tooling in Step 7 during actual demo dry-runs and, if available, donated sample images of damaged mail/envelopes for pretraining diversity (no real exam envelopes exist yet at Phase 3B's start, which is exactly why synthetic bootstrapping matters).
- **Augmentation strategy**: per-class, using Albumentations — rotation (±15°), brightness/contrast jitter, Gaussian noise, motion blur (simulating a handheld phone camera or a cheap fixed webcam), and JPEG compression artifacts (simulating a lower-quality CCTV feed) — applied uniformly, since the goal is robustness to capture conditions, not class-specific augmentation.
- **Validation strategy**: a held-out set never touched by augmentation, manually reviewed (even for synthetic images — a human check that the "damage" is visually plausible) before being locked as `validation/` or `test/`.
- **Recommended dataset size** (per class, synthetic + real combined, for a first usable model): 300–500 training images, 60–100 validation, 60–100 test. Total ≈ 2,500–4,000 images across 6 classes — modest by production CV standards but appropriate for a transfer-learned YOLOv8 model on a well-defined, visually distinct task, and realistic for a capstone timeline.
- **Train/validation/test split**: 70/15/15, stratified per class so no class is under-represented in validation/test purely by random chance.

**Metadata** (per image, stored as a sidecar JSON or a single dataset-wide manifest CSV): `filename`, `class`, `source` (`synthetic` | `real`), `generatorVersion` or `captureDevice`, `collectedAt`, `resolution`, `annotator` (for real images requiring manual labeling).

**Folder structure:**
```
datasets/
├── synthetic/
│   ├── SAFE/ TORN/ OPENED/ CRUSHED/ TAPED/ PARTIAL_DAMAGE/
├── real/
│   ├── SAFE/ TORN/ OPENED/ CRUSHED/ TAPED/ PARTIAL_DAMAGE/
├── manifest.csv                 # every image, every field above, one row each
├── train/  (YOLO format: images/ + labels/)
├── validation/
└── test/
```
The `synthetic/`/`real/` split is the *source of truth*; `train/`/`validation/`/`test/` are generated (not hand-curated) by a splitting script reading `manifest.csv` — meaning the split can be regenerated deterministically (fixed random seed) any time the source pools grow, rather than manually re-sorted.

---

## Step 6 — Dataset Generator Design

The synthetic generator is not "fake data" in the sense the Phase 2 spec was careful to distinguish elsewhere — it's a programmatic image-composition pipeline producing genuinely novel pixel data the model actually learns from, the same category of legitimate bootstrapping technique used broadly in industrial CV before real data exists.

**Pipeline, per generated image:**
1. **Background generation** — a randomized desk/table/storage-shelf backdrop (procedural gradient + texture noise, or a small pool of real background photos), so the model doesn't overfit to a single background.
2. **Envelope base render** — a clean envelope template (a few base templates: manila, white, kraft) placed on the background with randomized position/scale.
3. **Perspective changes** — a homography transform simulating the envelope being photographed from varied camera angles (not always perfectly top-down).
4. **Lighting variation** — simulated directional lighting (gradient overlay + shadow casting) so the model sees the envelope under varied illumination, not just flat studio lighting.
5. **Shadows** — cast from the envelope's simulated edges/folds, reinforcing depth cues the real camera will also produce.
6. **Class-specific damage overlay** — the step that actually differs per class: a tear-mask alpha-blended in for `TORN`, a warped/creased displacement map for `CRUSHED`, a semi-transparent tape rectangle for `TAPED`, a seam-opening cutout for `OPENED`, a smaller/blended version of one of the above for `PARTIAL_DAMAGE`, and no overlay at all for `SAFE`.
7. **Color variation** — hue/saturation jitter, simulating different envelope stocks and camera white-balance differences.
8. **Noise** — sensor noise simulation (Gaussian/Poisson), matching real low-light CCTV footage characteristics.
9. **Blur** — slight Gaussian or motion blur, simulating a moving envelope or an out-of-focus fixed camera.
10. **Occlusion** — a randomly placed foreign object (a hand, a stapler-shaped blob, a QR-code sticker) partially covering the envelope, so the model learns to predict from partial visibility — this matters because real footage will have officers' hands in frame during handling.
11. **Compression artifacts** — re-encoding through a lossy JPEG pass at a randomized quality level, simulating what actually arrives from a compressed CCTV stream rather than a pristine source image.

**Label generation**: since every overlay's position/size is known at generation time (it's programmatically placed, not manually annotated), the YOLO-format bounding box label is derived directly from the overlay's placement coordinates — no manual annotation step for synthetic data at all, which is the main practical advantage of the synthetic-first approach over waiting for real captured-and-hand-labeled images.

**Quality control**: a validator pass (Step 7's `validator/` module, shared with real-data validation) rejects generated images where the damage overlay ended up fully occluded by the background/occlusion step, where the bounding box would be degenerate (near-zero area), or where a random seed combination produced a visually implausible result — flagged for human spot-review rather than silently discarded, so the generator's own failure modes are visible and improvable over time.

---

## Step 7 — Real Data Collection

**Webcam capture**: a small capture utility (`datasets/collector/webcam_capture.py`) that opens the local camera, shows a live preview with an on-screen class selector, and saves a frame + auto-generated filename on keypress — this is the same tool used during Demo Mode dry-runs to build the real-data pool incrementally, not a separate one-off script.

**Batch import**: a folder-drop workflow — point the collector at a directory of images, and it walks the tree, computes a perceptual hash per image (for the duplicate-detection step below), and stages each into a pending-review queue rather than directly into `datasets/real/`.

**Automatic naming**: `{class}_{source}_{timestamp}_{shortHash}.jpg` — human-readable at a glance, collision-proof via the hash suffix.

**Automatic labeling workflow**: for webcam capture, the class is operator-selected at capture time (no inference needed). For batch import of *unlabeled* images, a two-stage flow: (1) if a champion model already exists, run it as a pre-labeling suggestion the human confirms/corrects rather than trusts blindly; (2) if no model exists yet (bootstrapping), require manual class selection before the image leaves the pending-review queue. Auto-labeling is always a *suggestion* a human confirms, never a silent auto-accept, since the whole point of the real-data pool is to be a trustworthy correction to synthetic bias.

**Quality verification**: minimum resolution check, blur-detection (Laplacian variance threshold — rejects images too blurry to show meaningful damage detail), and a brightness/contrast sanity check (rejects near-black or blown-out frames) — all automated, run before an image reaches the pending-review queue, so a human reviewer's time is spent judging class-correctness, not filtering technically-broken captures.

**Duplicate detection**: perceptual hashing (pHash) with a similarity threshold — catches near-duplicate frames from a webcam capture burst or a re-imported batch, preventing the dataset from being accidentally dominated by 40 nearly-identical frames of the same envelope.

**Metadata collection**: same schema as Step 5's manifest, with `source: 'real'`, `captureDevice` (webcam model / "batch import"), and `annotator` (who confirmed the label) always populated for real images — this is what lets a future audit ("why did the model learn this") trace any real training image back to who labeled it and when, echoing the audit-trail discipline already built into Phase 2's user administration.

---

## Step 8 — Model Training Design

**Training workflow**: `train.py` reads a YAML config (dataset version, base pretrained weights, hyperparameters, augmentation profile), initializes YOLOv8 from Ultralytics' pretrained checkpoint (transfer learning, not training from scratch — appropriate given the modest dataset size from Step 5), trains for a configured epoch budget, and writes checkpoints + a training-run manifest (config used, dataset version, git-style content hash of the dataset manifest at train time, so a given model version's provenance is fully reproducible).

**Hyperparameters** (starting defaults, tunable per config file, not hardcoded): image size 640×640, batch size 16 (adjustable to available GPU/CPU memory), learning rate following YOLOv8's default cosine schedule, 100–150 epochs with early stopping (below), standard YOLOv8 augmentation (mosaic, mixup) layered on top of Step 6's own dataset-level augmentation.

**Evaluation metrics**: precision, recall, mAP@0.5, mAP@0.5:0.95, and F1 — computed per-class as well as overall, since a model that's excellent at `SAFE`/`TORN` (visually distinct) but weak at `TAPED`/`PARTIAL_DAMAGE` (more ambiguous, by design) needs that weakness visible in evaluation, not averaged away.

**Early stopping**: training halts if validation mAP@0.5 doesn't improve for a configured patience window (default 20 epochs) — prevents overfitting to the still-modest dataset and keeps training runs from wasting compute on a plateaued model.

**Model comparison**: every completed training run is scored by `evaluation/compare_models.py` against the current champion (from the manifest) on the *same held-out test set* — a new model only gets promoted to champion if it meets or beats the champion on mAP@0.5 without regressing more than a small tolerance on any individual class's recall (a model that improves overall mAP by getting much better at `SAFE` while getting much worse at `TORN` should not silently replace the champion).

**Checkpoint strategy**: best-validation-mAP checkpoint is kept (not just the final epoch's weights), plus the final epoch's weights for comparison — both written under `models/weights/<version>/`, never overwritten in place.

**Export strategy**: the promoted champion is exported to both `.pt` (native PyTorch, used for continued fine-tuning if needed) and `.onnx` (used for serving — ONNX Runtime inference is faster and has a smaller dependency footprint than a full PyTorch runtime for pure inference, which matters if the AI service is ever deployed on more constrained hardware than the training environment).

**Best model selection**: automatic promotion (per the comparison rule above) with the result logged, but final promotion is a manifest flag flip an administrator can also do manually — the design deliberately keeps a human able to override an automatic promotion decision, rather than a fully automatic pipeline no one can veto.

---

## Step 9 — Inference Design

**Single image inference**: `POST /ai/inference/image` (multipart upload or a path already in shared storage) → runs the champion model once → returns `{prediction, confidence, boundingBox}` synchronously. This is the path the Node backend calls for the on-demand Scanner feature described in Step 3.

**Webcam inference**: a long-running local process (not a REST endpoint — a webcam is a local device, not something the FastAPI service reaches into) that continuously captures frames, runs inference at a configurable interval (not every single frame — e.g. every 500ms, to bound CPU/GPU load), and for any frame at/above the confidence threshold, calls the same `detection_client.py` path as live camera detections.

**Video inference**: processes a prerecorded file (or an RTSP live stream — same code path, per the Phase 1/2A architecture decision that prerecorded CCTV and live cameras share one inference pipeline) frame-by-frame at a sampling interval, batching frames for throughput, and reports detections the same way webcam inference does. This is the exact mechanism that makes Demo Mode's "storage room monitoring" scene (Additional Requirements, below) run real model inference on prerecorded footage rather than a scripted fake result.

**Batch inference**: given a directory or a list of image paths (used for offline evaluation and for bulk-processing a batch-imported real-data folder before it's labeled), runs inference across all of them and returns a results manifest — does not, by itself, write `Detection` rows (that's specifically for live/demo paths); batch inference is a dataset/evaluation tool.

**Confidence thresholds**: two, deliberately distinct and independently configurable — `CONFIDENCE_THRESHOLD` (below this, the AI service doesn't even report a detection; it's noise) and the Node backend's existing `AUTO_ALERT_CONFIDENCE_THRESHOLD` (0.75/0.90 today, unchanged) which decides whether a *reported* detection also raises an alert. The AI service only ever controls the first; the second remains entirely the Node backend's decision, exactly as it is today — this keeps "what counts as worth mentioning" (AI's call) and "what counts as urgent" (business logic's call) as separate, independently tunable concerns.

**Bounding boxes**: `{x, y, width, height}` in pixel coordinates relative to the source image — matches `Detection.boundingBox`'s existing JSON shape exactly, so no transform is needed on the Node side.

**Evidence extraction**: the source frame, with the bounding box burned in as an annotation overlay (for human-readable evidence) *and* the raw, unannotated crop saved separately (for any future re-analysis or model retraining use) — both written via `services/evidence_storage.py` to the shared evidence directory.

**Prediction storage**: via `services/detection_client.py` calling the existing `POST /api/v1/detections` — no direct database write from the Python side at all. The AI service has no Prisma/database credentials; the Node backend remains the only writer to the database, which keeps exactly one system responsible for the auto-alert/socket-broadcast business logic instead of two systems that could drift out of sync.

---

## Step 10 — System Integration

### FastAPI endpoints (new, `ai/routers/`)
| Method | Path | Purpose |
|---|---|---|
| GET | `/health` | Model-loaded status, champion version, last-inference timestamp |
| POST | `/inference/image` | Single-image synchronous inference (called by the Node backend, on-demand Scanner path) |
| POST | `/inference/batch` | Batch inference over a directory/list (dataset tooling, evaluation) |
| GET | `/models` | Current manifest — versions, metrics, which is champion |
| POST | `/training/start` | Trigger a training run (internal/admin only — not exposed to the general frontend) |
| GET | `/training/status/:runId` | Poll a training run's progress |

### Backend integration
- New `backend/src/services/aiClient.service.js` — thin HTTP client wrapping calls to `env.aiService.url`, used only by the on-demand Scanner flow (`POST /inference/image` → `detectionService.create()`).
- New `GET /api/v1/ai/models` on the Node side — proxies `ai/models` from the AI service, so the frontend never needs to know the AI service's URL at all (same "frontend only ever talks to the backend" boundary from Step 3).
- A long-lived `AI_SYSTEM`-role JWT, minted once (via the existing `signAccessToken` utility, out-of-band — not through the normal login flow, since the AI service isn't a human logging in) and placed in the AI service's own `.env` as `AI_SERVICE_JWT` — reuses Phase 1/2's existing JWT infrastructure rather than inventing a second auth mechanism.

### Frontend integration
- `AIDetection.jsx`'s `modelStats`/`accuracyTrend` dummy placeholders (explicitly flagged as intentional placeholders back in Phase 1) get replaced by `GET /api/v1/ai/models` — the one frontend change this design implies, and it's a data-source swap, not a redesign of the page.
- No other frontend page changes — `Detection`/`Alert`/`Analytics` pages already consume real data reactively via REST + the existing `detection:new`/`alert:new` socket events.

### Socket.IO integration
No new events, no new namespace. The AI service never connects to Socket.IO. All broadcasting stays exactly as designed in Step 3.

### Evidence integration
Phase 3B wires `Evidence`'s controller/route (orphaned since Phase 1) specifically as part of this work — `services/detection_client.py`'s call to `POST /detections` is extended to optionally also create an `Evidence` row (linked to the resulting `Alert`, and to the `Envelope` if `envelopeId` was resolved) pointing at the annotated evidence image already saved by `services/evidence_storage.py`.

### Report integration
No schema or service changes beyond what already exists — `reportService` already supports arbitrary `filters` JSON; a report scoped to "tampering incidents this month" simply filters `Detection`/`Alert` rows the same way an "envelope audit" report already filters `Envelope`/`ChainOfCustody` rows. Actual PDF/CSV rendering remains a separately-tracked gap (flagged since Phase 1), out of this phase's scope.

### Analytics integration
Zero new work — `analytics.service.js`'s five endpoints already aggregate `Detection`/`Alert`/`Camera` data. This phase's entire contribution to Analytics is *making the underlying tables non-empty*.

### Alert integration
Zero new work — `detectionService.create()`'s existing auto-alert logic is reused unmodified for every detection path (live, webcam, video, on-demand scan) described in Step 9.

---

## Additional Requirements

### Demo Mode / Scenario Engine
Out of this phase's implementation scope (a Phase 4 concern per the existing roadmap), but the AI platform's design is what makes it *possible* without special-casing: because prerecorded video and live camera feeds already share one inference code path (Step 9), a scenario engine's "storage room monitoring" scene just means pointing `video_inference.py` at a prerecorded file instead of an RTSP URL — no AI-specific demo-mode code needed, only orchestration (which scene plays when) living in the future `simulation/` module.

### Storage Room AI
Same inference pipeline as envelope scanning, different trained classes (people-present / restricted-zone-access / suspicious-behavior, rather than the six envelope-damage classes) — architecturally, this is a second model + a second set of dataset folders under the same `datasets/`/`training/`/`inference/` structure, not a different pipeline. Explicitly out of Phase 3B's initial scope; the folder structure in Step 4.1 already has room for it (`datasets/synthetic/<class>/` generalizes to any class set).

### Transport AI
Not a computer-vision task at all — route-deviation/delay detection (per the original Part 1/2A spec) is a geometry/rules problem over GPS coordinates, not something YOLOv8 or this AI service handles. Explicitly the `simulation/` module's responsibility, not the AI platform's — flagged here only to be clear it's *not* accidentally in scope.

### Future OCR support (architecture only)
Would slot in as a new `inference/ocr_inference.py` alongside the existing inference modules, using a separate lightweight model (e.g. a Tesseract or PaddleOCR-based pipeline, not YOLOv8, since OCR is a different problem shape than detection). Output would be a new field on evidence extraction, not a schema change to `Detection` — OCR'd text is evidence metadata, not a damage classification.

### Future QR verification support (architecture only)
The `Envelope.qrCode` field and `qrcode.util.js` already exist (Phase 1). Future work would add a `qr_verify_inference.py` that decodes a QR code from a frame and cross-checks it against the expected `Envelope.qrCode` — a comparison operation, not a model-inference task, so it would live in `inference/` as a lightweight OpenCV/pyzbar step rather than a trained model.

### Future face recognition support (architecture only)
Would require its own model family (face detection + embedding, e.g. a lightweight FaceNet-style model) and, critically, its own explicit consent/privacy design before any implementation — flagged here as an architecture slot only (a third `inference/face_inference.py` alongside the existing two categories), deliberately not designed further in this document, since building this out prematurely without that consent/privacy review would be irresponsible regardless of technical feasibility.

### Future anomaly detection support (architecture only)
Would sit at the `Analytics`/`Alert` layer rather than the `inference/` layer — a statistical model (not YOLOv8-based) watching for unusual *patterns* across already-stored `Detection`/`Alert`/`ChainOfCustody` rows (e.g. an envelope taking an unusually long time between custody events), architecturally closer to a new `analytics.service.js` method than a new computer-vision model. Flagged as a natural extension of the existing Analytics module, not a new AI service capability.

---

## Diagrams

### Component interaction (system-level)
```
┌────────────┐        REST (JWT)         ┌────────────┐        REST (JWT)        ┌──────────────┐
│  Frontend  │ ────────────────────────► │   Backend   │ ───────────────────────► │  AI Service   │
│  (React)   │ ◄──────────────────────── │  (Express)  │ ◄─────────────────────── │  (FastAPI)    │
└────────────┘      Socket.IO (JWT)      └──────┬──────┘   on-demand scan only    └──────┬────────┘
      ▲                                          │                                        │
      └──────────────────────────────────────────┘                                        │
             detection:new / alert:new                                                     │
                                                  │                                        │
                                          ┌───────▼────────┐                       ┌───────▼────────┐
                                          │  PostgreSQL     │                       │  Model weights  │
                                          │  (Prisma)       │                       │  + datasets     │
                                          └─────────────────┘                       └─────────────────┘
                                                  ▲                                        │
                                                  └───────────── shared volume ─────────────┘
                                                              (evidence images)
```

### Data flow (a single live detection, end to end)
```
Camera/video frame
   → AI Service: preprocess → YOLOv8 inference → postprocess (threshold, bbox)
   → AI Service: save annotated evidence image to shared volume
   → AI Service (as AI_SYSTEM): POST /api/v1/detections {cameraId, prediction, confidence, boundingBox, imagePath}
   → Backend: detectionService.create()
        → INSERT Detection
        → if confidence ≥ 0.75: INSERT Alert, severity by threshold
        → INSERT Evidence (Phase 3B addition) linked to Alert (+ Envelope if resolved)
        → io.emit('detection:new', ...) [+ 'alert:new' if applicable]
   → Frontend: AIDetection.jsx / Dashboard.jsx / AlertCenter.jsx update live via existing socket listeners
   → Analytics endpoints: next poll reflects the new row automatically (no push needed there)
```

### Training workflow (sequence)
```
Operator/CI trigger
   → train.py reads config + dataset manifest
   → YOLOv8 transfer-learning loop (checkpoint each epoch)
   → early stopping check each epoch (patience window)
   → best-val-mAP checkpoint retained
   → evaluate.py scores checkpoint on held-out test set
   → compare_models.py: new model vs. current champion
   → if promoted: export .pt + .onnx, update manifest.json (isChampion flip)
   → if not promoted: weights retained on disk (for analysis), champion unchanged
```

### Inference workflow (on-demand scan, sequence)
```
Officer uploads envelope photo (frontend Scanner UI)
   → Backend: POST /api/v1/envelopes/:id/scan (new, Phase 3B) — multipart upload via upload.middleware.js
   → Backend: aiClient.service.js → POST {AI_SERVICE_URL}/inference/image
   → AI Service: single-image inference → {prediction, confidence, boundingBox}
   → Backend: detectionService.create({...,envelopeId: resolved from :id})
   → (same Detection/Alert/Evidence/socket flow as the live-detection data flow above)
   → Backend responds to the original upload request with the prediction, synchronously
   → Frontend: shows the result immediately, no socket round-trip needed for this specific flow
     (the socket broadcast still fires, for any other connected clients watching live)
```

### Deployment workflow
```
docker-compose.yml (root, extends the existing planned structure)
├── frontend   (nginx serving the Vite build)
├── backend    (node, connects to postgres + shares evidence volume with ai)
├── ai         (uvicorn, connects to backend via BACKEND_URL, shares evidence volume)
└── postgres   (existing)

Shared volume: chainguard_evidence  →  mounted at backend's UPLOAD_DIR and ai's EVIDENCE_DIR
```

### Database interaction (what AI-adjacent tables actually look like post-Phase-3B)
```
Camera 1───* Detection *───1 Envelope (nullable — Step 4.8 addition)
              │
              *
              │
             Alert 1───* Evidence *───1 Envelope (nullable)
                          │
                          └──── filePath points into the shared evidence volume
```

---

## Summary: what Phase 3B actually needs to build

Everything above is design; nothing here has been implemented. For a implementation-planning reference, the concrete unit of work Phase 3B inherits from this document is:

1. One schema migration: `Detection.envelopeId` (additive, nullable) — the only Prisma change.
2. Wire `Evidence`'s controller/route/service (orphaned since Phase 1) into the detection-creation flow.
3. Build the `ai/` FastAPI service per the Step 4.1 structure — datasets, training, inference, model registry.
4. Two small Node additions: `aiClient.service.js` and `GET /api/v1/ai/models`.
5. One frontend change: swap `AIDetection.jsx`'s dummy `modelStats`/`accuracyTrend` for real data from the new endpoint.
6. `docker-compose.yml`, if a demo deployment target needs it.

Everything else described in this document (dataset generator, training pipeline, evaluation, inference modes) is genuinely new Python-side work with no existing Node/React counterpart to reconcile against — which is precisely why Steps 5–9 were designed in this much detail: there's no existing implementation to extend, so the design has to carry the full weight of the decisions Phase 3B will otherwise have to make ad hoc, mid-implementation.
