"""
Training engine — REAL IMPLEMENTATION (Sprint AI-3).

Usage:
    python -m training.cli --config training/configs/sample_training.yaml

Design: docs/chainguard-ai-technical-design-phase3a.md, Step 8, refined by
this sprint's completion report (§3 Design Decisions) for the parts the
Phase 3A document left as architecture-level intent rather than concrete
mechanism (experiment tracking shape, checkpoint strategy specifics).
"""
import argparse
import sys
from pathlib import Path

import torch

from training.config import TrainingConfig, load_training_config
from training.dataset_prep import prepare_yolo_dataset
from training.experiments import complete_experiment, fail_experiment, start_experiment
from datasets.manifest import DatasetManifest
from datasets.versioning import list_versions


def detect_device() -> str:
    """GPU detection with CPU fallback — per the objective's explicit
    requirement. This sandbox has no GPU (confirmed during dependency
    verification), so every run here exercises the CPU path; the CUDA
    path is written against the same torch.cuda API and would activate
    automatically on GPU-equipped hardware without any code change."""
    return "cuda" if torch.cuda.is_available() else "cpu"


def _current_dataset_version(dataset_root: str) -> str | None:
    versions = list_versions(dataset_root)
    return versions[-1].version if versions else None


def train(config: TrainingConfig) -> dict:
    """
    Runs one full training experiment: dataset prep, YOLOv8 training via
    Ultralytics, and experiment-record bookkeeping (start/complete/fail).
    Returns the final metrics dict. Raises on failure, after recording the
    failure in the experiment registry — callers should not need their
    own try/except to keep the registry consistent.
    """
    from ultralytics import YOLO  # imported here, not at module top, so
    # importing training.train doesn't require ultralytics/torch to be
    # installed unless a caller actually calls train() — matches the
    # lazy-import pattern already used for WebcamCollector's cv2 import.

    device = detect_device()
    dataset_version = _current_dataset_version(config.dataset_root)

    training_dir = Path(config.runs_dir).parent  # training/runs -> training/
    record = start_experiment(training_dir, config, dataset_version=dataset_version)

    try:
        torch.manual_seed(config.seed)

        prep_output = Path(record.runDir) / "dataset"
        prep_result = prepare_yolo_dataset(
            manifest_path=config.dataset_manifest,
            dataset_root=config.dataset_root,
            output_dir=prep_output,
            train_split=config.train_split,
            seed=config.seed,
        )
        print(f"Dataset prepared: {prep_result['counts']}")

        model = YOLO(config.resume_from or config.base_weights)

        results = model.train(
            data=prep_result["data_yaml"],
            epochs=config.epochs,
            batch=config.batch_size,
            imgsz=config.image_size,
            lr0=config.learning_rate,
            optimizer=config.optimizer,
            weight_decay=config.weight_decay,
            seed=config.seed,
            device=device,
            iou=config.nms_iou_threshold,
            hsv_h=config.hsv_h,
            hsv_s=config.hsv_s,
            hsv_v=config.hsv_v,
            degrees=config.degrees,
            translate=config.translate,
            scale=config.scale,
            fliplr=config.fliplr,
            flipud=config.flipud,
            mosaic=config.mosaic,
            mixup=config.mixup,
            # Absolute path, not relative — a real behavioral difference
            # between ultralytics 8.3.55 (used for the Sprint AI-3 smoke
            # test) and 8.4.115 (this sprint's numpy-2.x fix, see
            # requirements-ml.txt) was discovered here: a *relative*
            # `project` path used to save directly under it (relative to
            # cwd), but with 8.4.115 it gets resolved against Ultralytics'
            # own internal runs-directory concept instead, silently
            # writing to `runs/detect/<project>/<name>` rather than
            # `<project>/<name>`. Passing `.resolve()` here removes the
            # ambiguity regardless of which internal resolution ultralytics
            # uses.
            project=str(Path(record.runDir).parent.resolve()),
            name=Path(record.runDir).name,
            exist_ok=True,
            resume=bool(config.resume_from),
            plots=True,  # generates PR curve, confusion matrix, loss curves — see evaluation/evaluate.py
            verbose=False,
        )

        metrics = _extract_training_metrics(results)
        best_weights = Path(record.runDir) / "weights" / "best.pt"

        complete_experiment(
            training_dir,
            record.experimentId,
            metrics=metrics,
            best_epoch=metrics.get("bestEpoch"),
        )

        print(f"Training complete: {record.experimentId}")
        print(f"  Best weights: {best_weights}")
        print(f"  Metrics: {metrics}")
        return metrics

    except Exception as exc:
        fail_experiment(training_dir, record.experimentId, str(exc))
        raise


def _extract_training_metrics(results) -> dict:
    """
    Pulls the metrics the Sprint AI-3 objective asks for out of
    Ultralytics' results object. Ultralytics' own attribute names don't
    exactly match the objective's terminology (e.g. it reports "map" for
    what the objective calls "mAP@50-95") — this function is the one place
    that translation happens, so nothing downstream needs to know
    Ultralytics' internal naming.
    """
    box = results.box if hasattr(results, "box") else results.results_dict
    if hasattr(box, "mp"):  # Ultralytics Metric object
        return {
            "precision": float(box.mp),
            "recall": float(box.mr),
            "mAP50": float(box.map50),
            "mAP50_95": float(box.map),
            "f1": float(2 * box.mp * box.mr / (box.mp + box.mr)) if (box.mp + box.mr) > 0 else 0.0,
        }
    # Fallback for a plain dict-shaped results object (defensive — keeps
    # this function from crashing training if Ultralytics' return shape
    # changes in a minor version bump).
    return {k: float(v) for k, v in dict(box).items() if isinstance(v, (int, float))}


def main() -> None:
    parser = argparse.ArgumentParser(description="Train a ChainGuard YOLOv8 detection model.")
    parser.add_argument("--config", required=True, help="Path to a YAML config under training/configs/")
    args = parser.parse_args()

    if not Path(args.config).exists():
        print(f"Config file not found: {args.config}", file=sys.stderr)
        sys.exit(1)

    config = load_training_config(args.config)
    train(config)


if __name__ == "__main__":
    main()
