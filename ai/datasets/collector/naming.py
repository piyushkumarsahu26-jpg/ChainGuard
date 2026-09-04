"""
Automatic naming for collected (real) dataset images.

Per docs/chainguard-ai-technical-design-phase3a.md, Step 7:
"{class}_{source}_{timestamp}_{shortHash}.jpg" — human-readable at a
glance, collision-proof via the hash suffix.
"""
import hashlib
import time
from pathlib import Path

from datasets.config import DamageClass


def generate_filename(damage_class: DamageClass, source: str, content: bytes | None = None, extension: str = "jpg") -> str:
    """
    `content`, if provided (e.g. the raw image bytes being imported), is
    hashed to produce the short-hash suffix — meaning two genuinely
    identical files always get related-but-distinguishable names rather
    than colliding on a race between two capture calls within the same
    second. If not provided (e.g. a live webcam frame not yet encoded),
    falls back to a hash of the current high-resolution timestamp.
    """
    timestamp = time.strftime("%Y%m%dT%H%M%S")
    basis = content if content is not None else str(time.time_ns()).encode("utf-8")
    short_hash = hashlib.sha256(basis).hexdigest()[:8]
    return f"{damage_class}_{source}_{timestamp}_{short_hash}.{extension}"


def is_generated_name(filename: str) -> bool:
    """True if `filename` matches this module's own naming convention —
    used by the batch importer to avoid re-importing its own prior output
    if pointed at a directory that already contains processed files."""
    stem = Path(filename).stem
    parts = stem.split("_")
    return len(parts) >= 4 and parts[0] in (
        "SAFE", "TORN", "OPENED", "CRUSHED", "TAPED", "PARTIAL_DAMAGE"
    )
