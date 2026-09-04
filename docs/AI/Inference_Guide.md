# Inference Guide

Sprint AI-4A: real, standalone inference. This service predicts and returns results in its HTTP response — it does not write to a database, create alerts, or emit Socket.IO events (that's Sprint AI-4B).

## Model loading

`ultralytics.YOLO()` loads both `.pt` and `.onnx` through one unified interface — verified directly before writing any inference code, not assumed. This means there's no separate hand-rolled ONNX Runtime pre/post-processing path; NMS and format handling are identical either way.

**The one real gotcha**: ONNX exports have a *fixed* input shape. A model exported at `imgsz=64` will throw a dimension-mismatch error if you run inference expecting ultralytics' default 640×640. This is why `services/model_registry.ModelEntry` gained a required `imageSize` field this sprint — `inference/model_loader.py` always passes the champion's actual trained/exported size explicitly, never relying on a default.

**Format selection**: controlled by `config.settings.active_model_version` — set it to `"onnx"` to prefer ONNX Runtime serving, anything else defaults to PyTorch. If the preferred format's file doesn't exist on disk, the loader falls back to whichever format *does* exist rather than failing outright.

**Caching**: the loaded model is a module-level singleton, reloaded only when the registry's champion version changes. Call `inference.model_loader.load_champion(force_reload=True)` to force a reload without restarting the process.

## Confidence threshold

Read from `config.settings.confidence_threshold` (default `0.25`) unless a caller overrides it per-request via the `confidence_threshold` query parameter on any `/predict/*` endpoint.

## Endpoints

See `API_Guide.md` for full request/response detail. Quick reference:

| Endpoint | Input | Notes |
|---|---|---|
| `POST /predict/image` | one uploaded file | `save_annotated=true` to get a boxed-overlay image back |
| `POST /predict/video` | one uploaded `.mp4` | `frame_skip` (default 5) — process every Nth frame |
| `POST /predict/webcam` | none (query params only) | runs a bounded capture *session* (default 30 frames, max 300) — not a continuous stream; see below |
| `POST /predict/batch` | multiple uploaded files | JSON + CSV reports, annotated images, all written to disk |
| `GET /models` | — | lists everything in the model registry |
| `GET /metrics` | — | running averages since process start |

## Video and webcam share one code path

Per `docs/chainguard-ai-technical-design-phase3a.md`, Step 9: prerecorded video and live camera feeds use the same per-frame inference logic (`inference/video_inference._process_frame`, reused directly by `webcam_inference.py`, not reimplemented). This is what will eventually let a Demo Mode scene point the same code at either a live camera or a prerecorded file with no special-casing.

## Webcam inference — real code, honestly not live-tested

This sandbox has no camera device (same situation as Sprint AI-2's `WebcamCollector`). `inference/webcam_inference.py` is real, complete code — `cv2.VideoCapture(device_index)`, a capture loop, the same `_process_frame` call video inference already uses — but the capture loop itself has never run against an actual camera. What *has* been verified: the correct-failure path (a clear `RuntimeError` → `503` when no camera is present) and the shared frame-processing logic (indirectly, via `video_inference.py`'s real passing tests).

`POST /predict/webcam` models a bounded **capture session**, not a continuous stream — a REST request/response endpoint isn't the right shape for "stream forever"; that would need a WebSocket, out of this sprint's scope (plain REST endpoints only).

## Performance

Every prediction updates an in-process metrics store (`inference/performance.py`) — total predictions, average inference time, average FPS, device, last-prediction timestamp. Deliberately in-memory only, not persisted anywhere: Sprint AI-4A must not create external records, so metrics reset on process restart. `GET /health` and `GET /metrics` both read from this same store.

## What's honestly still a smoke test

The shipped champion model (`smoke_test_6bc0803a`) was trained for 2 epochs on 24 tiny images (Sprint AI-3) — every prediction through this service will legitimately return zero or near-zero-confidence detections. The inference *pipeline* is real and verified; the model's predictive quality is not, by design, until a production-scale training run happens.
