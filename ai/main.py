"""
ChainGuard AI Service — application entrypoint.

Sprint AI-4A scope: a real, standalone inference service — image, video,
webcam, and batch prediction, plus model listing and performance metrics.
Deliberately NOT connected to the Node backend, database, Socket.IO, or
Evidence pipeline yet (Sprint AI-4B) — every endpoint here only returns
predictions in its response, nothing is written anywhere else.
"""
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from config.logging_config import logger
from config.settings import get_settings
from routers import health, inference, metrics, models
from utils.exceptions import AiServiceError, ai_service_error_handler, unhandled_exception_handler

settings = get_settings()


@asynccontextmanager
async def lifespan(_app: FastAPI):
    logger.info(f"ChainGuard AI service starting — env={settings.env}, port={settings.port}")
    logger.info("Sprint AI-4A: standalone inference service. Not connected to backend/DB/Socket.IO.")
    yield
    logger.info("ChainGuard AI service shutting down.")


app = FastAPI(
    title="ChainGuard AI Service",
    description="AI inference platform for the ChainGuard examination integrity system.",
    version="0.2.0",  # standalone inference — bumped to 1.0.0 once Sprint AI-4B wires in the backend
    lifespan=lifespan,
)

# Permits the Node backend to call this service. Mirrors the Node backend's
# own CORS setup (backend/src/app.js), which restricts to env.clientUrl
# rather than allowing any origin — same principle here: allow only the
# backend's own origin, not "*".
app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.backend_url.split("/api/")[0]] if settings.backend_url else [],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.add_exception_handler(AiServiceError, ai_service_error_handler)
app.add_exception_handler(Exception, unhandled_exception_handler)

app.include_router(health.router, tags=["health"])
app.include_router(models.router, tags=["models"])
app.include_router(inference.router, tags=["inference"])
app.include_router(metrics.router, tags=["metrics"])
