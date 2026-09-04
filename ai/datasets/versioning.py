"""
Dataset versioning.

Deliberately structured like services/model_registry.py from Sprint AI-1 —
same shape (a small JSON registry file, an entry-per-version, a "current"
pointer) for the same reason: one JSON-registry convention across the
codebase instead of a different one per concern. Not specified this way in
the Phase 3A design document (which only said "each dataset versioned");
this is Sprint AI-2's concrete design decision for how.

A dataset version is a snapshot of the manifest at a point in time — cutting
a version does not copy or move any image files, it records which manifest
state a version tag refers to (via content_hash) plus summary statistics,
so `datasets/versions.json` stays small even as the dataset grows large.
"""
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from pydantic import BaseModel

from datasets.manifest import DatasetManifest


class DatasetVersionEntry(BaseModel):
    version: str
    createdAt: str
    manifestHash: str
    totalImages: int
    perClassCounts: dict[str, int]
    sourceBreakdown: dict[str, int]


class DatasetVersionRegistry(BaseModel):
    versions: list[DatasetVersionEntry] = []
    currentVersion: Optional[str] = None


def _registry_path(datasets_dir: str | Path) -> Path:
    return Path(datasets_dir) / "versions.json"


def load_registry(datasets_dir: str | Path) -> DatasetVersionRegistry:
    path = _registry_path(datasets_dir)
    if not path.exists():
        return DatasetVersionRegistry()
    with path.open("r", encoding="utf-8") as f:
        return DatasetVersionRegistry(**json.load(f))


def save_registry(datasets_dir: str | Path, registry: DatasetVersionRegistry) -> None:
    path = _registry_path(datasets_dir)
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as f:
        json.dump(registry.model_dump(), f, indent=2)
        f.write("\n")


def _next_version_tag(registry: DatasetVersionRegistry) -> str:
    existing = [v.version for v in registry.versions if v.version.startswith("v")]
    numbers = []
    for v in existing:
        try:
            numbers.append(int(v[1:].split(".")[0]))
        except ValueError:
            continue
    next_major = (max(numbers) + 1) if numbers else 1
    return f"v{next_major}"


def cut_version(datasets_dir: str | Path, manifest: DatasetManifest, version_tag: Optional[str] = None) -> DatasetVersionEntry:
    """
    Snapshots the current manifest state as a new dataset version. If the
    manifest's content hash matches the current version exactly, returns
    the existing entry instead of creating a duplicate — cutting a version
    twice in a row without generating anything new is a no-op, not a
    growing list of identical versions.
    """
    registry = load_registry(datasets_dir)
    manifest_hash = manifest.content_hash()

    if registry.versions and registry.versions[-1].manifestHash == manifest_hash:
        return registry.versions[-1]

    entries = manifest.entries()
    per_class: dict[str, int] = {}
    per_source: dict[str, int] = {}
    for e in entries:
        per_class[e.damageClass] = per_class.get(e.damageClass, 0) + 1
        per_source[e.source] = per_source.get(e.source, 0) + 1

    tag = version_tag or _next_version_tag(registry)
    entry = DatasetVersionEntry(
        version=tag,
        createdAt=datetime.now(timezone.utc).isoformat(),
        manifestHash=manifest_hash,
        totalImages=len(entries),
        perClassCounts=per_class,
        sourceBreakdown=per_source,
    )
    registry.versions.append(entry)
    registry.currentVersion = tag
    save_registry(datasets_dir, registry)
    return entry


def list_versions(datasets_dir: str | Path) -> list[DatasetVersionEntry]:
    return load_registry(datasets_dir).versions
