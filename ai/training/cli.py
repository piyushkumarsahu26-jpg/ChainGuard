"""
Training CLI — orchestrates the full Sprint AI-3 pipeline in one command.

Usage:
    python -m training.cli --config training/configs/sample_training.yaml
    python -m training.cli --config training/configs/sample_training.yaml --no-promote
    python -m training.cli --config training/configs/sample_training.yaml --skip-export

This is the single command that ties together every module built this
sprint: dataset prep (training/dataset_prep.py) -> train (training/
train.py) -> evaluate (evaluation/evaluate.py) -> compare against the
current champion (evaluation/compare_models.py) -> optionally promote
(services/model_registry.py) -> export to ONNX (training/export.py) ->
generate reports (training/reports.py). Each step is also independently
callable/testable — this file is orchestration only, no new logic.
"""
import argparse
import sys
from pathlib import Path

from evaluation.compare_models import promote_experiment_to_registry, should_promote
from evaluation.evaluate import evaluate_experiment, print_report
from services.model_registry import ModelNotAvailableError, get_champion, register_model
from training.config import load_training_config
from training.export import export_onnx
from training.reports import generate_all_reports
from training.train import train


def run_pipeline(config_path: str, do_promote: bool = True, do_export: bool = True) -> None:
    config = load_training_config(config_path)

    print("=" * 60)
    print(f"ChainGuard Training Pipeline — {config.experiment_name}")
    print("=" * 60)

    metrics = train(config)

    from training.experiments import list_experiments
    training_dir = Path(config.runs_dir).parent
    record = list_experiments(training_dir)[-1]  # the experiment train() just completed

    validation = evaluate_experiment(record)
    print_report(validation)

    entry = promote_experiment_to_registry(training_dir, record, record.datasetVersion)

    if do_promote:
        try:
            champion = get_champion()
            champion_metrics = champion.metrics.model_dump()
        except ModelNotAvailableError:
            champion_metrics = None

        if should_promote(metrics, champion_metrics):
            register_model(entry, promote_to_champion=True)
            print(f"Promoted to champion: {entry.version}")
        else:
            print(f"Not promoted — did not beat current champion ({champion_metrics})")
    else:
        print("Skipping promotion (--no-promote)")

    if do_export and validation.bestWeights:
        try:
            onnx_path = export_onnx(validation.bestWeights, config.image_size)
            print(f"Exported ONNX: {onnx_path}")
        except Exception as exc:
            print(f"ONNX export failed (non-fatal — .pt weights are still usable): {exc}")
    elif do_export:
        print("Skipping export — no best.pt weights were produced")

    report_paths = generate_all_reports(record, training_dir=training_dir)
    print(f"Reports generated: {report_paths}")

    print("=" * 60)
    print(f"Pipeline complete: {record.experimentId}")
    print("=" * 60)


def main() -> None:
    parser = argparse.ArgumentParser(description="Run the full ChainGuard training pipeline.")
    parser.add_argument("--config", required=True, help="Path to a YAML config under training/configs/")
    parser.add_argument("--no-promote", action="store_true", help="Train and evaluate but don't consider champion promotion")
    parser.add_argument("--skip-export", action="store_true", help="Skip ONNX export")
    args = parser.parse_args()

    if not Path(args.config).exists():
        print(f"Config file not found: {args.config}", file=sys.stderr)
        sys.exit(1)

    run_pipeline(args.config, do_promote=not args.no_promote, do_export=not args.skip_export)


if __name__ == "__main__":
    main()
