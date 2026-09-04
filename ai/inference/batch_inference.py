"""
Batch inference — REAL IMPLEMENTATION (Sprint AI-4A).

Loads the champion model once (via image_inference.predict_image's
`loaded` parameter) and reuses it across every image in the batch —
loading a YOLO model per-image would be a real, avoidable cost.
"""
import csv
import json
import time
from pathlib import Path
from typing import Optional

from inference.image_inference import predict_image
from inference.model_loader import load_champion
from schemas.inference import BatchItemResult, BatchPredictionResult


def predict_batch(
    image_paths: list[str | Path],
    output_dir: str | Path,
    confidence_threshold: Optional[float] = None,
    save_annotated: bool = True,
) -> BatchPredictionResult:
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    loaded = load_champion()
    results: list[BatchItemResult] = []
    started = time.perf_counter()

    for path in image_paths:
        path = Path(path)
        try:
            prediction = predict_image(
                path,
                confidence_threshold=confidence_threshold,
                save_annotated=save_annotated,
                output_dir=output_dir / "annotated",
                loaded=loaded,
            )
            results.append(BatchItemResult(filename=str(path), detections=prediction.detections))
        except Exception as exc:
            results.append(BatchItemResult(filename=str(path), detections=[], error=str(exc)))

    elapsed_ms = (time.perf_counter() - started) * 1000
    succeeded = sum(1 for r in results if r.error is None)
    failed = len(results) - succeeded

    json_path = output_dir / "batch_report.json"
    json_path.write_text(json.dumps([r.model_dump() for r in results], indent=2))

    csv_path = output_dir / "batch_report.csv"
    with csv_path.open("w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(["filename", "numDetections", "topClass", "topConfidence", "error"])
        for r in results:
            top = max(r.detections, key=lambda d: d.confidence) if r.detections else None
            writer.writerow([
                r.filename,
                len(r.detections),
                top.predictedClass if top else "",
                f"{top.confidence:.4f}" if top else "",
                r.error or "",
            ])

    return BatchPredictionResult(
        totalImages=len(image_paths),
        succeeded=succeeded,
        failed=failed,
        results=results,
        processingTimeMs=elapsed_ms,
        jsonReportPath=str(json_path),
        csvReportPath=str(csv_path),
    )
