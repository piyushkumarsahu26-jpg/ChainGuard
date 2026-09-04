"""
Application settings for the ChainGuard AI service.

Mirrors the pattern already used on the Node backend (backend/src/config/env.js):
all configuration is read from environment variables with sane development
defaults, nothing is hardcoded in application code, and this module is the
single place that knows how to read them.

Every variable here matches the env var list designed in
docs/chainguard-ai-technical-design-phase3a.md, Step 4.9 — nothing has been
added or removed from that design in this sprint.
"""
from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # --- Server ---
    port: int = 8000
    env: str = "development"

    # --- Model registry ---
    # Directory containing versioned model weights + manifest.json.
    # Sprint AI-1 creates this directory and an empty manifest; no weights
    # exist yet (no training has happened) — see services/model_registry.py.
    model_dir: str = "models/weights"
    active_model_version: str = ""  # empty = use manifest's champion, once one exists

    # --- Backend integration ---
    backend_url: str = "http://localhost:5000/api/v1"
    ai_service_jwt: str = ""  # used when this service calls the backend (AI -> Node direction)

    # Added in Sprint AI-4B: validates the X-API-Key header on predict/model
    # endpoints when the Node backend calls this service (Node -> AI
    # direction). Matches env.aiService.apiKey on the Node side — same
    # shared secret, both ends. Empty string (the default) means auth is
    # OFF, matching this project's dev-mode default elsewhere (e.g.
    # COOKIE_SECURE=false) — never set in a real deployment without also
    # setting this.
    ai_service_api_key: str = ""

    # --- Storage ---
    # Matches the backend's UPLOAD_DIR/evidence convention exactly (Phase 3A
    # design, Step 4.5) — same root, same filename convention, so a single
    # static-file-serving config on the Node side covers both.
    evidence_dir: str = "../backend/src/uploads/evidence"

    # --- Inference thresholds ---
    # Not used by any code yet this sprint (no inference module exists) —
    # reserved for Sprint AI-3 per the Phase 3A design document.
    # AI Improvement Phase: lowered from 0.5 to 0.25, based on real
    # empirical testing on the new champion model's own validation set --
    # 6 candidate thresholds (0.15/0.25/0.30/0.35/0.50/0.60) were measured
    # directly (precision/recall/F1 at each), not chosen arbitrarily. F1
    # peaks at 0.35 (0.914), but 0.25 gives the highest recall observed
    # (0.930) for only a small F1 cost (0.911) -- for a tamper-detection
    # system, a missed real tamper event (false negative) is a worse
    # outcome than a false alarm a human officer can review and dismiss,
    # so recall was deliberately weighted over pure F1-optimality here.
    # See docs/chainguard-ai-improvement-phase-report.md for the full
    # threshold-sweep data this was chosen from.
    confidence_threshold: float = 0.25
    auto_alert_threshold: float = 0.75  # informational only; the real
    # alert-raising decision lives in the Node backend's
    # detection.service.js and is never duplicated here — see Phase 3A
    # design doc, Step 9, "Confidence thresholds".

    # --- Logging ---
    log_level: str = "INFO"
    log_dir: str = "logs"


@lru_cache
def get_settings() -> Settings:
    """
    Cached settings accessor. Using a function (rather than a module-level
    singleton constructed at import time) makes settings easy to override
    in tests via FastAPI's dependency-override mechanism.
    """
    return Settings()
