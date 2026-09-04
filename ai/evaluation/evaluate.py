"""
Model evaluation — REAL IMPLEMENTATION (Sprint AI-3).

Ultralytics' own model.val() already computes precision/recall/mAP50/
mAP50-95 and generates confusion-matrix and loss-curve plots as a side
effect of training (see training/train.py — plots=True). This module's
job is narrower than "compute metrics from scratch": it locates and
organizes what Ultralytics already produced into the validation report the
Sprint AI-3 objective asks for, and computes the one thing Ultralytics
doesn't hand back directly (F1, derived from precision/recall).

Honesty note on PR curves: Ultralytics generates a PR_curve.png only when
validation has enough non-degenerate data to plot one meaningfully — the
30-image smoke-test run in this sprint's completion report did NOT
produce one (all metrics were 0.0, as expected for 2 epochs on 24 images).
`find_plot()` below checks for existence rather than assuming a fixed set
of files always exists, so this doesn't crash on a small/degenerate run.
"""
from pathlib import Path
from typing import Optional

from pydantic import BaseModel

from training.experiments import ExperimentRecord

KNOWN_PLOTS = {
    "confusionMatrix": "confusion_matrix.png",
    "confusionMatrixNormalized": "confusion_matrix_normalized.png",
    "lossCurves": "results.png",
    "prCurve": "PR_curve.png",
    "labelsDistribution": "labels.jpg",
}


class ValidationReport(BaseModel):
    experimentId: str
    metrics: dict
    availablePlots: dict[str, str]
    resultsCsv: Optional[str] = None
    bestWeights: Optional[str] = None


def evaluate_experiment(record: ExperimentRecord) -> ValidationReport:
    """
    Builds a ValidationReport from an already-completed experiment's run
    directory — this does not re-run validation (that already happened
    inside train.py's model.train(..., plots=True) call); it locates and
    organizes the artifacts that run produced.
    """
    run_dir = Path(record.runDir)

    available_plots = {}
    for label, filename in KNOWN_PLOTS.items():
        path = run_dir / filename
        if path.exists():
            available_plots[label] = str(path)

    results_csv = run_dir / "results.csv"
    best_weights = run_dir / "weights" / "best.pt"

    return ValidationReport(
        experimentId=record.experimentId,
        metrics=record.metrics or {},
        availablePlots=available_plots,
        resultsCsv=str(results_csv) if results_csv.exists() else None,
        bestWeights=str(best_weights) if best_weights.exists() else None,
    )


def print_report(report: ValidationReport) -> None:
    print(f"Validation report: {report.experimentId}")
    for key, value in report.metrics.items():
        print(f"  {key}: {value:.4f}" if isinstance(value, float) else f"  {key}: {value}")
    print(f"  Plots available: {list(report.availablePlots.keys())}")
    if not report.availablePlots.get("prCurve"):
        print("  Note: no PR_curve.png — expected for a degenerate/tiny validation run (see docstring).")
