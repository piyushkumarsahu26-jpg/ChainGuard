from fastapi import APIRouter

from inference.performance import get_metrics
from schemas.common import ApiResponse

router = APIRouter()


@router.get("/metrics")
async def get_metrics_endpoint() -> ApiResponse:
    return ApiResponse(message="Inference performance metrics", data=get_metrics().model_dump())
