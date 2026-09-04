"""
API key verification — REAL IMPLEMENTATION (Sprint AI-4B).

Guards the endpoints the Node backend calls (`/models`, `/predict/*`) with
a shared-secret header check. `GET /health` is deliberately NOT guarded —
Docker's own HEALTHCHECK directive (this project's Dockerfile) and casual
`curl` monitoring shouldn't need a credential just to ask "are you up",
matching how the Node backend's own `/api/v1/health` is also unauthenticated.

Auth is OFF (always passes) when `ai_service_api_key` is unset — the same
"empty means disabled, only in dev" convention already used elsewhere in
this project (e.g. Node's `COOKIE_SECURE=false` default). This is a
development convenience, not a production recommendation — see
docs/AI/Deployment_Guide.md.
"""
from fastapi import Header

from config.settings import get_settings
from utils.exceptions import AiServiceError


async def verify_api_key(x_api_key: str = Header(default="")) -> None:
    settings = get_settings()
    if not settings.ai_service_api_key:
        return  # auth disabled (dev default)
    if x_api_key != settings.ai_service_api_key:
        raise AiServiceError("Invalid or missing X-API-Key header", status_code=401)
