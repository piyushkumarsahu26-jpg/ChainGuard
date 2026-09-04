"""
Custom exceptions + a centralized exception handler.

Mirrors backend/src/utils/apiError.js + backend/src/middleware/error.middleware.js:
one exception type application code raises, one place that turns it into a
response, so no router has to hand-build an error JSON body itself.
"""
from fastapi import Request
from fastapi.responses import JSONResponse

from config.logging_config import logger
from schemas.common import ApiErrorResponse


class AiServiceError(Exception):
    """Base exception for all application-raised errors in this service."""

    def __init__(self, message: str, status_code: int = 500, details=None):
        super().__init__(message)
        self.message = message
        self.status_code = status_code
        self.details = details


class ModelNotAvailableError(AiServiceError):
    """
    Raised when a router needs a trained/champion model and none exists yet.

    Not raised anywhere in Sprint AI-1 (no router asks for a model yet) —
    defined now because services/model_registry.py's get_champion() already
    needs a defined failure mode for "no model trained yet", and it should
    raise the same exception type future inference routers will also raise,
    rather than each sprint inventing its own.
    """

    def __init__(self, message: str = "No trained model is currently available"):
        super().__init__(message, status_code=503)


async def ai_service_error_handler(request: Request, exc: AiServiceError) -> JSONResponse:
    logger.error(f"{request.method} {request.url.path} -> {exc.status_code} {exc.message}")
    body = ApiErrorResponse(statusCode=exc.status_code, message=exc.message, details=exc.details)
    return JSONResponse(status_code=exc.status_code, content=body.model_dump())


async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    # Never leak internal exception details to the client — same principle
    # as the Node backend's error middleware hiding stack traces in
    # production. Full detail still goes to the log.
    logger.error(f"Unhandled exception on {request.method} {request.url.path}: {exc}", exc_info=True)
    body = ApiErrorResponse(statusCode=500, message="Internal server error")
    return JSONResponse(status_code=500, content=body.model_dump())
