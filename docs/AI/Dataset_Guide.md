# Dataset Guide

Covers Sprint AI-2's dataset platform. For the full module-by-module reference, see `ai/datasets/README.md` — this guide is the task-oriented walkthrough.

## Generate a dataset

```bash
cd ai
python -m datasets.generator.cli --config datasets/configs/sample.yaml               # 30 images, ships in repo
python -m datasets.generator.cli --config datasets/configs/production_example.yaml   # 3,000 images, training scale
```

To generate a custom size, copy either config and edit `images_per_class`. See `ai/datasets/README.md`'s "Generating datasets of any size" for the full explanation.

## Check dataset health

```bash
python -m datasets.stats_cli --manifest datasets/manifest.csv
```
Reports per-class counts, source breakdown, missing classes, and imbalance warnings.

## Six classes

`SAFE`, `TORN`, `OPENED`, `CRUSHED`, `TAPED`, `PARTIAL_DAMAGE` — see `docs/chainguard-ai-technical-design-phase3a.md`, Step 5, for definitions, and `ai/datasets/generator/damage_overlays.py` for how each is rendered.

## Import real images

Two-stage (`BatchImporter.import_directory()` then `.confirm_labels()`) — nothing is auto-labeled without a human confirming. See `ai/datasets/README.md`'s "Importing real images" section for the full code example.

## Versioning

Every generation run cuts a new dataset version in `datasets/versions.json` (content-hash based — re-running with no new data is a no-op, not a duplicate version). Check the current version:

```python
from datasets.versioning import list_versions
print(list_versions("datasets")[-1])
```

## Current state (as of Sprint AI-3)

30 synthetic images (5/class) ship in `ai/datasets/synthetic/`, version `v1`. This is a smoke-test-scale sample, not a training-ready dataset — Sprint AI-3 trained against it specifically to prove the pipeline works, and got the metrics you'd expect from 24 training images (0.0 across the board — see `docs/chainguard-sprint-ai3-completion-report.md`). Before any real training, run the generator against `production_example.yaml` or a similarly-scaled custom config.
