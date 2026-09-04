"""
Model registry: reads and writes models/weights/manifest.json.

Per the Phase 3A design document, Step 4.4: every trained model gets a
manifest entry {version, trainedAt, datasetVersion, metrics, filename,
isChampion}, weights are never overwritten in place, and promotion is a
manifest flag flip rather than a retrain.

This sprint implements the registry itself (real file I/O — there is
nothing "training" or "inference" about reading/writing a JSON manifest,
so it's in scope as infrastructure). It does NOT implement anything that
calls into YOLOv8, torch, or any training/inference code — the manifest is
simply empty until a future sprint's training pipeline writes to it.
"""
import json
from pathlib import Path
from typing import Optional

from pydantic import BaseModel

from config.settings import get_settings
from utils.exceptions import ModelNotAvailableError


class ModelMetrics(BaseModel):
    precision: float
    recall: float
    mAP50: float
    mAP50_95: float
    f1: float
    # AI Improvement Phase: addresses compare_models.py's own documented
    # gap ("per-class breakdown... isn't threaded through... flagged as a
    # Sprint AI-4 follow-up, not silently dropped"). Optional/None for
    # every model registered before this phase -- their manifest entries
    # are untouched, this is purely additive.
    perClass: dict[str, dict[str, float]] | None = None


class ModelEntry(BaseModel):
    version: str
    trainedAt: str
    datasetVersion: str
    metrics: ModelMetrics
    filename: str  # PyTorch (.pt) weights path
    onnxFilename: Optional[str] = None  # ONNX (.onnx) weights path, if exported
    # Added in Sprint AI-4A: the image size the model was trained/exported
    # at. Not optional with a silent default — ONNX exports have a FIXED
    # input shape (confirmed by hitting a real dimension-mismatch error
    # during this sprint's verification: an ONNX model exported at 64x64
    # fails outright if inference requests ultralytics' 640 default). A
    # missing or wrong imageSize doesn't degrade gracefully, so callers
    # must have a real value, not silently assume one.
    imageSize: int
    isChampion: bool = False


class ModelManifest(BaseModel):
    models: list[ModelEntry] = []
    championVersion: Optional[str] = None
    schemaVersion: int = 1


def _manifest_path() -> Path:
    settings = get_settings()
    return Path(settings.model_dir) / "manifest.json"


def load_manifest() -> ModelManifest:
    path = _manifest_path()
    if not path.exists():
        # Defensive default — should never happen once Sprint AI-1's
        # manifest.json is in place, but a fresh clone that only copied
        # code and not the tracked-empty manifest shouldn't crash on
        # startup for a missing file.
        return ModelManifest()
    with path.open("r", encoding="utf-8") as f:
        raw = json.load(f)
    return ModelManifest(**raw)


def save_manifest(manifest: ModelManifest) -> None:
    path = _manifest_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as f:
        json.dump(manifest.model_dump(), f, indent=2)
        f.write("\n")


def list_models() -> list[ModelEntry]:
    return load_manifest().models


def get_champion() -> ModelEntry:
    """
    Returns the current champion model entry.

    Raises ModelNotAvailableError if no model has been trained/promoted
    yet — which is the real, expected state as of Sprint AI-1. This
    function exists now so future inference code (Sprint AI-3+) has a
    single, already-tested place to ask "which model do I load", rather
    than each inference module reading manifest.json itself.
    """
    manifest = load_manifest()
    if not manifest.championVersion:
        raise ModelNotAvailableError()
    for entry in manifest.models:
        if entry.version == manifest.championVersion and entry.isChampion:
            return entry
    # Manifest is in an inconsistent state (championVersion set but no
    # matching entry, or entry not flagged isChampion) — treat the same as
    # "no model available" rather than silently returning something wrong.
    raise ModelNotAvailableError(
        f"Manifest championVersion '{manifest.championVersion}' has no matching model entry"
    )


def register_model(entry: ModelEntry, promote_to_champion: bool = False) -> ModelManifest:
    """
    Adds a new model entry to the manifest. Not called anywhere in this
    sprint (no training exists to produce a model to register) — provided
    now as the real, tested write path a future training sprint calls
    directly, rather than duplicating manifest-writing logic later.
    """
    manifest = load_manifest()
    manifest.models = [m for m in manifest.models if m.version != entry.version]
    if promote_to_champion:
        for m in manifest.models:
            m.isChampion = False
        entry.isChampion = True
        manifest.championVersion = entry.version
    manifest.models.append(entry)
    save_manifest(manifest)
    return manifest
