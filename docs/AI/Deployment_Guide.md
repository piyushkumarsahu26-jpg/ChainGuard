# Deployment Guide

## Connecting to the backend (Sprint AI-4B)

Two separate credentials, two separate directions — not a mismatch, a deliberate asymmetry (see the Sprint AI-4B completion report §3 for the full reasoning):

**Node → AI** (backend calling this service's `/models`, `/predict/*`): a shared API key.
```bash
# Both sides must match exactly:
# ai/.env:      AI_SERVICE_API_KEY=some-shared-secret
# backend/.env: AI_SERVICE_API_KEY=some-shared-secret
```
Empty (the default) means auth is disabled — fine for local dev, never for a real deployment.

**AI → Node** (this service calling the backend's `POST /api/v1/detections`): a long-lived JWT, reusing the backend's existing auth system exactly like every other authenticated user.
```bash
cd backend
node scripts/mint-ai-token.js
# copy the printed token into ai/.env's AI_SERVICE_JWT
```

## What's deployable today (Sprint AI-4B)

The AI service now performs real inference — `ai/Dockerfile` installs `requirements.txt` **and** `requirements-dataset.txt` **and** `requirements-ml.txt` (a real change this sprint; Sprint AI-1's image only needed core API deps since nothing called the ML stack yet).

```bash
cd chainguard  # repo root
docker compose up postgres ai
curl http://localhost:8000/health
curl -X POST http://localhost:8000/predict/image -F "file=@some_envelope.jpg"
```

**Honesty note**: this Dockerfile change has NOT been build-tested via an actual `docker build` in this project's sandbox — doing so would need to download and unpack the same ~5-6GB dependency set that already used most of this sandbox's disk budget installing directly into a venv (see `Troubleshooting.md`). The `requirements-*.txt` files themselves are verified working (real venv, real training, real inference, all in this sandbox) — only the Docker build step itself is unverified. Please run a real `docker build` before deploying from this image.

## Why the image is now large, and that's correct

Sprint AI-1 deliberately kept the image small because nothing imported torch/ultralytics/opencv yet. That reasoning no longer applies — `routers/inference.py` genuinely calls into all of them on every prediction. Shipping a smaller image now would mean shipping a broken one.

## Getting the trained model into a deployment

Still manual, as of this sprint: `models/weights/` (containing `manifest.json` and the `.pt`/`.onnx` files) needs to be present wherever the service runs. This sprint's smoke-test model is committed directly (small enough — see the completion report for exact sizes) for demonstration; a production-scale model would use the `chainguard_ai_models` named volume already defined in `docker-compose.yml` (Sprint AI-1) instead of a git-committed weights file.

## Environment variables that matter for deployment

See `ai/.env.example`. Still unused by any code this sprint: `BACKEND_URL`, `AI_SERVICE_JWT` (Sprint AI-4B connects these). Now genuinely used: `CONFIDENCE_THRESHOLD` (default detection cutoff), `ACTIVE_MODEL_VERSION` (repurposed this sprint as a `pt`/`onnx` format preference — see `Inference_Guide.md`).

## Resource expectations

CPU inference on the shipped smoke-test model (64×64 images, ~3M-parameter YOLOv8n): roughly 700-900ms per image on the CPU this sandbox verified against (a modest cloud VM core, not a fast desktop). A production-scale model at full 640×640 resolution would be meaningfully slower per-image on CPU — GPU deployment is supported by the same code (`inference/model_loader.detect_device()` auto-detects), just unverified in this sandbox (no GPU available here).
