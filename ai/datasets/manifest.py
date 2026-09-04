"""
Dataset metadata management.

Per docs/chainguard-ai-technical-design-phase3a.md, Step 5: every image gets
a manifest row with filename, class, source, generatorVersion/captureDevice,
collectedAt, resolution, and (for real images) annotator.

CSV, not a database — this manifest travels with the dataset files
themselves (versioned, copied, zipped) rather than living in a system that
requires a running service to read. `datasets.stats` and
`datasets.versioning` both read this file; nothing writes dataset metadata
anywhere else.
"""
import csv
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from pydantic import BaseModel

from datasets.config import DamageClass

MANIFEST_FIELDS = [
    "filename",
    "damageClass",
    "source",  # "synthetic" | "real"
    "generatorVersion",  # set for synthetic images
    "captureDevice",  # set for real images
    "collectedAt",
    "width",
    "height",
    "annotator",  # set for real images once labeled/confirmed
]


class ManifestEntry(BaseModel):
    filename: str
    damageClass: DamageClass
    source: str
    generatorVersion: Optional[str] = None
    captureDevice: Optional[str] = None
    collectedAt: str
    width: int
    height: int
    annotator: Optional[str] = None

    @classmethod
    def now(cls, **kwargs) -> "ManifestEntry":
        kwargs.setdefault("collectedAt", datetime.now(timezone.utc).isoformat())
        return cls(**kwargs)


class DatasetManifest:
    def __init__(self, path: str | Path):
        self.path = Path(path)
        self._entries: list[ManifestEntry] = []
        if self.path.exists():
            self._load()

    def _load(self) -> None:
        with self.path.open("r", newline="", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            for row in reader:
                row["width"] = int(row["width"])
                row["height"] = int(row["height"])
                self._entries.append(ManifestEntry(**row))

    def save(self) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with self.path.open("w", newline="", encoding="utf-8") as f:
            writer = csv.DictWriter(f, fieldnames=MANIFEST_FIELDS)
            writer.writeheader()
            for entry in self._entries:
                writer.writerow(entry.model_dump())

    def add(self, entry: ManifestEntry) -> None:
        self._entries.append(entry)

    def entries(self) -> list[ManifestEntry]:
        return list(self._entries)

    def by_class(self, damage_class: DamageClass) -> list[ManifestEntry]:
        return [e for e in self._entries if e.damageClass == damage_class]

    def by_source(self, source: str) -> list[ManifestEntry]:
        return [e for e in self._entries if e.source == source]

    def content_hash(self) -> str:
        """
        A deterministic hash over (filename, class) pairs, sorted — used by
        datasets.versioning to detect whether the manifest actually changed
        between two version cuts, and by the Phase 3A design's "git-style
        content hash of the dataset manifest at train time" (Step 8)
        provenance requirement, once training exists to consume it.
        """
        import hashlib

        payload = "\n".join(sorted(f"{e.filename}:{e.damageClass}" for e in self._entries))
        return hashlib.sha256(payload.encode("utf-8")).hexdigest()[:16]
