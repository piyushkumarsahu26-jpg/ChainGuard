"""
Shared response schemas.

Deliberately mirrors the shape of backend/src/utils/apiResponse.js and
apiError.js (per the Phase 3A design document, Step 4.7): every successful
response looks like {success, statusCode, message, data}, every error looks
like {success, statusCode, message, details}. This isn't a strict
requirement of FastAPI or Python — it's a conscious choice so that, if a
future shared frontend component ever handles both Node and AI service
responses, it doesn't need two different envelope shapes to special-case.
"""
from typing import Any, Generic, Optional, TypeVar

from pydantic import BaseModel

T = TypeVar("T")


class ApiResponse(BaseModel, Generic[T]):
    success: bool = True
    statusCode: int = 200
    message: str = "OK"
    data: Optional[T] = None


class ApiErrorResponse(BaseModel):
    success: bool = False
    statusCode: int
    message: str
    details: Optional[Any] = None
