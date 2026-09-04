"""
Dataset statistics CLI.

Usage:
    python -m datasets.stats_cli --manifest datasets/manifest.csv
"""
import argparse
from pathlib import Path

from datasets.manifest import DatasetManifest
from datasets.statistics.dataset_stats import DatasetStatistics


def main() -> None:
    parser = argparse.ArgumentParser(description="Report statistics for a ChainGuard dataset manifest.")
    parser.add_argument("--manifest", default="datasets/manifest.csv")
    args = parser.parse_args()

    if not Path(args.manifest).exists():
        print(f"No manifest found at {args.manifest} — has a dataset been generated yet?")
        return

    manifest = DatasetManifest(args.manifest)
    DatasetStatistics().print_report(manifest)


if __name__ == "__main__":
    main()
