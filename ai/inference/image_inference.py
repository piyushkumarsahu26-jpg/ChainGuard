"""
Single-image inference — REAL IMPLEMENTATION (Sprint AI-4A).

Confidence threshold: read from config.settings (Sprint AI-1's
`confidence_threshold` field — designed then, finally used now) rather
than hardcoded, and overridable per-request (routers/inference.py exposes
this) so a caller can ask for a stricter/looser cutoff without a config
file edit.

NMS: handled entirely inside ultralytics' predict() call — see
model_loader.py's docstring for why this isn't hand-rolled here.
"""
from pathlib import Path
from typing import Optional, Union

from PIL import Image

from config.settings import get_settings
from inference.model_loader import LoadedModel, load_champion
from inference.performance import measure
from schemas.inference import BoundingBoxOut, Detection, ImagePredictionResult


def _results_to_detections(result, class_names: dict[int, str]) -> list[Detection]:
    detections = []
    for box in result.boxes:
        xyxy = box.xyxy[0].tolist()
        x1, y1, x2, y2 = xyxy
        class_id = int(box.cls[0])
        detections.append(
            Detection(
                predictedClass=class_names.get(class_id, str(class_id)),
                confidence=float(box.conf[0]),
                boundingBox=BoundingBoxOut(x=x1, y=y1, width=x2 - x1, height=y2 - y1),
            )
        )
    return detections


def predict_image(
    image: Union[str, Path, Image.Image],
    confidence_threshold: Optional[float] = None,
    save_annotated: bool = False,
    output_dir: Optional[str | Path] = None,
    loaded: Optional[LoadedModel] = None,
) -> ImagePredictionResult:
    """
    Runs inference on a single image. `loaded` lets callers (e.g.
    batch_inference.py, video_inference.py) pass an already-loaded model
    instead of hitting load_champion()'s cache-check on every single item
    in a batch/video — a real, meaningful cost saving for anything beyond
    a single image.
    """
    settings = get_settings()
    threshold = confidence_threshold if confidence_threshold is not None else settings.confidence_threshold

    loaded = loaded or load_champion()
    pil_image = Image.open(image).convert("RGB") if isinstance(image, (str, Path)) else image
    width, height = pil_image.size

    with measure(loaded.device, loaded.entry.version) as perf:
        results = loaded.model.predict(
            pil_image,
            imgsz=loaded.entry.imageSize,
            conf=threshold,
            device=loaded.device,
            verbose=False,
        )

    result = results[0]
    class_names = result.names
    detections = _results_to_detections(result, class_names)

    annotated_path = None
    if save_annotated:
        output_dir = Path(output_dir or "inference_output")
        output_dir.mkdir(parents=True, exist_ok=True)
        annotated_path = output_dir / f"annotated_{Path(str(image)).stem if isinstance(image, (str, Path)) else 'image'}.jpg"
        annotated_array = result.plot()  # BGR numpy array with boxes drawn, per Ultralytics
        Image.fromarray(annotated_array[:, :, ::-1]).save(annotated_path)  # BGR -> RGB

    return ImagePredictionResult(
        detections=detections,
        processingTimeMs=perf.inferenceTimeMs,
        modelVersion=loaded.entry.version,
        modelFormat=loaded.format,
        imageWidth=width,
        imageHeight=height,
        annotatedImagePath=str(annotated_path) if annotated_path else None,
    )
