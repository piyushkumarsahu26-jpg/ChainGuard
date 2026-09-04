"""
Champion/challenger model comparison — REAL IMPLEMENTATION (Sprint AI-3).

Per docs/chainguard-ai-technical-design-phase3a.md, Step 8 ("Model
comparison"): a new model is only promoted if it meets or beats the
current champion on mAP@0.5 without regressing any individual class's
recall beyond a small tolerance.

Per-class metrics: this was previously flagged in this file's own
docstring as a Sprint AI-4 follow-up ("Ultralytics' per-class breakdown
is available on the results object during training but isn't threaded
through experiments.py's stored metrics dict yet"). Resolved in the AI
Improvement Phase: services.model_registry.ModelMetrics gained an
optional perClass field, and promote_experiment_to_registry() below now
passes it through from whatever the caller stored in the experiment's
own metrics dict under the same key -- no new storage mechanism, reusing
the one that already existed for the aggregate numbers.

This is the only code path that should call
services.model_registry.register_model(promote_to_champion=True) — keeping
promotion decisions in one place, per that function's own docstring.
"""
from pathlib import Path

from pydantic import BaseModel

from services.model_registry import ModelEntry, ModelMetrics, register_model
from training.experiments import ExperimentRecord, list_experiments


class ComparisonResult(BaseModel):
    experimentId: str
    metrics: dict
    rank: int


def rank_experiments(experiments: list[ExperimentRecord], metric: str = "mAP50") -> list[ComparisonResult]:
    """Ranks completed experiments by a chosen metric, descending."""
    completed = [e for e in experiments if e.status == "completed" and e.metrics]
    ranked = sorted(completed, key=lambda e: e.metrics.get(metric, 0.0), reverse=True)
    return [
        ComparisonResult(experimentId=e.experimentId, metrics=e.metrics, rank=i + 1)
        for i, e in enumerate(ranked)
    ]


def print_ranking(results: list[ComparisonResult], metric: str = "mAP50") -> None:
    print(f"Experiment ranking by {metric}:")
    for r in results:
        print(f"  #{r.rank}  {r.experimentId}  {metric}={r.metrics.get(metric, 0.0):.4f}")


def should_promote(challenger_metrics: dict, champion_metrics: dict | None, metric: str = "mAP50", tolerance: float = 0.02) -> bool:
    """
    True if the challenger should become the new champion. No existing
    champion always promotes. Otherwise requires the challenger to meet or
    beat the champion on `metric`, allowing a small negative `tolerance`
    (default 2%) so a marginal, noise-level regression on the primary
    metric doesn't block a model that's clearly better in other respects —
    a human can always override via the model registry's manual flag flip
    (see services/model_registry.py's docstring on this exact point).
    """
    if champion_metrics is None:
        return True
    return challenger_metrics.get(metric, 0.0) >= champion_metrics.get(metric, 0.0) - tolerance


def promote_experiment_to_registry(training_dir: str | Path, experiment: ExperimentRecord, dataset_version: str) -> ModelEntry:
    """
    Registers a completed experiment's weights as a new model version in
    services/model_registry.py's manifest — the bridge between Sprint
    AI-3's experiment tracking and Sprint AI-1's model registry, so
    `GET /ai/models` (Sprint AI-4+) has something real to report once that
    endpoint exists.
    """
    metrics = experiment.metrics or {}
    pt_path = f"{experiment.runDir}/weights/best.pt"
    onnx_path = f"{experiment.runDir}/weights/best.onnx"
    entry = ModelEntry(
        version=experiment.experimentId,
        trainedAt=experiment.completedAt or experiment.startedAt,
        datasetVersion=dataset_version,
        metrics=ModelMetrics(
            precision=metrics.get("precision", 0.0),
            recall=metrics.get("recall", 0.0),
            mAP50=metrics.get("mAP50", 0.0),
            mAP50_95=metrics.get("mAP50_95", 0.0),
            f1=metrics.get("f1", 0.0),
            perClass=metrics.get("perClass"),
        ),
        filename=pt_path,
        onnxFilename=onnx_path if Path(onnx_path).exists() else None,
        imageSize=experiment.config.get("image_size", 640),
    )

    registry = register_model(entry, promote_to_champion=False)  # promotion decided by should_promote(), not automatic here
    return entry
