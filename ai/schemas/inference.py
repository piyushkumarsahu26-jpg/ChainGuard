"""
Inference response schemas.

Bounding box shape ({x, y, width, height} in pixel coordinates) matches
Detection.boundingBox's existing JSON shape on the Node backend exactly —
per docs/chainguard-ai-technical-design-phase3a.md, Step 9 — so Sprint
AI-4B's eventual POST /api/v1/detections call needs no transform.
"""
from typing import Optional

from pydantic import BaseModel


class BoundingBoxOut(BaseModel):
    x: float
    y: float
    width: float
    height: float


class Detection(BaseModel):
    predictedClass: str
    confidence: float
    boundingBox: BoundingBoxOut


class ImagePredictionResult(BaseModel):
    detections: list[Detection]
    processingTimeMs: float
    modelVersion: str
    modelFormat: str  # "pt" | "onnx"
    imageWidth: int
    imageHeight: int
    annotatedImagePath: Optional[str] = None


class FrameResult(BaseModel):
    frameIndex: int
    timestampSeconds: float
    detections: list[Detection]


class VideoPredictionResult(BaseModel):
    sourcePath: str
    totalFrames: int
    framesProcessed: int
    frameSkip: int
    frameResults: list[FrameResult]
    processingTimeMs: float
    modelVersion: str
    annotatedVideoPath: Optional[str] = None


class BatchItemResult(BaseModel):
    filename: str
    detections: list[Detection]
    error: Optional[str] = None


class BatchPredictionResult(BaseModel):
    totalImages: int
    succeeded: int
    failed: int
    results: list[BatchItemResult]
    processingTimeMs: float
    jsonReportPath: Optional[str] = None
    csvReportPath: Optional[str] = None


class PerformanceSnapshot(BaseModel):
    device: str
    inferenceTimeMs: float
    fps: Optional[float] = None
    memoryUsedMb: float
    memoryAvailableMb: float


class MetricsResponse(BaseModel):
    totalPredictions: int
    averageInferenceTimeMs: float
    averageFps: Optional[float] = None
    device: str
    modelVersion: Optional[str] = None
    lastPredictionAt: Optional[str] = None
