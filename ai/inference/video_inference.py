"""
Video inference — REAL IMPLEMENTATION (Sprint AI-4A).

Per docs/chainguard-ai-technical-design-phase3a.md, Step 9: prerecorded
video and live camera feeds share one inference code path. This module IS
that shared path for prerecorded files — webcam_inference.py reuses
`_process_frame` from here rather than duplicating the per-frame logic,
so a future live-camera Demo Mode scene and a prerecorded-file scene never
drift apart in behavior.
"""
import time
from pathlib import Path
from typing import Optional

import cv2
from PIL import Image

from inference.image_inference import _results_to_detections
from inference.model_loader import LoadedModel, load_champion
from schemas.inference import FrameResult, VideoPredictionResult


def _process_frame(frame_bgr, loaded: LoadedModel, confidence_threshold: float):
    """Shared by video_inference and webcam_inference — one frame in
    (OpenCV BGR numpy array), detections + the raw ultralytics result out
    (the result is returned too, so annotation can reuse result.plot()
    without re-running inference)."""
    pil_image = Image.fromarray(frame_bgr[:, :, ::-1])  # BGR -> RGB
    results = loaded.model.predict(
        pil_image,
        imgsz=loaded.entry.imageSize,
        conf=confidence_threshold,
        device=loaded.device,
        verbose=False,
    )
    result = results[0]
    detections = _results_to_detections(result, result.names)
    return detections, result


def predict_video(
    video_path: str | Path,
    output_dir: Optional[str | Path] = None,
    frame_skip: int = 5,
    confidence_threshold: Optional[float] = None,
    save_annotated: bool = True,
    loaded: Optional[LoadedModel] = None,
) -> VideoPredictionResult:
    """
    `frame_skip`: process every Nth frame (default 5) rather than every
    single frame — configurable per the objective's requirement, and a
    real necessity for CPU inference where processing every frame of even
    a short clip would be far slower than the video's own runtime.
    """
    from config.settings import get_settings

    settings = get_settings()
    threshold = confidence_threshold if confidence_threshold is not None else settings.confidence_threshold
    loaded = loaded or load_champion()

    video_path = Path(video_path)
    cap = cv2.VideoCapture(str(video_path))
    if not cap.isOpened():
        raise ValueError(f"Could not open video file: {video_path}")

    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))

    writer = None
    annotated_path = None
    if save_annotated:
        output_dir = Path(output_dir or "inference_output")
        output_dir.mkdir(parents=True, exist_ok=True)
        annotated_path = output_dir / f"annotated_{video_path.stem}.mp4"
        fourcc = cv2.VideoWriter_fourcc(*"mp4v")
        writer = cv2.VideoWriter(str(annotated_path), fourcc, fps, (width, height))

    frame_results: list[FrameResult] = []
    frame_index = 0
    processed = 0
    started = time.perf_counter()

    try:
        while True:
            ok, frame = cap.read()
            if not ok:
                break

            if frame_index % frame_skip == 0:
                detections, result = _process_frame(frame, loaded, threshold)
                frame_results.append(
                    FrameResult(frameIndex=frame_index, timestampSeconds=frame_index / fps, detections=detections)
                )
                processed += 1
                if writer:
                    annotated_bgr = result.plot()  # already BGR, matches cv2.VideoWriter's expectation directly
                    writer.write(annotated_bgr)
            elif writer:
                writer.write(frame)  # un-processed frames still get written, unannotated, so output video length matches input

            frame_index += 1
    finally:
        cap.release()
        if writer:
            writer.release()

    elapsed_ms = (time.perf_counter() - started) * 1000

    return VideoPredictionResult(
        sourcePath=str(video_path),
        totalFrames=total_frames,
        framesProcessed=processed,
        frameSkip=frame_skip,
        frameResults=frame_results,
        processingTimeMs=elapsed_ms,
        modelVersion=loaded.entry.version,
        annotatedVideoPath=str(annotated_path) if annotated_path else None,
    )
