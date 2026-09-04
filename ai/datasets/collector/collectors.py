"""
Real dataset collection — REAL IMPLEMENTATION (Sprint AI-2).

Per docs/chainguard-ai-technical-design-phase3a.md, Step 7.

Honesty note on WebcamCollector: this sandbox has no camera device and no
display, so live capture cannot be executed or verified here the way
BatchImporter's logic can (see tests/test_collectors.py, which only tests
BatchImporter for exactly this reason). WebcamCollector's code is real and
written to the same interface, with cv2 imported lazily inside the method
that needs it so importing this module doesn't require opencv at all —
BatchImporter and everything else in datasets/ has zero dependency on it.
"""
import shutil
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

from datasets.collector.naming import generate_filename
from datasets.config import DamageClass
from datasets.manifest import DatasetManifest, ManifestEntry
from datasets.validator.quality_validator import QualityValidator


@dataclass
class ImportResult:
    imported: list[Path] = field(default_factory=list)
    rejected: list[tuple[Path, str]] = field(default_factory=list)  # (path, reason)
    duplicates: list[tuple[Path, str]] = field(default_factory=list)  # (path, matched_filename)


class BatchImporter:
    """
    Walks a source directory of images, quality-checks and de-duplicates
    each one, and copies passing images into a pending-review directory
    with an auto-generated filename — per the design document, staged for
    human class-confirmation rather than auto-accepted into the dataset.
    """

    def __init__(self, validator: Optional[QualityValidator] = None):
        self.validator = validator or QualityValidator()

    def import_directory(
        self,
        source_dir: str | Path,
        pending_review_dir: str | Path,
        damage_class_hint: Optional[DamageClass] = None,
    ) -> ImportResult:
        source_dir = Path(source_dir)
        pending_review_dir = Path(pending_review_dir)
        pending_review_dir.mkdir(parents=True, exist_ok=True)

        result = ImportResult()
        existing_hashes: dict[str, "imagehash.ImageHash"] = {}

        image_paths = sorted(
            p for p in source_dir.rglob("*") if p.suffix.lower() in (".jpg", ".jpeg", ".png")
        )

        for path in image_paths:
            validation = self.validator.check_image(path)
            if not validation.passed:
                result.rejected.append((path, validation.reason or "failed validation"))
                continue

            is_dup, matched = self.validator.check_duplicate(path, existing_hashes)
            if is_dup:
                result.duplicates.append((path, matched or "unknown"))
                continue

            content = path.read_bytes()
            new_name = generate_filename(damage_class_hint or "PARTIAL_DAMAGE", "batch_import", content=content, extension=path.suffix.lstrip("."))
            dest = pending_review_dir / new_name
            shutil.copy2(path, dest)

            existing_hashes[new_name] = self.validator.compute_hash(dest)
            result.imported.append(dest)

        return result

    def confirm_labels(
        self,
        pending_review_dir: str | Path,
        labels: dict[str, DamageClass],
        manifest: DatasetManifest,
        annotator: str,
        capture_device: str = "batch import",
    ) -> list[Path]:
        """
        Second stage: a human has reviewed `pending_review_dir` and
        provided `labels` (filename -> confirmed class). Moves each
        confirmed file into the manifest as a real, labeled entry. Files
        not present in `labels` are left in the pending directory
        untouched — nothing is silently auto-labeled.
        """
        from PIL import Image

        pending_review_dir = Path(pending_review_dir)
        confirmed: list[Path] = []

        for filename, damage_class in labels.items():
            path = pending_review_dir / filename
            if not path.exists():
                continue
            with Image.open(path) as img:
                width, height = img.size
            manifest.add(
                ManifestEntry.now(
                    filename=str(path),
                    damageClass=damage_class,
                    source="real",
                    captureDevice=capture_device,
                    width=width,
                    height=height,
                    annotator=annotator,
                )
            )
            confirmed.append(path)

        return confirmed


class WebcamCollector:
    """
    Not exercised by any test in this sprint — see this module's docstring.
    Written against the same real interface future sprints (and a real
    demo dry-run, per Phase 3A's Demo Mode discussion) will use.
    """

    def capture_frame(self, damage_class: DamageClass, output_dir: str | Path, device_index: int = 0) -> Path:
        try:
            import cv2
        except ImportError as exc:
            raise RuntimeError(
                "opencv-python is required for webcam capture and is not installed "
                "(deliberately not in requirements-dataset.txt — see requirements.txt's "
                "header comment). Install it with: pip install opencv-python"
            ) from exc

        output_dir = Path(output_dir)
        output_dir.mkdir(parents=True, exist_ok=True)

        cap = cv2.VideoCapture(device_index)
        try:
            if not cap.isOpened():
                raise RuntimeError(f"Could not open camera device {device_index}")
            ok, frame = cap.read()
            if not ok:
                raise RuntimeError("Failed to capture a frame")

            filename = generate_filename(damage_class, "webcam")
            output_path = output_dir / filename
            cv2.imwrite(str(output_path), frame)
            return output_path
        finally:
            cap.release()
