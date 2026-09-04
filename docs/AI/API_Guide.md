# API Guide

All examples below use real response shapes captured during this sprint's actual verification (see `docs/chainguard-sprint-ai4a-completion-report.md` §5), not hand-written samples.

Base URL: `http://localhost:8000` (dev) — see `Deployment_Guide.md` for Docker.

Every response uses the shared envelope: `{success, statusCode, message, data}` (`schemas/common.py`, unchanged since Sprint AI-1).

---

## `GET /health`

```bash
curl http://localhost:8000/health
```
```json
{
  "success": true,
  "statusCode": 200,
  "message": "ChainGuard AI service is running",
  "data": {
    "status": "ok",
    "startedAt": "2026-08-01T08:08:38.709966+00:00",
    "lastInferenceAt": null,
    "totalPredictions": 0,
    "modelLoaded": true,
    "championVersion": "smoke_test_6bc0803a"
  }
}
```
`lastInferenceAt`/`totalPredictions` are real, sourced from the same in-process metrics store `GET /metrics` reads — not hardcoded.

---

## `GET /models`

```bash
curl http://localhost:8000/models
```
Returns every entry in `models/weights/manifest.json` — `version`, `trainedAt`, `datasetVersion`, `metrics`, `filename`, `onnxFilename`, `imageSize`, `isChampion`.

---

## `POST /predict/image`

```bash
curl -X POST http://localhost:8000/predict/image \
  -F "file=@envelope.jpg" \
  -F "save_annotated=true"
```
Query params: `confidence_threshold` (float, 0-1, optional — defaults to `config.settings.confidence_threshold`), `save_annotated` (bool, default `false`).

```json
{
  "success": true,
  "statusCode": 200,
  "message": "Image prediction complete",
  "data": {
    "detections": [],
    "processingTimeMs": 701.73,
    "modelVersion": "smoke_test_6bc0803a",
    "modelFormat": "pt",
    "imageWidth": 320,
    "imageHeight": 320,
    "annotatedImagePath": null
  }
}
```
An empty `detections` array against the shipped smoke-test model is expected (see `Inference_Guide.md`), not an error — it means no detection cleared the confidence threshold, exactly as it should for a model trained on 24 images for 2 epochs.

Each item in `detections` (when present):
```json
{"predictedClass": "TORN", "confidence": 0.87, "boundingBox": {"x": 12.0, "y": 8.0, "width": 140.0, "height": 95.0}}
```
`boundingBox` is pixel coordinates, matching the Node backend's `Detection.boundingBox` JSON shape exactly (Phase 3A design, Step 9) — no transform needed when Sprint AI-4B wires this up.

---

## `POST /predict/video`

```bash
curl -X POST http://localhost:8000/predict/video \
  -F "file=@storage_room.mp4" \
  -F "frame_skip=5"
```
Query params: `frame_skip` (int ≥1, default 5), `confidence_threshold` (optional).

```json
{
  "data": {
    "sourcePath": "/tmp/.../test.mp4",
    "totalFrames": 30,
    "framesProcessed": 6,
    "frameSkip": 5,
    "frameResults": [{"frameIndex": 0, "timestampSeconds": 0.0, "detections": []}, "..."],
    "processingTimeMs": 880.46,
    "modelVersion": "smoke_test_6bc0803a",
    "annotatedVideoPath": "inference_output/videos/annotated_test.mp4"
  }
}
```
The annotated output video is real, playable — verified this sprint by reading it back with OpenCV and confirming frame count matches the source.

---

## `POST /predict/webcam`

```bash
curl -X POST "http://localhost:8000/predict/webcam?max_frames=30&device_index=0"
```
Query params: `device_index` (default 0), `max_frames` (1-300, default 30), `confidence_threshold` (optional).

**In any environment without a physical camera** (including every environment this sprint could test in):
```json
{
  "success": false,
  "statusCode": 503,
  "message": "Could not open camera device 0. This is expected in a headless sandbox with no camera hardware — see docs/AI/Troubleshooting.md.",
  "details": null
}
```
This is the real, captured 503 response from this sprint's own test run — not a hypothetical.

---

## `POST /predict/batch`

```bash
curl -X POST http://localhost:8000/predict/batch \
  -F "files=@envelope1.jpg" \
  -F "files=@envelope2.jpg"
```
Query params: `confidence_threshold` (optional), `save_annotated` (default `true`).

```json
{
  "data": {
    "totalImages": 2,
    "succeeded": 2,
    "failed": 0,
    "results": [{"filename": "...", "detections": [], "error": null}, "..."],
    "processingTimeMs": 796.4,
    "jsonReportPath": "inference_output/batch/batch_report.json",
    "csvReportPath": "inference_output/batch/batch_report.csv"
  }
}
```
A failed item (e.g. a corrupt/non-image upload) still returns `200` overall — check `results[].error` per item, and `succeeded`/`failed` counts, rather than relying on the HTTP status for partial-batch failures.

---

## `GET /metrics`

```bash
curl http://localhost:8000/metrics
```
```json
{
  "data": {
    "totalPredictions": 1,
    "averageInferenceTimeMs": 701.73,
    "averageFps": 1.43,
    "device": "cpu",
    "modelVersion": "smoke_test_6bc0803a",
    "lastPredictionAt": "2026-08-01T08:08:41.726778+00:00"
  }
}
```
In-memory only — resets on process restart (no database, per this sprint's explicit boundary).

---

## Error format

Every non-2xx response uses `ApiErrorResponse` (`schemas/common.py`): `{success: false, statusCode, message, details}`. Unhandled exceptions are caught and never leak a stack trace to the client (`utils/exceptions.py`'s `unhandled_exception_handler`), matching the Node backend's error-middleware behavior.
