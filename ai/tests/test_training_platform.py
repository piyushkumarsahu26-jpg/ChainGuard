"""
Tests for the Sprint AI-3 training platform.

Deliberately does NOT re-run actual YOLOv8 training in this test suite —
that takes real wall-clock time (seconds-to-minutes even for a tiny smoke
test) and would make `pytest tests/` slow for something that's already
been verified by hand (see docs/chainguard-sprint-ai3-completion-report.md
§5, and the real committed experiment under training/runs/). These tests
cover the surrounding infrastructure — config loading, dataset splitting,
experiment tracking, evaluation report assembly, comparison/promotion
logic, and report generation — all of which are fast, deterministic, and
don't need torch/ultralytics imported to test correctly.
"""
from datetime import datetime, timezone

import pytest

from datasets.manifest import DatasetManifest, ManifestEntry
from evaluation.compare_models import rank_experiments, should_promote
from evaluation.evaluate import evaluate_experiment
from training.config import TrainingConfig, load_training_config
from training.dataset_prep import prepare_yolo_dataset
from training.environment_info import capture_environment_info
from training.experiments import (
    ExperimentRecord,
    complete_experiment,
    fail_experiment,
    list_experiments,
    start_experiment,
)
from training.reports import generate_all_reports


# --- Config -----------------------------------------------------------

def test_training_config_loads_from_yaml():
    config = load_training_config("training/configs/sample_training.yaml")
    assert config.epochs == 2
    assert config.base_weights == "yolov8n.pt"
    assert config.experiment_name == "smoke_test"


def test_training_config_defaults_are_sane():
    config = TrainingConfig()
    assert config.epochs > 0
    assert config.batch_size > 0
    assert 0 < config.train_split < 1


# --- Dataset prep ---------------------------------------------------------

def _build_tiny_manifest(tmp_path, images_root):
    """Builds a manifest + real tiny image files for 2 classes, so
    prepare_yolo_dataset has real files to copy (not just manifest rows
    pointing at nothing)."""
    from PIL import Image

    manifest = DatasetManifest(tmp_path / "manifest.csv")
    for damage_class in ("SAFE", "TORN"):
        class_dir = images_root / damage_class
        class_dir.mkdir(parents=True, exist_ok=True)
        for i in range(4):
            img_path = class_dir / f"{damage_class}_{i}.jpg"
            Image.new("RGB", (32, 32), (100, 100, 100)).save(img_path)
            label_path = img_path.with_suffix(".txt")
            label_path.write_text("0 0.5 0.5 0.5 0.5\n")
            manifest.add(
                ManifestEntry.now(
                    filename=str(img_path.relative_to(images_root.parent)),
                    damageClass=damage_class,
                    source="synthetic",
                    width=32,
                    height=32,
                )
            )
    manifest.save()
    return manifest


def test_prepare_yolo_dataset_splits_and_writes_data_yaml(tmp_path):
    images_root = tmp_path / "synthetic"
    manifest = _build_tiny_manifest(tmp_path, images_root)

    output_dir = tmp_path / "yolo_dataset"
    result = prepare_yolo_dataset(
        manifest_path=tmp_path / "manifest.csv",
        dataset_root=tmp_path,
        output_dir=output_dir,
        train_split=0.75,
        seed=1,
    )

    assert result["counts"]["train"] == 6  # 3 per class x 2 classes
    assert result["counts"]["val"] == 2
    assert (output_dir / "data.yaml").exists()
    assert len(list((output_dir / "images" / "train").glob("*.jpg"))) == 6
    assert len(list((output_dir / "labels" / "train").glob("*.txt"))) == 6


def test_prepare_yolo_dataset_is_stratified_per_class(tmp_path):
    images_root = tmp_path / "synthetic"
    _build_tiny_manifest(tmp_path, images_root)

    output_dir = tmp_path / "yolo_dataset"
    prepare_yolo_dataset(
        manifest_path=tmp_path / "manifest.csv",
        dataset_root=tmp_path,
        output_dir=output_dir,
        train_split=0.75,
        seed=1,
    )

    val_files = [p.stem for p in (output_dir / "images" / "val").glob("*.jpg")]
    assert any(f.startswith("SAFE") for f in val_files)
    assert any(f.startswith("TORN") for f in val_files)


# --- Experiment tracking ------------------------------------------------------

def test_start_complete_experiment_round_trip(tmp_path):
    config = TrainingConfig(experiment_name="unit_test", runs_dir=str(tmp_path / "runs"))
    record = start_experiment(tmp_path, config, dataset_version="v1")
    assert record.status == "running"

    completed = complete_experiment(tmp_path, record.experimentId, metrics={"mAP50": 0.5}, model_version="m1")
    assert completed.status == "completed"
    assert completed.metrics["mAP50"] == 0.5
    assert completed.durationSeconds is not None

    experiments = list_experiments(tmp_path)
    assert len(experiments) == 1


def test_fail_experiment_records_error(tmp_path):
    config = TrainingConfig(experiment_name="unit_test_fail", runs_dir=str(tmp_path / "runs"))
    record = start_experiment(tmp_path, config)
    failed = fail_experiment(tmp_path, record.experimentId, "out of memory")
    assert failed.status == "failed"
    assert failed.error == "out of memory"


def test_environment_info_captures_key_fields():
    info = capture_environment_info()
    assert "python_version" in info
    assert "device_used" in info
    assert info["device_used"] in ("cpu", "cuda", "unknown")


# --- Evaluation / comparison ----------------------------------------------------

def _fake_completed_record(run_dir, metrics, experiment_id="fake_exp"):
    return ExperimentRecord(
        experimentId=experiment_id,
        experimentName="fake",
        status="completed",
        startedAt=datetime.now(timezone.utc).isoformat(),
        completedAt=datetime.now(timezone.utc).isoformat(),
        config={},
        environment={},
        metrics=metrics,
        runDir=str(run_dir),
    )


def test_evaluate_experiment_handles_missing_plots_gracefully(tmp_path):
    record = _fake_completed_record(tmp_path / "nonexistent_run", {"mAP50": 0.0})
    report = evaluate_experiment(record)
    assert report.availablePlots == {}
    assert report.bestWeights is None


def test_rank_experiments_orders_by_metric_descending():
    records = [
        _fake_completed_record("run_a", {"mAP50": 0.3}, experiment_id="exp_a"),
        _fake_completed_record("run_b", {"mAP50": 0.8}, experiment_id="exp_b"),
        _fake_completed_record("run_c", {"mAP50": 0.5}, experiment_id="exp_c"),
    ]
    ranked = rank_experiments(records)
    assert [r.experimentId for r in ranked] == ["exp_b", "exp_c", "exp_a"]
    assert [r.metrics["mAP50"] for r in ranked] == [0.8, 0.5, 0.3]


def test_should_promote_with_no_existing_champion():
    assert should_promote({"mAP50": 0.1}, None) is True


def test_should_promote_requires_meeting_or_beating_champion():
    assert should_promote({"mAP50": 0.6}, {"mAP50": 0.5}) is True
    assert should_promote({"mAP50": 0.3}, {"mAP50": 0.5}) is False


def test_should_promote_allows_small_tolerance():
    # 0.49 vs 0.5 champion — within the default 0.02 tolerance
    assert should_promote({"mAP50": 0.49}, {"mAP50": 0.5}) is True
    # 0.4 vs 0.5 — outside tolerance
    assert should_promote({"mAP50": 0.4}, {"mAP50": 0.5}) is False


# --- Reports -----------------------------------------------------------------

def test_generate_all_reports_produces_three_files(tmp_path):
    from pathlib import Path

    run_dir = tmp_path / "run"
    run_dir.mkdir()
    record = _fake_completed_record(run_dir, {"mAP50": 0.42, "precision": 0.5}, experiment_id="fake_exp")

    paths = generate_all_reports(record)

    assert Path(paths["markdown"]).exists()
    assert Path(paths["json"]).exists()
    assert Path(paths["csv"]).exists()

    markdown_content = Path(paths["markdown"]).read_text()
    assert "fake_exp" in markdown_content
    assert "0.4200" in markdown_content
