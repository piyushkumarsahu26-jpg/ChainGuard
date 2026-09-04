"""
Dataset augmentation — REAL IMPLEMENTATION (Sprint AI-2).

Implements every technique named in docs/chainguard-ai-technical-design-
phase3a.md, Step 5 "Augmentation strategy" (rotation, brightness/contrast
jitter, Gaussian noise, motion blur, JPEG compression artifacts) using
Pillow + numpy rather than Albumentations.

This is a deliberate, documented deviation from that design document's
implied tooling (which named Albumentations as "the" tool): Albumentations'
main advantage over hand-rolled transforms is *bounding-box-aware*
augmentation for training pipelines — and no training exists yet in this
project. Pulling in Albumentations (and its opencv-python-headless
dependency) now, for a sprint that only needs image-level transforms,
would be exactly the kind of "install a large dependency nothing imports"
mistake Sprint AI-1's `requirements.txt`/`requirements-ml.txt` split was
built to avoid. When a future training sprint needs bbox-aware
augmentation, `requirements-ml.txt` already has Albumentations versioned
and ready.
"""
import io
import random

import numpy as np
from PIL import Image, ImageEnhance, ImageFilter

from datasets.config import AugmentationConfig


class Augmentor:
    def __init__(self, config: AugmentationConfig | None = None, seed: int | None = None):
        self.config = config or AugmentationConfig()
        self._rng = random.Random(seed)

    def _rotate(self, img: Image.Image) -> Image.Image:
        angle = self._rng.uniform(-self.config.rotation_degrees, self.config.rotation_degrees)
        return img.rotate(angle, resample=Image.BICUBIC, expand=False, fillcolor=(0, 0, 0))

    def _brightness_contrast(self, img: Image.Image) -> Image.Image:
        b_lo, b_hi = self.config.brightness_range
        c_lo, c_hi = self.config.contrast_range
        img = ImageEnhance.Brightness(img).enhance(self._rng.uniform(b_lo, b_hi))
        img = ImageEnhance.Contrast(img).enhance(self._rng.uniform(c_lo, c_hi))
        return img

    def _color_jitter(self, img: Image.Image) -> Image.Image:
        lo, hi = self.config.color_jitter_range
        return ImageEnhance.Color(img).enhance(self._rng.uniform(lo, hi))

    def _gaussian_noise(self, img: Image.Image) -> Image.Image:
        if self.config.gaussian_noise_std <= 0:
            return img
        arr = np.array(img).astype(np.int16)
        noise = np.random.default_rng(self._rng.randint(0, 2**31)).normal(0, self.config.gaussian_noise_std, arr.shape)
        arr = np.clip(arr + noise, 0, 255).astype(np.uint8)
        return Image.fromarray(arr, mode="RGB")

    def _blur(self, img: Image.Image) -> Image.Image:
        if self._rng.random() < self.config.blur_probability:
            return img.filter(ImageFilter.GaussianBlur(radius=self._rng.uniform(0.5, 1.8)))
        return img

    def _motion_blur(self, img: Image.Image) -> Image.Image:
        """
        A directional motion-blur approximation: convolve with a short
        linear kernel at a random angle. Pillow has no built-in motion
        blur; this is a small, self-contained numpy implementation rather
        than a reason to add opencv.
        """
        if self._rng.random() >= self.config.motion_blur_probability:
            return img

        kernel_size = self._rng.choice([5, 7, 9])
        angle = self._rng.uniform(0, 180)
        kernel = np.zeros((kernel_size, kernel_size))
        kernel[kernel_size // 2, :] = 1.0
        kernel_img = Image.fromarray((kernel * 255).astype(np.uint8)).rotate(angle, resample=Image.BICUBIC)
        kernel = np.array(kernel_img).astype(np.float64)
        kernel_sum = kernel.sum()
        if kernel_sum == 0:
            return img
        kernel /= kernel_sum

        arr = np.array(img).astype(np.float64)
        pad = kernel_size // 2
        padded = np.pad(arr, ((pad, pad), (pad, pad), (0, 0)), mode="edge")
        out = np.zeros_like(arr)
        for c in range(3):
            # Direct 2D convolution — fine for a small kernel on
            # dataset-prep-time images; this is not a training-loop hot path.
            for i in range(kernel_size):
                for j in range(kernel_size):
                    weight = kernel[i, j]
                    if weight == 0:
                        continue
                    out[:, :, c] += weight * padded[i:i + arr.shape[0], j:j + arr.shape[1], c]
        return Image.fromarray(np.clip(out, 0, 255).astype(np.uint8), mode="RGB")

    def _compression_artifacts(self, img: Image.Image) -> Image.Image:
        lo, hi = self.config.jpeg_quality_range
        quality = self._rng.randint(lo, hi)
        buf = io.BytesIO()
        img.save(buf, format="JPEG", quality=quality)
        buf.seek(0)
        return Image.open(buf).convert("RGB")

    def augment_one(self, image: Image.Image) -> Image.Image:
        """Applies the full augmentation chain once, returning a new image
        (the input is never mutated)."""
        img = image.copy()
        img = self._rotate(img)
        img = self._brightness_contrast(img)
        img = self._color_jitter(img)
        img = self._gaussian_noise(img)
        img = self._blur(img)
        img = self._motion_blur(img)
        img = self._compression_artifacts(img)
        return img

    def augment_batch(self, image: Image.Image, count: int | None = None) -> list[Image.Image]:
        """Produces `count` (default: config.variants_per_image) augmented
        variants of a single source image."""
        n = count if count is not None else self.config.variants_per_image
        return [self.augment_one(image) for _ in range(n)]
