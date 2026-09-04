"""
Dataset quality control — REAL IMPLEMENTATION (Sprint AI-2).

Per docs/chainguard-ai-technical-design-phase3a.md, Step 6 ("Quality
control") and Step 7 ("Quality verification", "Duplicate detection") —
shared by both the synthetic generator's spot-checking and the real-data
collector's pending-review queue.

Blur detection uses a hand-rolled Laplacian-variance check (numpy 2D
convolution with a fixed 3x3 kernel) rather than OpenCV's cv2.Laplacian —
same reasoning as augmentation.py: this is a small, one-off calculation on
dataset-prep images, not a hot path, so it doesn't justify pulling in
OpenCV as a dependency for one function.
"""
from dataclasses import dataclass
from pathlib import Path

import imagehash
import numpy as np
from PIL import Image

_LAPLACIAN_KERNEL = np.array([[0, 1, 0], [1, -4, 1], [0, 1, 0]], dtype=np.float64)


@dataclass
class ValidationResult:
    passed: bool
    reason: str | None = None
    metrics: dict | None = None


class QualityValidator:
    def __init__(
        self,
        min_width: int = 96,
        min_height: int = 96,
        blur_variance_threshold: float = 15.0,
        min_mean_brightness: float = 15.0,
        max_mean_brightness: float = 240.0,
        duplicate_hash_distance: int = 4,
    ):
        self.min_width = min_width
        self.min_height = min_height
        self.blur_variance_threshold = blur_variance_threshold
        self.min_mean_brightness = min_mean_brightness
        self.max_mean_brightness = max_mean_brightness
        self.duplicate_hash_distance = duplicate_hash_distance

    @staticmethod
    def _laplacian_variance(gray: np.ndarray) -> float:
        """Higher variance = sharper edges = less blur. A near-flat
        (blurry) image produces a low-variance Laplacian response."""
        padded = np.pad(gray, 1, mode="edge")
        h, w = gray.shape
        conv = np.zeros_like(gray, dtype=np.float64)
        for i in range(3):
            for j in range(3):
                weight = _LAPLACIAN_KERNEL[i, j]
                if weight == 0:
                    continue
                conv += weight * padded[i:i + h, j:j + w]
        return float(conv.var())

    def check_image(self, image_path: str | Path) -> ValidationResult:
        path = Path(image_path)
        if not path.exists():
            return ValidationResult(False, f"File does not exist: {path}")

        try:
            img = Image.open(path)
            img.verify()  # cheap corruption check
            img = Image.open(path).convert("RGB")  # reopen; verify() leaves the file unusable for further reads
        except Exception as exc:
            return ValidationResult(False, f"Unreadable/corrupt image: {exc}")

        width, height = img.size
        if width < self.min_width or height < self.min_height:
            return ValidationResult(False, f"Resolution {width}x{height} below minimum {self.min_width}x{self.min_height}")

        gray = np.array(img.convert("L"), dtype=np.float64)
        blur_variance = self._laplacian_variance(gray)
        if blur_variance < self.blur_variance_threshold:
            return ValidationResult(False, f"Too blurry (Laplacian variance {blur_variance:.1f} < {self.blur_variance_threshold})", {"blurVariance": blur_variance})

        mean_brightness = float(gray.mean())
        if not (self.min_mean_brightness <= mean_brightness <= self.max_mean_brightness):
            return ValidationResult(False, f"Brightness {mean_brightness:.1f} outside acceptable range", {"meanBrightness": mean_brightness})

        return ValidationResult(True, metrics={"blurVariance": blur_variance, "meanBrightness": mean_brightness, "width": width, "height": height})

    def compute_hash(self, image_path: str | Path) -> imagehash.ImageHash:
        return imagehash.phash(Image.open(image_path))

    def check_duplicate(self, image_path: str | Path, existing_hashes: dict[str, imagehash.ImageHash]) -> tuple[bool, str | None]:
        """
        Returns (is_duplicate, matched_filename). `existing_hashes` maps
        filename -> already-computed phash, so callers building a pending-
        review queue don't recompute hashes for the whole existing pool on
        every new image.
        """
        candidate = self.compute_hash(image_path)
        for filename, existing_hash in existing_hashes.items():
            if candidate - existing_hash <= self.duplicate_hash_distance:
                return True, filename
        return False, None
