"""
AI service -> Node backend HTTP client — REAL IMPLEMENTATION (Sprint AI-4B).

Per docs/chainguard-ai-technical-design-phase3a.md, Step 4.1/Step 3: the
"AI -> Backend" direction, for live/batch/video detections where the AI
service itself (not an on-demand backend-initiated scan) is the one
producing a result that needs to become a real Detection row.

Auth: a long-lived AI_SYSTEM-role JWT (`settings.ai_service_jwt`) sent as
a Bearer token — reusing the Node backend's existing JWT auth exactly as
every other authenticated endpoint already works, per this project's
"reuse architecture, don't invent a second auth mechanism" principle.
This is deliberately a *different* auth scheme than the Node->AI
direction's shared API key (utils/auth.py) — see this sprint's completion
report §3 for why an asymmetric choice is correct here, not an
inconsistency: the Node->AI direction is one backend calling one trusted
internal service (a shared secret is adequate); this direction calls a
general-purpose, RBAC-protected API that already has a real user/role
system — reusing it is more correct than adding a second, weaker scheme
just for this one caller.
"""
from typing import Optional

import requests

from config.logging_config import logger
from config.settings import get_settings


class DetectionClientError(Exception):
    pass


def submit_detection(
    prediction: str,
    confidence: float,
    bounding_box: dict,
    camera_id: Optional[str] = None,
    envelope_id: Optional[str] = None,
    image_path: Optional[str] = None,
    timeout_s: float = 10.0,
) -> dict:
    """
    POSTs a single detection to the Node backend's POST /api/v1/detections
    — the same endpoint and payload shape `detection.validator.js` expects
    (matches its "at least one of cameraId/envelopeId" rule; raises
    DetectionClientError before even making the request if neither is
    given, rather than letting the backend's 400 be the first signal).
    """
    if not camera_id and not envelope_id:
        raise DetectionClientError("At least one of camera_id or envelope_id is required")

    settings = get_settings()
    if not settings.ai_service_jwt:
        raise DetectionClientError(
            "AI_SERVICE_JWT is not configured — this service has no credential to "
            "authenticate to the Node backend. See docs/AI/Deployment_Guide.md."
        )

    payload = {
        "prediction": prediction,
        "confidence": confidence,
        "boundingBox": bounding_box,
    }
    if camera_id:
        payload["cameraId"] = camera_id
    if envelope_id:
        payload["envelopeId"] = envelope_id
    if image_path:
        payload["imagePath"] = image_path

    try:
        response = requests.post(
            f"{settings.backend_url}/detections",
            json=payload,
            headers={"Authorization": f"Bearer {settings.ai_service_jwt}"},
            timeout=timeout_s,
        )
    except requests.RequestException as exc:
        logger.error(f"Failed to reach Node backend at {settings.backend_url}/detections: {exc}")
        raise DetectionClientError(f"Could not reach backend: {exc}") from exc

    if not response.ok:
        logger.error(f"Backend rejected detection submission: {response.status_code} {response.text}")
        raise DetectionClientError(f"Backend returned {response.status_code}: {response.text}")

    return response.json()
