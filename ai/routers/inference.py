"""
Inference endpoints.

Every endpoint here only returns predictions in its HTTP response — none
of them write to a database, create an Alert, or emit a Socket.IO event,
per this sprint's explicit boundary ("those tasks belong to Sprint AI-4B").
Uploaded files are written to a temp directory for processing and are not
retained after the response is sent (see each endpoint's `finally` cleanup).
"""
import shutil
import tempfile
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, File, Query, UploadFile

from inference.batch_inference import predict_batch
from inference.image_inference import predict_image
from inference.model_loader import load_champion
from inference.video_inference import predict_video
from schemas.common import ApiResponse
from utils.auth import verify_api_key
from utils.exceptions import AiServiceError

router = APIRouter(prefix="/predict", dependencies=[Depends(verify_api_key)])


@router.post("/image")
async def predict_image_endpoint(
    file: UploadFile = File(...),
    confidence_threshold: Optional[float] = Query(None, ge=0.0, le=1.0),
    save_annotated: bool = Query(False),
) -> ApiResponse:
    with tempfile.TemporaryDirectory() as tmp_dir:
        tmp_path = Path(tmp_dir) / file.filename
        with tmp_path.open("wb") as f:
            shutil.copyfileobj(file.file, f)

        result = predict_image(
            tmp_path,
            confidence_threshold=confidence_threshold,
            save_annotated=save_annotated,
            output_dir=Path("inference_output") / "images" if save_annotated else None,
        )
        return ApiResponse(message="Image prediction complete", data=result.model_dump())


@router.post("/video")
async def predict_video_endpoint(
    file: UploadFile = File(...),
    frame_skip: int = Query(5, ge=1),
    confidence_threshold: Optional[float] = Query(None, ge=0.0, le=1.0),
) -> ApiResponse:
    with tempfile.TemporaryDirectory() as tmp_dir:
        tmp_path = Path(tmp_dir) / file.filename
        with tmp_path.open("wb") as f:
            shutil.copyfileobj(file.file, f)

        result = predict_video(
            tmp_path,
            output_dir=Path("inference_output") / "videos",
            frame_skip=frame_skip,
            confidence_threshold=confidence_threshold,
        )
        return ApiResponse(message="Video prediction complete", data=result.model_dump())


@router.post("/webcam")
async def predict_webcam_endpoint(
    device_index: int = Query(0),
    max_frames: int = Query(30, ge=1, le=300),
    confidence_threshold: Optional[float] = Query(None, ge=0.0, le=1.0),
) -> ApiResponse:
    """
    Runs a bounded capture session (default 30 frames, capped at 300 per
    request) and returns the aggregated results — a REST request/response
    endpoint models a capture *session*, not a continuous stream; true
    live streaming would need a WebSocket, which is out of this sprint's
    scope (plain REST endpoints only, per the objective).

    Expected to raise AiServiceError (503) in any environment without a
    physical camera — including this one. See docs/AI/Troubleshooting.md.
    """
    from inference.webcam_inference import run_webcam_inference

    try:
        results = run_webcam_inference(
            device_index=device_index,
            max_frames=max_frames,
            confidence_threshold=confidence_threshold,
        )
    except RuntimeError as exc:
        raise AiServiceError(str(exc), status_code=503) from exc

    return ApiResponse(message=f"Captured {len(results)} frame(s)", data=[r.model_dump() for r in results])


@router.post("/batch")
async def predict_batch_endpoint(
    files: list[UploadFile] = File(...),
    confidence_threshold: Optional[float] = Query(None, ge=0.0, le=1.0),
    save_annotated: bool = Query(True),
) -> ApiResponse:
    with tempfile.TemporaryDirectory() as tmp_dir:
        tmp_dir_path = Path(tmp_dir)
        saved_paths = []
        for file in files:
            tmp_path = tmp_dir_path / file.filename
            with tmp_path.open("wb") as f:
                shutil.copyfileobj(file.file, f)
            saved_paths.append(tmp_path)

        result = predict_batch(
            saved_paths,
            output_dir=Path("inference_output") / "batch",
            confidence_threshold=confidence_threshold,
            save_annotated=save_annotated,
        )
        return ApiResponse(message=f"Batch prediction complete: {result.succeeded}/{result.totalImages} succeeded", data=result.model_dump())
