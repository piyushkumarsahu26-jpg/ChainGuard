"""
Model loader — REAL IMPLEMENTATION (Sprint AI-4A).

Design decision (verified empirically before writing this, not assumed):
`ultralytics.YOLO()` loads BOTH .pt and .onnx through one unified
interface — same predict() call, same pre/post-processing, same NMS. This
means there is no separate "ONNX runtime path" to hand-roll; the only
per-format difference that actually matters is that ONNX exports have a
FIXED input shape (confirmed by hitting a real dimension-mismatch error
during this sprint's verification), so `imgsz` must be passed explicitly
at inference time rather than relying on ultralytics' 640 default — which
is exactly why services/model_registry.ModelEntry gained a required
`imageSize` field this sprint.

Caching: the loaded model is kept in a module-level singleton, reloaded
only when the registry's champion version changes (or on an explicit
`force_reload=True`) — reloading a YOLO model on every request would add
real latency for no benefit, since a FastAPI process serves many requests
against the same champion between training runs.
"""
from dataclasses import dataclass
from pathlib import Path
from typing import Literal, Optional

import torch

from config.settings import get_settings
from services.model_registry import ModelEntry, get_champion
from utils.exceptions import ModelNotAvailableError

ModelFormat = Literal["pt", "onnx"]


@dataclass
class LoadedModel:
    model: object  # ultralytics.YOLO instance — untyped here to avoid importing ultralytics at module load time
    entry: ModelEntry
    format: ModelFormat
    device: str


_cache: Optional[LoadedModel] = None


def detect_device() -> str:
    """Same GPU-detect/CPU-fallback logic as training/train.py's
    detect_device() — not re-implemented differently, reused via the same
    torch.cuda API so training and inference never disagree about what
    hardware is available."""
    return "cuda" if torch.cuda.is_available() else "cpu"


def _resolve_weights_path(entry: ModelEntry, preferred_format: ModelFormat) -> tuple[Path, ModelFormat]:
    """
    Picks which weights file to actually load, honoring the preferred
    format but falling back to whichever one actually exists on disk —
    a model registered before an ONNX export existed (or where the
    export was since deleted to save disk) shouldn't make the whole
    service unavailable if the .pt file is right there.
    """
    pt_path = Path(entry.filename)
    onnx_path = Path(entry.onnxFilename) if entry.onnxFilename else None

    if preferred_format == "onnx" and onnx_path and onnx_path.exists():
        return onnx_path, "onnx"
    if preferred_format == "pt" and pt_path.exists():
        return pt_path, "pt"

    # Preferred format unavailable — fall back to whichever exists.
    if pt_path.exists():
        return pt_path, "pt"
    if onnx_path and onnx_path.exists():
        return onnx_path, "onnx"

    raise ModelNotAvailableError(
        f"Champion model '{entry.version}' is registered but neither its .pt "
        f"({entry.filename}) nor .onnx ({entry.onnxFilename}) weights file exists on disk."
    )


def load_champion(force_reload: bool = False) -> LoadedModel:
    """
    Returns the currently-loaded champion model, loading (or reloading, if
    the champion has changed since the last call) as needed.
    """
    global _cache
    from ultralytics import YOLO  # lazy import — same reasoning as training/train.py

    entry = get_champion()  # raises ModelNotAvailableError if none — not caught here, it's the correct signal to propagate

    if _cache is not None and _cache.entry.version == entry.version and not force_reload:
        return _cache

    settings = get_settings()
    preferred: ModelFormat = "onnx" if settings.active_model_version == "onnx" else "pt"
    # Note: settings.active_model_version was designed in Sprint AI-1 as a
    # version-string override; repurposing it as a format preference here
    # is a small, deliberate scope decision — see this sprint's completion
    # report §3 for the reasoning (not worth a second settings field for a
    # binary pt/onnx choice with only one real trained model to test against).

    weights_path, resolved_format = _resolve_weights_path(entry, preferred)
    device = detect_device()

    model = YOLO(str(weights_path))

    _cache = LoadedModel(model=model, entry=entry, format=resolved_format, device=device)
    return _cache


def get_cached_model() -> Optional[LoadedModel]:
    """Read-only access for routers/health.py — does NOT trigger a load,
    so a health check never has the side effect of loading a multi-MB
    model into memory just to report status."""
    return _cache
