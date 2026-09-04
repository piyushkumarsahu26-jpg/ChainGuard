"""
Dataset statistics — REAL IMPLEMENTATION (Sprint AI-2).

Reads datasets/manifest.csv (via datasets.manifest.DatasetManifest) and
reports per-class counts, source (synthetic vs real) breakdown, and flags
class imbalance — the tool a human runs before deciding "is this dataset
ready for training yet", not something training itself calls.
"""
from dataclasses import dataclass, field

from datasets.config import ALL_CLASSES
from datasets.manifest import DatasetManifest


@dataclass
class DatasetSummary:
    totalImages: int
    perClassCounts: dict[str, int]
    sourceBreakdown: dict[str, int]
    missingClasses: list[str] = field(default_factory=list)
    imbalanceWarnings: list[str] = field(default_factory=list)


class DatasetStatistics:
    def __init__(self, imbalance_ratio_threshold: float = 3.0):
        """
        `imbalance_ratio_threshold`: if the largest class has more than
        this multiple of images than the smallest non-empty class, a
        warning is raised — a heuristic, not a hard rule (the design
        document's recommended sizes are themselves only a starting
        point, per Phase 3A Step 5).
        """
        self.imbalance_ratio_threshold = imbalance_ratio_threshold

    def summarize(self, manifest: DatasetManifest) -> DatasetSummary:
        entries = manifest.entries()
        per_class: dict[str, int] = {c: 0 for c in ALL_CLASSES}
        per_source: dict[str, int] = {}

        for e in entries:
            per_class[e.damageClass] = per_class.get(e.damageClass, 0) + 1
            per_source[e.source] = per_source.get(e.source, 0) + 1

        missing = [c for c in ALL_CLASSES if per_class.get(c, 0) == 0]

        warnings = []
        nonzero_counts = [c for c in per_class.values() if c > 0]
        if len(nonzero_counts) >= 2:
            ratio = max(nonzero_counts) / min(nonzero_counts)
            if ratio > self.imbalance_ratio_threshold:
                largest = max(per_class, key=per_class.get)
                smallest = min((c for c in per_class if per_class[c] > 0), key=per_class.get)
                warnings.append(
                    f"Class imbalance: '{largest}' ({per_class[largest]}) has "
                    f"{ratio:.1f}x more images than '{smallest}' ({per_class[smallest]})"
                )

        return DatasetSummary(
            totalImages=len(entries),
            perClassCounts=per_class,
            sourceBreakdown=per_source,
            missingClasses=missing,
            imbalanceWarnings=warnings,
        )

    def print_report(self, manifest: DatasetManifest) -> None:
        """Human-readable console report — what datasets/cli_stats.py prints."""
        summary = self.summarize(manifest)
        print(f"Total images: {summary.totalImages}")
        print("Per-class counts:")
        for cls, count in summary.perClassCounts.items():
            marker = " (MISSING)" if count == 0 else ""
            print(f"  {cls}: {count}{marker}")
        print("Source breakdown:")
        for source, count in summary.sourceBreakdown.items():
            print(f"  {source}: {count}")
        if summary.imbalanceWarnings:
            print("Warnings:")
            for w in summary.imbalanceWarnings:
                print(f"  - {w}")
