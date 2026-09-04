"""
Webcam inference — REAL IMPLEMENTATION, NOT LIVE-TESTED (Sprint AI-4A).

Honesty note, consistent with datasets/collector/collectors.py's
WebcamCollector from Sprint AI-2: this sandbox has no camera device and no
display, so this module's actual capture loop cannot be executed or
verified here the way image/batch/video inference could be. The code is
real and reuses `_process_frame` from video_inference.py (not a
reimplementation — per the Phase 3A design decision that live and
prerecorded feeds share one inference path), so the *inference* logic
inside the loop has been exercised indirectly via video_inference.py's
real, passing tests — only the `cv2.VideoCapture(device_index)` frame
source itself is unverified.
"""
import time
from pathlib import Path
from typing import Callable, Optional

import cv2

from inference.model_loader import LoadedModel, load_champion
from inference.video_inference import _process_frame
from schemas.inference import FrameResult


def run_webcam_inference(
    device_index: int = 0,
    confidence_threshold: Optional[float] = None,
    max_frames: Optional[int] = None,
    on_frame: Optional[Callable[[FrameResult, "cv2.Mat"], None]] = None,
    loaded: Optional[LoadedModel] = None,
) -> list[FrameResult]:
    """
    Runs live inference against a USB camera until `max_frames` is reached
    (None = run until interrupted). `on_frame` is called with each frame's
    result and the annotated frame array — the natural hook for a live
    preview window (per the objective's "Live preview, Overlay detections"
    requirements) or, in Sprint AI-4B, for streaming a frame to the
    frontend — deliberately left as a callback rather than this function
    owning a display window itself, so it stays usable headless (e.g. in
    this very sandbox, if a camera were present) or with a GUI.
    """
    from config.settings import get_settings

    settings = get_settings()
    threshold = confidence_threshold if confidence_threshold is not None else settings.confidence_threshold
    loaded = loaded or load_champion()

    cap = cv2.VideoCapture(device_index)
    if not cap.isOpened():
        raise RuntimeError(
            f"Could not open camera device {device_index}. This is expected in a "
            f"headless sandbox with no camera hardware — see "
            f"docs/AI/Troubleshooting.md."
        )

    results: list[FrameResult] = []
    frame_index = 0

    try:
        while max_frames is None or frame_index < max_frames:
            ok, frame = cap.read()
            if not ok:
                break

            detections, result = _process_frame(frame, loaded, threshold)
            frame_result = FrameResult(frameIndex=frame_index, timestampSeconds=time.time(), detections=detections)
            results.append(frame_result)

            if on_frame:
                annotated = result.plot()
                on_frame(frame_result, annotated)

            frame_index += 1
    finally:
        cap.release()

    return results
