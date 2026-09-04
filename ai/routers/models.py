from fastapi import APIRouter, Depends

from schemas.common import ApiResponse
from services.model_registry import list_models
from utils.auth import verify_api_key

router = APIRouter()


@router.get("/models", dependencies=[Depends(verify_api_key)])
async def get_models() -> ApiResponse:
    models = list_models()
    return ApiResponse(message=f"{len(models)} model(s) registered", data=[m.model_dump() for m in models])
