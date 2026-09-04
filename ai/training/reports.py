"""
Training reports — REAL IMPLEMENTATION (Sprint AI-3).

Generates the four formats the objective lists: Markdown summary, JSON
report, CSV metrics, and points at Ultralytics' own results.csv as the
training history (not re-generated — it already exists per-experiment,
see evaluation/evaluate.py's ValidationReport.resultsCsv).
"""
import csv
import json
import shutil
from pathlib import Path

from evaluation.evaluate import ValidationReport, evaluate_experiment
from training.experiments import ExperimentRecord


def _report_dir(record: ExperimentRecord) -> Path:
    path = Path(record.runDir) / "report"
    path.mkdir(parents=True, exist_ok=True)
    return path


def generate_markdown_report(record: ExperimentRecord, validation: ValidationReport) -> Path:
    lines = [
        f"# Training Report — {record.experimentId}",
        "",
        f"**Status:** {record.status}",
        f"**Started:** {record.startedAt}",
        f"**Completed:** {record.completedAt or '—'}",
        f"**Duration:** {f'{record.durationSeconds:.1f}s' if record.durationSeconds else '—'}",
        f"**Dataset version:** {record.datasetVersion or 'unknown'}",
        "",
        "## Configuration",
        "",
        "| Parameter | Value |",
        "|---|---|",
    ]
    for key, value in record.config.items():
        lines.append(f"| {key} | {value} |")

    lines += ["", "## Metrics", "", "| Metric | Value |", "|---|---|"]
    for key, value in validation.metrics.items():
        formatted = f"{value:.4f}" if isinstance(value, float) else str(value)
        lines.append(f"| {key} | {formatted} |")

    lines += ["", "## Environment", "", "| Field | Value |", "|---|---|"]
    for key, value in record.environment.items():
        lines.append(f"| {key} | {value} |")

    lines += ["", "## Artifacts", ""]
    for label, path in validation.availablePlots.items():
        lines.append(f"- **{label}**: `{path}`")
    if validation.bestWeights:
        lines.append(f"- **Best weights (PyTorch)**: `{validation.bestWeights}`")
    if not validation.availablePlots.get("prCurve"):
        lines.append("")
        lines.append("_No PR curve — expected for a degenerate/tiny validation run; see evaluation/evaluate.py._")

    path = _report_dir(record) / "report.md"
    path.write_text("\n".join(lines) + "\n")
    return path


def generate_json_report(record: ExperimentRecord, validation: ValidationReport) -> Path:
    payload = {
        "experiment": record.model_dump(),
        "validation": validation.model_dump(),
    }
    path = _report_dir(record) / "report.json"
    path.write_text(json.dumps(payload, indent=2))
    return path


def generate_csv_metrics(record: ExperimentRecord, validation: ValidationReport) -> Path:
    path = _report_dir(record) / "metrics.csv"
    with path.open("w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(["metric", "value"])
        for key, value in validation.metrics.items():
            writer.writerow([key, value])
    return path


def export_training_history(record: ExperimentRecord) -> Path | None:
    """
    Copies Ultralytics' own results.csv (real per-epoch loss/metric
    history, already written natively during training — not
    regenerated) into the report/ folder, so all of a run's reports live
    together.
    """
    source = Path(record.runDir) / "results.csv"
    if not source.exists():
        return None
    dest = _report_dir(record) / "training_history.csv"
    shutil.copy2(source, dest)
    return dest


def export_experiment_log(training_dir: str | Path, output_path: str | Path) -> Path:
    """
    One row per experiment ever run — the cross-experiment log, distinct
    from export_training_history's per-epoch, single-experiment detail.
    Reads training/experiments.json directly rather than requiring the
    caller to have every ExperimentRecord in hand already.
    """
    from training.experiments import list_experiments

    records = list_experiments(training_dir)
    output_path = Path(output_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    fieldnames = ["experimentId", "experimentName", "status", "startedAt", "completedAt", "durationSeconds", "datasetVersion", "modelVersion"]
    with output_path.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames + ["mAP50", "precision", "recall", "f1"])
        writer.writeheader()
        for r in records:
            row = {k: getattr(r, k) for k in fieldnames}
            metrics = r.metrics or {}
            row.update({k: metrics.get(k) for k in ("mAP50", "precision", "recall", "f1")})
            writer.writerow(row)
    return output_path


def generate_all_reports(record: ExperimentRecord, training_dir: str | Path | None = None) -> dict[str, str]:
    """Generates every report format and returns their paths — the single
    entry point training/cli.py calls after a training run."""
    validation = evaluate_experiment(record)
    md_path = generate_markdown_report(record, validation)
    json_path = generate_json_report(record, validation)
    csv_path = generate_csv_metrics(record, validation)
    paths = {"markdown": str(md_path), "json": str(json_path), "csv": str(csv_path)}

    history_path = export_training_history(record)
    if history_path:
        paths["trainingHistory"] = str(history_path)

    if training_dir:
        log_path = export_experiment_log(training_dir, Path(training_dir) / "experiment_log.csv")
        paths["experimentLog"] = str(log_path)

    return paths
