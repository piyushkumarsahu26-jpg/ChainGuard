# Training Guide

Covers Sprint AI-3's training platform.

## Setup

```bash
cd ai
python3 -m venv .venv
source .venv/bin/activate    # or use .venv/bin/python3 directly — see Troubleshooting.md
pip install -r requirements.txt -r requirements-dataset.txt -r requirements-ml.txt
```

`requirements-ml.txt` pulls in PyTorch + Ultralytics + supporting packages — several GB. See `Troubleshooting.md` if you hit disk space or CUDA-dependency issues; this project's own verification hit both and documents the fixes.

## Run the full pipeline

```bash
python -m training.cli --config training/configs/sample_training.yaml
```

This one command: prepares the train/val split from `datasets/manifest.csv`, trains a YOLOv8 model, evaluates it, compares against the current champion, promotes if it wins, exports to ONNX, and generates Markdown/JSON/CSV reports. Real output from an actual run of this exact command ships in `ai/training/runs/smoke_test_6bc0803a/`.

Flags: `--no-promote` (train/evaluate without touching the champion), `--skip-export` (skip ONNX).

## Configuration

Every hyperparameter lives in a YAML file under `training/configs/` — nothing is hardcoded in `train.py`. Key fields (`training/config.py` is the full reference):

| Field | Meaning |
|---|---|
| `base_weights` | `yolov8n.pt` (smallest variant) through `yolov8x.pt` (largest) |
| `image_size` | Training resolution. `sample_training.yaml` uses 64 (fast smoke test); use 640 for real training |
| `epochs`, `batch_size`, `learning_rate`, `optimizer`, `weight_decay` | Standard YOLOv8 hyperparameters, passed straight through to Ultralytics |
| `train_split` | Fraction going to training vs. validation (stratified per class) |
| `seed` | For reproducibility — same seed + same dataset version = same split |
| `resume_from` | Path to a checkpoint `.pt` to resume an interrupted run |

## Individual pipeline stages (if you don't want the full CLI)

```python
from training.config import load_training_config
from training.train import train
from evaluation.evaluate import evaluate_experiment, print_report
from evaluation.compare_models import should_promote
from training.export import export_onnx
from training.reports import generate_all_reports

config = load_training_config("training/configs/sample_training.yaml")
metrics = train(config)  # trains, records the experiment, returns metrics
```

## Experiment tracking

Every run gets a record in `training/experiments.json` (id, status, config snapshot, environment, metrics, duration) plus its own directory under `training/runs/<experiment_id>/` with Ultralytics' native output (checkpoints, confusion matrix, loss curves, `results.csv`).

```python
from training.experiments import list_experiments
for exp in list_experiments("training"):
    print(exp.experimentId, exp.status, exp.metrics)
```

## Model comparison and the registry

```python
from evaluation.compare_models import rank_experiments, print_ranking
from training.experiments import list_experiments

print_ranking(rank_experiments(list_experiments("training")))
```

Promotion (`services/model_registry.py`, built in Sprint AI-1) is decided by `evaluation.compare_models.should_promote()` — meets-or-beats the current champion's mAP50 within a small tolerance. This is the **only** code path that should flip the champion flag; see that function's docstring.

## GPU vs. CPU

`training/train.py`'s `detect_device()` checks `torch.cuda.is_available()` automatically — no config needed. This project's own sandbox has no GPU, so every real run documented here used CPU; the CUDA path is written against the same API and activates automatically on GPU-equipped hardware.

## What this sprint's shipped example proves — and doesn't

The committed `training/runs/smoke_test_6bc0803a/` run trained for 2 epochs on 24 images at 64×64 resolution — a deliberate smoke test, not a usable model (metrics are honestly 0.0 across the board). It proves every stage of the pipeline runs correctly end-to-end. It does not prove the model architecture/hyperparameters are tuned for real envelope-damage detection — that requires the production-scale dataset (`Dataset_Guide.md`) and a real training budget (hundreds of epochs, standard 640px resolution).
