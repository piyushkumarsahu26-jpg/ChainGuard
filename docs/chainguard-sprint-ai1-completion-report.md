# ChainGuard — Sprint AI-1 Completion Report
## AI Infrastructure Platform

## 1. What was built

The complete `ai/` directory structure per the Phase 3A design document's Step 4.1, with the following genuinely real and tested: FastAPI application (`main.py`), configuration (`config/settings.py`, `config/logging_config.py`), the shared response envelope and exception-handling pattern (`schemas/`, `utils/exceptions.py`), the model registry (`services/model_registry.py` — real manifest.json read/write, not a stub), the health endpoint (`routers/health.py`), and a Dockerfile. Everything dataset/training/evaluation-related is a real Python module with a defined interface and an explicit `NotImplementedError` body, per this sprint's explicit "no training, no inference" scope.

## 2. Compatibility confirmed with existing systems

- **Backend**: `ai/` sits as a peer directory, exactly as designed in Phase 3A — nothing in `backend/` was modified. `config/settings.py`'s `backend_url`/`ai_service_jwt` fields are defined but unused by any code this sprint (no HTTP client exists yet to call the backend).
- **Frontend**: untouched. Per the Phase 3A design's Step 3 decision ("the frontend never calls the FastAPI service directly"), no frontend changes were needed or made.
- **Database**: no schema changes. This sprint has no code that touches PostgreSQL at all — the model registry's storage is a JSON file, not a database table.
- **Socket.IO**: untouched, and structurally cannot be touched by this sprint's code — no socket client exists in `ai/` yet, matching the Phase 3A decision that the AI service never broadcasts directly.

## 3. Existing AI-related integration points (reviewed, not modified)

Re-confirmed against the real Phase 2 codebase before writing any code: `Detection`/`Evidence`/`Alert`/`Camera` Prisma models, `POST /api/v1/detections`'s existing auto-alert logic, the `AI_SYSTEM` role's existing route authorizations, `upload.middleware.js` (still orphaned — unchanged this sprint), and the already-scaffolded `AI_SERVICE_URL`/`AI_SERVICE_API_KEY` env vars in `backend/.env.example` (still unconsumed — unchanged this sprint). None of these needed to change for infrastructure-only work; they're the integration points future sprints connect to.

## 4. Design decisions (brief — full rationale already exists in the Phase 3A document)

This sprint applied Phase 3A's decisions; it didn't make new ones, with one exception: **splitting `requirements.txt` from `requirements-ml.txt`**. The Phase 3A design document didn't specify this split. It was added because installing a multi-GB PyTorch/Ultralytics stack for a sprint whose code never imports either package would be dishonest "production-ready infrastructure" — the dependency file should reflect what the code actually needs, not the eventual full system.

## 5. Verification performed (real, not assumed)

- **Dependency install**: a real virtualenv, real `pip install -r requirements.txt` — clean, no errors.
- **Test suite**: `pytest tests/ -v` — **7/7 tests pass**, covering the health endpoint's response shape and the model registry's load/save/promote/demote logic against a temporary manifest (never touching the real one).
- **Live server boot**: actually started `uvicorn main:app` and hit it with real `curl` requests — `GET /health` returns the correct envelope and honestly reports `modelLoaded: false` (no model has been trained anywhere in this project yet); `GET /docs` and `GET /openapi.json` (FastAPI's auto-generated docs) both return valid responses.
- **A real bug found and fixed during verification**: the test suite's first run surfaced a `DeprecationWarning` — `@app.on_event` is deprecated in the installed FastAPI version. Rewrote `main.py` to use the modern `lifespan` context-manager pattern instead of leaving a deprecation warning in code meant to be "production-ready." Re-verified: 7/7 tests still pass, zero warnings.
- **`docker-compose.yml` validated** as syntactically correct YAML (parsed with `pyyaml`) — confirmed it declares exactly the two real, working services (`postgres`, `ai`) and does not falsely declare `backend`/`frontend` as buildable when neither has a Dockerfile yet (checked before writing the file).
- **Repo hygiene**: a stray literal-brace directory (`{config,routers,...}`) was created by an initial `mkdir` command that assumed bash brace-expansion in a shell that turned out to be `/bin/sh` (dash) — the same class of bug found in the original uploaded project back in the Phase 1 review. Caught and removed before packaging; all subsequent directory creation used explicit paths.

## 6. Deliverables — every new file/folder

```
ai/
├── .env.example, .gitignore, requirements.txt, requirements-ml.txt
├── Dockerfile, README.md
├── main.py
├── config/  settings.py, logging_config.py
├── routers/ health.py
├── services/ model_registry.py
├── schemas/ common.py
├── utils/   exceptions.py
├── models/weights/ manifest.json (+.gitkeep)
├── datasets/
│   ├── generator/synthetic_generator.py
│   ├── collector/collectors.py
│   ├── augmentation/augmentor.py
│   ├── validator/quality_validator.py
│   └── statistics/dataset_stats.py
├── training/ train.py, callbacks.py, configs/README.md
├── evaluation/ evaluate.py, compare_models.py
├── experiments/ README.md (+.gitkeep)
├── tests/ test_health.py, test_model_registry.py
├── scripts/ start.sh, start_dev.sh
└── docs/ DEVELOPER_GUIDE.md

(root) docker-compose.yml — new
```
Plus `__init__.py` in every Python package directory (trivial, not itemized individually). No existing file in `backend/` or `frontend/` was modified.

## 7. Known limitations / explicitly deferred (not bugs)

- No dataset exists, no model has ever been trained — `models/weights/manifest.json` is genuinely empty, and `/health` reports this honestly.
- `requirements-ml.txt` packages are not installed — nothing imports them yet.
- `routers/inference.py`, `routers/models.py`, `routers/training.py` do not exist — only `health.py`, per this sprint's explicit "no endpoints beyond the application skeleton" constraint.
- `docker-compose.yml`'s `backend`/`frontend` entries are documentation (comments), not working services — those Dockerfiles don't exist yet and building them was out of this sprint's scope (`ai/` infrastructure only).

## 8. Recommended Sprint AI-2 preparation

Per the Phase 3A design document's own dependency order, and per your instruction to wait for approval: the natural next sprint is dataset generation (Step 5/6 of the design document) — `datasets/generator/synthetic_generator.py`'s `NotImplementedError` is the first skeleton this project is set up to fill in, since training (Sprint AI-3+) needs a dataset to exist first.

Waiting for approval before Sprint AI-2, per your instruction.
