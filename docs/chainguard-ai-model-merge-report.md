# ChainGuard — AI Model Merge Report
## Merging the verified externally-trained model into the existing integrated project

## 1. Root cause analysis

There was no defect to fix this time — this was a genuine feature merge. The existing project's champion model (`repair_full_99503f10`, from the prior model-repair session) was a real, working, meaningfully-trained model, but modest in scale (390 synthetic images, YOLOv8n, 96×96). The uploaded second AI project contains a more substantially trained model — YOLOv8s (a larger architecture), trained at 224×224, with real per-class validation support and materially stronger metrics. The task was to bring that trained artifact into the existing, already-integrated system without disturbing the system itself.

## 2. Architecture comparison

| | Existing ChainGuard AI service | Uploaded second AI project |
|---|---|---|
| **Purpose** | Integrated inference service, connected to the Node backend/DB/Socket.IO | Standalone training + evaluation + serving project, not connected to anything else |
| **API framework** | FastAPI (`main.py`, `routers/`) | FastAPI (`api/main.py`) — a **different, independent app** |
| **Endpoints** | `GET /health`, `GET /models`, `POST /predict/image`, `POST /predict/video`, `POST /predict/webcam`, `POST /predict/batch`, `GET /metrics` | `GET /health`, `GET /model-info`, `POST /predict`, `POST /predict/all` |
| **Response schema** | `{detections: [{predictedClass, confidence, boundingBox: {x,y,width,height}}], processingTimeMs, modelVersion, modelFormat, ...}` | `{label, confidence, bbox: [x1,y1,x2,y2]}` |
| **Model loading** | `services/model_registry.py` (JSON manifest, versioned, champion/challenger) + `inference/model_loader.py` (unified `ultralytics.YOLO()` loader, cached) | `inference/predict.py`'s `_get_model()` — a simple dict cache keyed by weights path, no registry/versioning/promotion concept |
| **Class names (in this exact checkpoint)** | Existing champion: `SAFE, TORN, OPENED, CRUSHED, TAPED, PARTIAL_DAMAGE` (uppercase) | `sealed, torn, taped, crushed, opened, partial_damage` (lowercase) — confirmed by loading the checkpoint directly, not from documentation |
| **Bounding box format** | Pixel `{x, y, width, height}` (matches the Node backend's `Detection.boundingBox` JSON shape exactly) | Pixel `[x1, y1, x2, y2]` (raw Ultralytics `xyxy`) |
| **Auth** | Shared API key on `/models`, `/predict/*` (`utils/auth.py`) | None — CORS wide open (`allow_origins: ["*"]`) |

**The one thing that matters most: the model checkpoint format itself is identical.** Both are standard `ultralytics.nn.tasks.DetectionModel` checkpoints (`task: detect`). Confirmed by loading `best.pt` directly with this project's own installed `ultralytics` package and inspecting `model.task` and the raw checkpoint dict — not assumed, not taken from either project's documentation. This is what made the merge a data/config change rather than a code rewrite: **this project's `inference/model_loader.py` already loads any YOLO checkpoint generically** — it has no idea, and needs no idea, which project trained the weights it's given.

**Everything else in the table above (API shape, endpoints, response schema, auth) belongs to the uploaded project's standalone serving layer — none of it was merged.** Per your explicit instructions (no renamed endpoints, no changed request/response formats), and because it wasn't needed: the existing service's API layer already does everything the uploaded project's `api/main.py` does, in the shape the Node backend already expects.

## 3. Files modified, and why

| File | Why |
|---|---|
| `ai/models/external/chainguard_yolov8s_v1/best.pt` (new) | The actual verified weights, copied in as-is |
| `ai/models/external/chainguard_yolov8s_v1/best.onnx` (new) | Exported using this project's existing, unmodified `training/export.py` — for format parity with every other registered model |
| `ai/models/external/chainguard_yolov8s_v1/summary_metrics.csv`, `per_class_metrics.csv` (new) | The uploaded project's own real evaluation results, copied alongside the weights for provenance/reference |
| `ai/models/weights/manifest.json` | One new entry added, `isChampion` flipped — via the existing, **unmodified** `register_model()`/`should_promote()` functions. Both prior models remain in history. |
| `frontend/src/pages/EnvelopeScanner.jsx` | The **only** code file that needed a change. See below. |
| `README.md`, `CHANGELOG.md` | Status documentation |

**Why `EnvelopeScanner.jsx` needed a change, precisely**: its `damageVariant` object mapped `SAFE/TORN/OPENED/CRUSHED/TAPED/PARTIAL_DAMAGE` (uppercase) to badge colors. Since the new champion returns lowercase class names, every lookup (`damageVariant['sealed']`, `damageVariant['torn']`, etc.) would silently return `undefined`, and every detection badge and bounding-box overlay would fall back to a generic neutral color — the color-coded severity signal (the whole point of that UI) would quietly stop working for the new model's output, with no error and no obvious symptom short of "everything looks the same color now." Fixed by normalizing to uppercase before lookup (one line) and adding a display-label formatter matching the one already used in `AIDetection.jsx` (for visual consistency, not introduced fresh). This is additive — the original uppercase keys are untouched, so historical detections from the prior two models (still in the database if any exist) continue to render correctly too.

**No other frontend file needed a change** — checked directly: `AIDetection.jsx` already colors badges by confidence score (not by a class-name lookup table) and already formats labels generically (`value.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())`), so it was already casing-agnostic. `EnvelopeDetails.jsx`'s only `OPENED` reference is for the unrelated `ChainOfCustody.eventType` enum, not AI detections.

**No backend file needed a change** — `Detection.prediction` is a plain Prisma `String`, not an enum; it stores whatever string the AI service returns, uppercase or lowercase, without validation. The auto-alert threshold logic (`detection.service.js`) keys purely off the numeric `confidence`, never the class-name string.

**No database schema change** — confirmed unnecessary. `ModelEntry` (added in the earlier inference-platform work) already had every field this merge needed (`version`, `imageSize`, `filename`, `onnxFilename`, `metrics`, `datasetVersion`).

## 4. Verification performed (real, not assumed)

- Loaded `best.pt` with this project's own `ultralytics` install and inspected the raw checkpoint dict directly, before deciding anything — confirmed class names, task type, and training image size from the source of truth, not from either project's README/CSV.
- Registered and promoted through the **existing, unmodified** `register_model()`/`should_promote()` functions — confirmed the promotion decision was a real comparison (0.951 vs. 0.919 mAP50), not hardcoded.
- **Ran real predictions against the uploaded project's own validation images** — 12 images, 2 per class, all six classes, chosen systematically rather than cherry-picked. **11/12 correct**, one genuine miss (`torn_0007.jpg`, no detection above threshold) reported honestly rather than omitted.
- **Booted the actual FastAPI service and made real HTTP requests**: `GET /health` returns the correct `championVersion`; `POST /predict/image` against a real uploaded file returns a correct, high-confidence (93%), correctly-shaped detection through the unmodified API.
- Full production frontend build: 2782 modules (unchanged count — no new file, one file edited), zero errors.
- **68/68 AI tests, 14/14 backend tests passing** — zero test changes required this time, because the previous model-repair session had already made champion-dependent assertions query the real registered model dynamically instead of hardcoding a version string.

## 5. Remaining limitations

- **The merged model's real strength was verified against its own project's validation set, not against this project's separately-generated synthetic dataset.** The two datasets should be visually similar (both are synthetic envelope-damage images) but weren't cross-validated against each other — a reasonable next step if precise accuracy claims matter, not done here since the checklist asked for integration verification, not a new evaluation study.
- **No experiment record exists in `training/experiments.json` for this model** — that file specifically tracks training runs executed through *this* project's own training platform, and fabricating one for training that happened elsewhere would misrepresent provenance. The model registry (the correct system for "a registered, deployable model," independent of how it was produced) has the real entry.
- **The `ai/models/external/` convention is new** (this merge's own addition) — a deliberate, clearly-labeled distinction from `training/runs/` (this project's own training output), so it's always obvious which models were trained here versus brought in from elsewhere. Worth keeping as the project's convention going forward if more externally-trained models are merged later.
- **This report's package was built from the same working copy used throughout this conversation, not a from-scratch duplicate** — this sandbox's available disk (1.4GB free) could not fit a second copy of the ~6GB Python environment. The resulting `ChainGuard_Final_AI_Merged` package is complete and correct (verified via the same build/test process as every prior delivery), but it was not constructed via a literal separate git-style clone — flagged for full transparency rather than left unstated.
