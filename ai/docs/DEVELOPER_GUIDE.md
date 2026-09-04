# ChainGuard AI Service — Developer Guide

## Why this mirrors the Node backend's conventions

Every design choice in this service deliberately echoes a pattern already established in `backend/`, rather than inventing Python-idiomatic-but-inconsistent alternatives:

| Node backend | AI service | Why |
|---|---|---|
| `config/env.js` reads env vars, nothing hardcoded | `config/settings.py` (pydantic-settings) | Same principle, same reason: one place knows how to read configuration, everything else asks it. |
| `utils/apiError.js` + `middleware/error.middleware.js` | `utils/exceptions.py` (`AiServiceError` + handler) | One exception type application code raises; one place turns it into a response. No router hand-builds error JSON. |
| `utils/apiResponse.js`'s `{success, statusCode, message, data}` envelope | `schemas/common.py`'s `ApiResponse` | Not a technical requirement of FastAPI — a conscious choice so any future shared error-handling UI doesn't need two envelope shapes. |
| `config/logger.js` (Winston, leveled, file + console) | `config/logging_config.py` (stdlib `logging`, same shape) | Same operational story: structured logs, gitignored `logs/` directory, same convention. |
| Controller → Service → Repository | Router → Service → (Registry/Storage) | Routers stay thin (parse, delegate, respond). All actual logic lives in `services/`. |
| `npm run dev` / `npm start` | `scripts/start_dev.sh` / `scripts/start.sh` | Same two-mode (reload vs. not) convention, just shell scripts instead of npm scripts since there's no `package.json` equivalent driving this service. |

## Why `services/model_registry.py` is real code, not a skeleton

Sprint AI-1's scope excludes "training" and "inference" — but reading and writing a JSON manifest file is neither of those; it's infrastructure, the same category as `config/settings.py`. Implementing it now (rather than stubbing it) means:

1. `routers/health.py` can honestly report whether a model exists, instead of hardcoding `modelLoaded: false`.
2. Future training/inference sprints get a single, already-tested read/write path (`load_manifest`, `save_manifest`, `get_champion`, `register_model`) instead of inventing manifest I/O mid-sprint, under time pressure, without tests.
3. The "champion never overwritten, promotion is a flag flip" design decision from the Phase 3A document (Step 4.4) is enforced by code now, not just described in prose — `register_model()` already demotes the previous champion correctly (see `tests/test_model_registry.py`).

## Why the skeletons raise `NotImplementedError` instead of just not existing

Two options were available for "Dataset module skeleton, Training module skeleton, Evaluation module skeleton": (a) create empty folders with nothing in them, or (b) create real files with defined interfaces and explicit `NotImplementedError` bodies. Option (b) was chosen because:

- A future sprint implementing `training/train.py` needs to know the *intended* CLI shape, function signatures, and return types — this is exactly the information Step 8 of the design document specifies, and encoding it as an actual (if unimplemented) function signature is less ambiguous than a comment.
- If any future code accidentally calls a not-yet-implemented function before its sprint lands, it fails loudly and immediately (`NotImplementedError` with a message pointing at the design doc section), rather than silently doing nothing or crashing with an unrelated `AttributeError`/`ImportError`.

## Adding a new router (for future sprints)

1. Create `routers/<name>.py` with an `APIRouter()` instance.
2. Register it in `main.py`: `app.include_router(<name>.router, tags=["<name>"])`.
3. If the router needs application logic beyond parsing/responding, put that logic in a new or existing `services/*.py` file — never inline in the router function itself, matching the Router→Service split already established by `routers/health.py` → `services/model_registry.py`.

## Environment variables not yet used by any code

`BACKEND_URL`, `AI_SERVICE_JWT`, `EVIDENCE_DIR`, `CONFIDENCE_THRESHOLD`, `AUTO_ALERT_THRESHOLD` are all defined in `config/settings.py` and `.env.example` but **nothing reads them yet** — no inference code exists this sprint that would need to call the backend, save evidence, or apply a confidence threshold. They're defined now so `settings.py` doesn't need another sprint's worth of edits just to add fields; only the code that *uses* them gets added later.

## Known limitations of this sprint (see the completion report for the full list)

- No `requirements-ml.txt` packages are installed — a future sprint's setup instructions will need `pip install -r requirements.txt -r requirements-ml.txt` once dataset/training/inference code actually imports them.
- `docker-compose.yml`'s `backend`/`frontend` services are documented as comments, not real service blocks — neither has a `Dockerfile` yet (checked before writing that file, not assumed).
- CORS in `main.py` is currently derived from `BACKEND_URL` alone — once the frontend calls this service directly (if that ever happens; the Phase 3A design says it shouldn't, see that document's Step 3), this would need its own origin entry.
