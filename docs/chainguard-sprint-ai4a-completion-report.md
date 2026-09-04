# ChainGuard — Sprint AI-4A Completion Report
## AI Inference Platform

## 1. What was built

Every component the objective listed, genuinely implemented and verified against the real Sprint AI-3 trained model — not mocked:

- **A. Model Loader** (`inference/model_loader.py`) — unified `.pt`/`.onnx` loading via `ultralytics.YOLO()` (verified empirically before writing any code — see §2), automatic format selection with fallback, CPU/GPU detection reusing `training/train.py`'s exact device-detection logic, and process-level caching.
- **B. FastAPI Endpoints** — all 7: `GET /health` (extended, not rebuilt), `GET /models`, `POST /predict/image`, `POST /predict/video`, `POST /predict/webcam`, `POST /predict/batch`, `GET /metrics`.
- **C. Image Inference** (`inference/image_inference.py`) — class, confidence, pixel-space bounding box (matching `Detection.boundingBox`'s exact JSON shape), processing time, model version.
- **D. Video Inference** (`inference/video_inference.py`) — local MP4, frame-by-frame, configurable `frame_skip`, real annotated MP4 output.
- **E. Webcam Inference** (`inference/webcam_inference.py`) — real code, reuses video inference's shared frame processor; genuinely untestable in this sandbox (no camera) — see §5 for exactly what was and wasn't verified.
- **F. Batch Inference** (`inference/batch_inference.py`) — multiple images, JSON + CSV reports, annotated outputs, per-item error handling (one bad file doesn't fail the whole batch).
- **G. Performance** (`inference/performance.py`) — inference time, FPS, memory (via `psutil`), device — an in-process metrics store (no database, per this sprint's boundary) that both `/metrics` and the now-extended `/health` read from.

## 2. The design decision this sprint had to verify before writing code

**Does `ultralytics.YOLO()` really provide one unified interface for `.pt` and `.onnx`, or does ONNX need a hand-rolled ONNX Runtime path?** Tested directly: loaded both formats, ran inference on both, and hit a real error doing so — `.onnx` inference failed with a dimension mismatch (expected 64×64, got ultralytics' default 640×640), because ONNX exports have a fixed input shape. This is a genuine finding, not a hypothetical caveat: it's why `services/model_registry.ModelEntry` gained a required `imageSize` field this sprint (migrated the existing manifest entry, updated `evaluation/compare_models.py`'s promotion path, re-ran the full test suite to confirm nothing broke). Once `imgsz` is passed explicitly, both formats work identically through the same code path — confirmed by re-running the same test that had just failed.

## 3. Design decisions

**Model loading strategy**: singleton cache, reloaded only on champion-version change — reloading a multi-MB model per-request would add real, avoidable latency.

**ONNX vs PyTorch selection**: `config.settings.active_model_version`, repurposed this sprint from its Sprint AI-1 design (a version-string override) into a `pt`/`onnx` format preference. A second dedicated settings field wasn't worth adding for a binary choice with only one real trained model to test against — flagged here as a deliberate reuse rather than left unexplained.

**Confidence threshold handling**: `config.settings.confidence_threshold` as the default, overridable per-request via query parameter — Sprint AI-1 designed this field, this sprint is the first code to actually read it.

**NMS strategy**: handled entirely by Ultralytics internally — not reimplemented, since the unified-interface finding above means there's no separate raw-ONNX-Runtime path that would need its own NMS.

**Error handling**: webcam's camera-open failure is deliberately caught and re-raised as `AiServiceError(status_code=503)` rather than an unhandled exception — a missing camera is a service-availability problem (503), not a client request error (4xx) or an unexplained crash (500).

**API response format**: unchanged `ApiResponse`/`ApiErrorResponse` envelope from Sprint AI-1 — every new endpoint uses it, nothing new invented.

**Performance logging**: in-memory only, explicitly — persisting metrics would need a database, out of this sprint's boundary ("do not create database records").

**GPU/CPU fallback**: identical logic to `training/train.py`'s `detect_device()`, reused rather than reimplemented, so training and inference can never disagree about available hardware.

## 4. Compatibility confirmed with existing systems

`services/model_registry.py`'s core interface (`get_champion`, `list_models`) unchanged — only additively extended (`imageSize`, `onnxFilename`). No file in `backend/` or `frontend/` touched. No database, Socket.IO, or Evidence-pipeline code written — confirmed by what doesn't exist: no ORM/DB client import anywhere in `inference/` or `routers/inference.py`.

## 5. Step 6 — Integration (explained, not implemented, per this sprint's explicit boundary)

- **Node.js backend**: Sprint AI-4B adds `backend/src/services/aiClient.service.js` (HTTP client) calling this service's `POST /predict/image`, and `GET /api/v1/ai/models` proxying this service's `GET /models` — per the Phase 3A design document, Step 10. Nothing on the Node side changes yet.
- **Evidence pipeline**: `ImagePredictionResult.annotatedImagePath` already points at a real file on disk in the same directory convention Phase 3A's design specifies for shared evidence storage — Sprint AI-4B's job is wiring that path into `Evidence`'s (still-orphaned since Phase 1) controller/route, not changing anything about how this service produces the file.
- **Detection records**: `Detection`'s bounding-box field shape was matched exactly this sprint specifically so Sprint AI-4B's `POST /api/v1/detections` call needs zero transformation — verified in `API_Guide.md`'s real example response.
- **Alert engine**: no change needed on the Node side — `detectionService.create()`'s existing auto-alert logic (Phase 1) fires the same way regardless of whether the detection came from a human upload or this AI service.
- **Socket.IO**: still nothing to build here — the Node backend remains the sole broadcaster (Phase 3A design decision, unchanged).
- **Dashboard/Reports/Analytics**: all already read `Detection`/`Alert` rows reactively (Phase 1) — once Sprint AI-4B's `detection_client.py` starts writing real rows, these light up with no further changes, exactly as designed back in Phase 3A.

## 6. Verification performed (real, not assumed)

- **Every inference mode tested against the real Sprint AI-3 champion model**, not a mock: image (real detections list, real annotated JPEG saved and visually inspected), batch (6 real images, real JSON/CSV reports), video (synthesized a real test MP4 from the sample dataset, processed it, read the annotated output back with OpenCV and confirmed frame count matched).
- **All 7 endpoints tested through the real HTTP layer** (`TestClient`), not direct function calls — including confirming `/health`'s `lastInferenceAt` correctly transitions from `null` to a real timestamp after a prediction request.
- **59/59 tests passing**, 20 new for this sprint.
- **A real, empirically-discovered bug, not a hypothetical caveat**: the ONNX fixed-input-shape issue (§2) — found by actually hitting the error, not by reading documentation.
- **A real test-fragility issue caught before it shipped broken**: the in-process metrics singleton would have made `test_health.py`'s original "`lastInferenceAt` is `None`" assertion order-dependent once inference tests existed in the same pytest process. Fixed to a type-check with the reasoning documented in the test itself.
- **A real deployment gap caught and fixed**: `ai/Dockerfile` still only installed Sprint AI-1's core deps, but the service now genuinely needs the full ML stack to function. Fixed — and explicitly flagged as build-untested in this sandbox (same disk constraint documented since Sprint AI-3), rather than claimed as verified when it wasn't.

## 7. Known Issues

- **The champion model is still the Sprint AI-3 smoke test** — 0.0 confidence across the board. Every inference endpoint is genuinely working; what it's currently classifying with is not yet a usable detector.
- **`ai/Dockerfile`'s new ML-stack install is unverified via an actual `docker build`** in this sandbox (disk constraint) — the underlying `requirements-*.txt` are verified working via direct venv install, only the container build step itself is unconfirmed.
- **`inference/webcam_inference.py`'s actual capture loop has never run against a physical camera** — only its correct-failure path and its shared frame-processing logic (indirectly) are verified.
- **`psutil` memory reporting is approximate under Docker/cgroups** — `virtual_memory().available` can reflect host memory rather than a container's actual limit; not fixed this sprint, documented in `Troubleshooting.md`.
- **`POST /predict/webcam` models a bounded session, not a live stream** — a deliberate scope decision (plain REST, no WebSocket), not an oversight, but worth flagging if a future sprint wants true continuous live preview.
- **Uploaded files for `/predict/*` are written to a temp directory and cleaned up after each request** — there's currently no size/type validation beyond what FastAPI's `UploadFile` does natively; worth hardening before any real external exposure (Sprint AI-4B+ concern, since this service currently has no auth at all — see next section).
- **No authentication on any endpoint** — this was true since Sprint AI-1 and remains true; Sprint AI-4B's `AI_SERVICE_JWT` work is what eventually closes this, but as of this sprint the service is fully open to anything that can reach it on the network.

## 8. Sprint AI-4B Preparation Guide

Per this sprint's own explicit boundary and the Phase 3A design document's Step 10:

1. **`backend/src/services/aiClient.service.js`** — Node HTTP client calling this service's `POST /predict/image`. The response shape is already documented exactly in `API_Guide.md`; no negotiation needed on either side.
2. **`GET /api/v1/ai/models`** (Node side) — thin proxy to this service's `GET /models`, per Phase 3A Step 10.
3. **`services/detection_client.py`** (this AI service, Phase 3A design Step 4.1) — the piece that turns a prediction into a real `POST /api/v1/detections` call, authenticated as `AI_SYSTEM`. This is the actual "connect to the backend" work — everything built this sprint produces exactly the data this call needs, in the right shape, already.
4. **Wire `Evidence`'s orphaned controller/route** (Phase 1 debt, still open) — `ImagePredictionResult.annotatedImagePath` is the file this finally attaches to an `Evidence` row.
5. **`AI_SERVICE_JWT`** — mint a long-lived `AI_SYSTEM`-role token (Phase 3A design, Step 10) so `detection_client.py` can actually authenticate.
6. **Basic auth/rate-limiting on this service's own endpoints** (Known Issues above) — worth doing before or alongside backend integration, not after, once this service is reachable from somewhere that isn't a local dev machine.
7. **A real training run at production scale** — still the prerequisite for any of this mattering in a live demo (unchanged from Sprint AI-3's own prep guide; not yet done).

Waiting for approval before continuing, per your instruction.
