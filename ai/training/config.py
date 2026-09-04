"""
Training configuration.

Same pattern as datasets/config.py: a Pydantic model, loaded from YAML,
one place all hyperparameters live — nothing hardcoded in train.py itself.
"""
from pathlib import Path
from typing import Literal, Optional

import yaml
from pydantic import BaseModel, Field


class TrainingConfig(BaseModel):
    # --- Dataset selection ---
    dataset_manifest: str = "datasets/manifest.csv"
    dataset_root: str = "datasets"  # base dir manifest filenames are relative to
    train_split: float = 0.8  # remainder goes to validation; see training/dataset_prep.py

    # --- Model ---
    base_weights: str = "yolov8n.pt"  # smallest YOLOv8 variant — see completion report for why
    image_size: int = 64  # small on purpose for the Sprint AI-3 smoke-test config;
    # production_example.yaml uses 640 (standard YOLOv8 training resolution)

    # --- Hyperparameters ---
    epochs: int = 2
    batch_size: int = 4
    learning_rate: float = 0.01
    optimizer: Literal["SGD", "Adam", "AdamW", "auto"] = "auto"
    weight_decay: float = 0.0005
    confidence_threshold: float = 0.25  # used at validation/export time, not training itself
    # AI Improvement Phase: NMS IoU threshold -- previously implicit
    # (Ultralytics' own default, never a config value a training run
    # could deliberately choose). Lower = more aggressive suppression of
    # overlapping boxes (fewer duplicate detections on one object, more
    # risk of merging two genuinely separate nearby objects); higher =
    # the opposite. Default here matches Ultralytics' own stock value
    # (0.7) exactly, verified directly against ultralytics.cfg.
    # get_cfg(DEFAULT_CFG).iou -- this specific project's own training
    # runs set a deliberately different, tuned value in their own config
    # file, not by changing this default.
    nms_iou_threshold: float = 0.7

    # --- Training-time augmentation (AI Improvement Phase) ---
    # Ultralytics' own built-in augmentation, applied fresh every epoch --
    # distinct from datasets/augmentation/augmentor.py (this project's
    # custom *pre*-generation augmentor, a separate, optional stage not
    # used by this specific run; see the AI Improvement Phase report for
    # why). None of these were previously exposed as config -- model.
    # train() was called with Ultralytics' own defaults, un-reviewed and
    # un-tuned by this project. Defaults below match Ultralytics' own
    # stock values exactly, so leaving this section out of a config
    # changes nothing for any *existing* training config/run.
    hsv_h: float = 0.015  # hue jitter
    hsv_s: float = 0.7    # saturation jitter
    hsv_v: float = 0.4    # value/brightness jitter
    degrees: float = 0.0  # rotation, applied on top of the dataset's own baked-in perspective variety
    translate: float = 0.1
    scale: float = 0.5
    fliplr: float = 0.5   # horizontal flip probability
    flipud: float = 0.0
    mosaic: float = 1.0   # probability of 4-image mosaic composition
    mixup: float = 0.0

    # --- Reproducibility ---
    seed: int = 42

    # --- Resumption ---
    resume_from: Optional[str] = None  # path to a checkpoint .pt to resume from

    # --- Experiment naming ---
    experiment_name: str = "smoke_test"
    generator_config_used: Optional[str] = None  # which datasets/configs/*.yaml produced the data, for provenance

    # --- Output ---
    runs_dir: str = "training/runs"


def load_training_config(path: str | Path) -> TrainingConfig:
    with open(path, "r", encoding="utf-8") as f:
        raw = yaml.safe_load(f)
    return TrainingConfig(**raw)
