"""
Dataset generator CLI.

Usage:
    python -m datasets.generator.cli --config datasets/configs/sample.yaml

This is the "reusable script that can generate large datasets on demand"
Sprint AI-2 was asked to build — the only difference between generating the
30-image sample shipped in this repo and generating the 3,000-image
production dataset from docs/chainguard-ai-technical-design-phase3a.md,
Step 5 is which config file you point it at. See datasets/README.md for the
full walkthrough.
"""
import argparse
import sys
import time
from pathlib import Path

from datasets.config import load_generation_config
from datasets.generator.synthetic_generator import SyntheticGenerator
from datasets.manifest import DatasetManifest
from datasets.versioning import cut_version


def run(config_path: str) -> None:
    config = load_generation_config(config_path)
    generator = SyntheticGenerator(config)

    output_dir = Path(config.output_dir)
    datasets_dir = output_dir.parent  # datasets/data/ -> datasets/
    manifest_path = datasets_dir / "manifest.csv"
    manifest = DatasetManifest(manifest_path)

    total = sum(config.images_per_class.values())
    print(f"Generating {total} synthetic images across {len(config.images_per_class)} classes...")
    print(f"  Config: {config_path}")
    print(f"  Output: {output_dir}")
    print(f"  Seed:   {config.seed if config.seed is not None else '(none — non-deterministic)'}")

    started = time.time()
    written_count = 0
    for damage_class, count in config.images_per_class.items():
        if count <= 0:
            continue
        written = generator.generate_batch(damage_class, count, output_dir, manifest)
        written_count += len(written)
        print(f"  {damage_class}: {len(written)} images")

    manifest.save()
    elapsed = time.time() - started
    print(f"Done: {written_count} images in {elapsed:.1f}s. Manifest: {manifest_path}")

    version = cut_version(datasets_dir, manifest)
    print(f"Dataset version: {version.version} (hash {version.manifestHash})")


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate a synthetic ChainGuard envelope-damage dataset.")
    parser.add_argument("--config", required=True, help="Path to a YAML config (see datasets/configs/)")
    args = parser.parse_args()

    if not Path(args.config).exists():
        print(f"Config file not found: {args.config}", file=sys.stderr)
        sys.exit(1)

    run(args.config)


if __name__ == "__main__":
    main()
