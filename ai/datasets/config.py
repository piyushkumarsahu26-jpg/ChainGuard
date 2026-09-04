"""
Dataset configuration.

Central place for the DamageClass type (imported by every dataset
submodule, rather than each one defining its own copy) and the
GenerationConfig that drives the synthetic generator's CLI.

Design note (Sprint AI-2, not specified in the Phase 3A design document):
configuration is YAML, loaded via a Pydantic model — matching the pattern
already established for training configs (training/configs/README.md) so
there's exactly one "how do I configure a run" convention across the whole
ai/ codebase, not a different one per module.
"""
from pathlib import Path
from typing import Literal

import yaml
from pydantic import BaseModel, Field

DamageClass = Literal["SAFE", "TORN", "OPENED", "CRUSHED", "TAPED", "PARTIAL_DAMAGE", "SEAL_OPEN"]

ALL_CLASSES: list[DamageClass] = ["SAFE", "TORN", "OPENED", "CRUSHED", "TAPED", "PARTIAL_DAMAGE", "SEAL_OPEN"]


class AugmentationConfig(BaseModel):
    """Per Phase 3A design doc, Step 5 'Augmentation strategy'."""
    rotation_degrees: float = 15.0
    brightness_range: tuple[float, float] = (0.7, 1.3)
    contrast_range: tuple[float, float] = (0.7, 1.3)
    color_jitter_range: tuple[float, float] = (0.8, 1.2)
    gaussian_noise_std: float = 8.0
    blur_probability: float = 0.4
    motion_blur_probability: float = 0.2
    jpeg_quality_range: tuple[int, int] = (40, 85)
    variants_per_image: int = 3


class GenerationConfig(BaseModel):
    """Drives datasets/generator/cli.py. See configs/sample.yaml for a small
    example and configs/production_example.yaml for a full-scale one —
    both documented in datasets/README.md."""
    image_size: tuple[int, int] = (320, 320)
    images_per_class: dict[str, int] = Field(default_factory=lambda: {c: 5 for c in ALL_CLASSES})
    output_dir: str = "datasets/synthetic"
    seed: int | None = 42
    apply_augmentation: bool = True
    augmentation: AugmentationConfig = Field(default_factory=AugmentationConfig)
    generator_version: str = "v1.0.0"


def load_generation_config(path: str | Path) -> GenerationConfig:
    with open(path, "r", encoding="utf-8") as f:
        raw = yaml.safe_load(f)
    return GenerationConfig(**raw)
