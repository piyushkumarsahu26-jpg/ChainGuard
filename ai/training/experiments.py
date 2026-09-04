"""
Experiment tracking.

Third use of the same JSON-registry shape in this codebase (after
services/model_registry.py in Sprint AI-1 and datasets/versioning.py in
Sprint AI-2) — by now this is the established convention for "a small
append-only JSON index plus one detail record per entry," not a new
pattern being introduced.

Each experiment gets its own directory under training/runs/<experiment_id>/
holding the full config snapshot, environment info, and ultralytics'
native output (weights, results.csv, PR/confusion-matrix plots) — the
top-level training/experiments.json is just an index into these, kept
small so it stays fast to read even as experiments accumulate.
"""
import json
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from pydantic import BaseModel

from training.config import TrainingConfig
from training.environment_info import capture_environment_info


class ExperimentRecord(BaseModel):
    experimentId: str
    experimentName: str
    status: str = "running"  # running | completed | failed
    startedAt: str
    completedAt: Optional[str] = None
    durationSeconds: Optional[float] = None

    datasetVersion: Optional[str] = None
    modelVersion: Optional[str] = None
    config: dict
    environment: dict

    metrics: Optional[dict] = None
    bestEpoch: Optional[int] = None
    runDir: str
    error: Optional[str] = None


class ExperimentRegistry(BaseModel):
    experiments: list[ExperimentRecord] = []


def _registry_path(training_dir: str | Path) -> Path:
    return Path(training_dir) / "experiments.json"


def load_registry(training_dir: str | Path) -> ExperimentRegistry:
    path = _registry_path(training_dir)
    if not path.exists():
        return ExperimentRegistry()
    with path.open("r", encoding="utf-8") as f:
        return ExperimentRegistry(**json.load(f))


def save_registry(training_dir: str | Path, registry: ExperimentRegistry) -> None:
    path = _registry_path(training_dir)
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as f:
        json.dump(registry.model_dump(), f, indent=2)
        f.write("\n")


def start_experiment(training_dir: str | Path, config: TrainingConfig, dataset_version: Optional[str] = None) -> ExperimentRecord:
    experiment_id = f"{config.experiment_name}_{uuid.uuid4().hex[:8]}"
    run_dir = Path(config.runs_dir) / experiment_id

    record = ExperimentRecord(
        experimentId=experiment_id,
        experimentName=config.experiment_name,
        status="running",
        startedAt=datetime.now(timezone.utc).isoformat(),
        datasetVersion=dataset_version,
        config=config.model_dump(),
        environment=capture_environment_info(),
        runDir=str(run_dir),
    )

    registry = load_registry(training_dir)
    registry.experiments.append(record)
    save_registry(training_dir, registry)
    return record


def complete_experiment(
    training_dir: str | Path,
    experiment_id: str,
    metrics: dict,
    model_version: Optional[str] = None,
    best_epoch: Optional[int] = None,
) -> ExperimentRecord:
    registry = load_registry(training_dir)
    record = next(e for e in registry.experiments if e.experimentId == experiment_id)

    started = datetime.fromisoformat(record.startedAt)
    completed = datetime.now(timezone.utc)
    record.status = "completed"
    record.completedAt = completed.isoformat()
    record.durationSeconds = (completed - started).total_seconds()
    record.metrics = metrics
    record.modelVersion = model_version
    record.bestEpoch = best_epoch

    save_registry(training_dir, registry)
    return record


def fail_experiment(training_dir: str | Path, experiment_id: str, error: str) -> ExperimentRecord:
    registry = load_registry(training_dir)
    record = next(e for e in registry.experiments if e.experimentId == experiment_id)
    record.status = "failed"
    record.completedAt = datetime.now(timezone.utc).isoformat()
    record.error = error
    save_registry(training_dir, registry)
    return record


def list_experiments(training_dir: str | Path) -> list[ExperimentRecord]:
    return load_registry(training_dir).experiments


def get_experiment(training_dir: str | Path, experiment_id: str) -> ExperimentRecord:
    return next(e for e in list_experiments(training_dir) if e.experimentId == experiment_id)
