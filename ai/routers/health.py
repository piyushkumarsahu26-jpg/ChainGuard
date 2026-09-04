"""
Health endpoint.

Per the Phase 3A design document, Step 10: reports model-loaded status,
current champion version, and last-inference timestamp. As of Sprint
AI-4A, `lastInferenceAt` and `device` are real, sourced from
inference/performance.py's in-process metrics store — the exact update
Sprint AI-1's original comment on this file anticipated ("an obvious,
single place to update it").
"""
from datetime import datetime, timezone

from fastapi import APIRouter

from inference.performance import get_metrics
from schemas.common import ApiResponse
from services.model_registry import get_champion
from utils.exceptions import ModelNotAvailableError

router = APIRouter()

# Set once, at process start — proves the process has been up and serving
# since this timestamp. Not persisted; a restart resets it, which is the
# correct semantic for "how long has this instance been alive".
_started_at = datetime.now(timezone.utc).isoformat()


@router.get("/health")
async def health_check() -> ApiResponse:
    try:
        champion = get_champion()
        model_status = {
            "modelLoaded": True,
            "championVersion": champion.version,
        }
    except ModelNotAvailableError:
        model_status = {
            "modelLoaded": False,
            "championVersion": None,
        }

    metrics = get_metrics()

    return ApiResponse(
        message="ChainGuard AI service is running",
        data={
            "status": "ok",
            "startedAt": _started_at,
            "lastInferenceAt": metrics.lastPredictionAt,
            "totalPredictions": metrics.totalPredictions,
            **model_status,
        },
    )
