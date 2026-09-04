"""
Synthetic dataset generator — REAL IMPLEMENTATION (Sprint AI-2).

Implements the 11-step pipeline from docs/chainguard-ai-technical-design-
phase3a.md, Step 6, in order: background generation, envelope base render,
perspective, lighting/shadow, class-specific damage overlay (see
damage_overlays.py), color variation, noise, blur, occlusion, compression.

Each generated image gets a YOLO-format label file (from the damage
overlay's bounding box) and a datasets.manifest.ManifestEntry — labeling
happens automatically at generation time because the overlay's placement
is known, exactly as the design document describes as synthetic data's
main practical advantage over hand-labeled real images.
"""
import random
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageEnhance, ImageFilter

from datasets.config import DamageClass, GenerationConfig
from datasets.generator.backgrounds import generate_background
from datasets.generator.damage_overlays import BoundingBox, apply_damage
from datasets.manifest import DatasetManifest, ManifestEntry

ENVELOPE_STOCKS = {
    "manila": (196, 164, 108),
    "white": (240, 238, 230),
    "kraft": (140, 100, 62),
    "security_tint": (150, 165, 185),  # AI Improvement Phase: a bluish security-paper tone, common for sensitive-document envelopes
    "recycled_grey": (168, 162, 150),  # AI Improvement Phase: recycled-stock grey-brown, distinct enough from kraft/manila to add real variety
}


class SyntheticGenerator:
    def __init__(self, config: GenerationConfig):
        self.config = config
        self._rng = random.Random(config.seed)

    # --- individual pipeline steps -----------------------------------

    def _render_envelope_base(self, size: tuple[int, int]) -> Image.Image:
        """Step 2: envelope base render — a procedurally drawn envelope
        shape (rectangle + flap crease line), not a photographed template
        (see damage_overlays.py's module docstring for why: no external
        asset sourcing, fully parametric/reproducible)."""
        stock = self._rng.choice(list(ENVELOPE_STOCKS.keys()))
        base_color = ENVELOPE_STOCKS[stock]
        # AI Improvement Phase: widened from +/-10 to +/-18 -- real paper
        # stock varies more per-sheet (aging, printing, lighting already
        # baked into the physical material) than a narrow jitter implied.
        jitter = tuple(max(0, min(255, c + self._rng.randint(-18, 18))) for c in base_color)

        env = Image.new("RGB", size, jitter)
        draw = ImageDraw.Draw(env)
        w, h = size
        # Subtle flap crease line, a visual cue this is an envelope and not
        # just a blank rectangle.
        draw.line([(0, int(h * 0.35)), (w // 2, 2), (w, int(h * 0.35))], fill=tuple(max(0, c - 25) for c in jitter), width=2)
        return env

    def _apply_perspective(self, img: Image.Image) -> Image.Image:
        """Step 3: perspective changes — a homography via PIL's built-in
        QUAD transform (mild corner displacement, simulates an off-axis
        camera angle rather than perfectly top-down)."""
        w, h = img.size
        # AI Improvement Phase: widened from a fixed 0.06 to a randomized
        # 0.05-0.14 -- "increase diversity across... viewing angles" was a
        # direct, named requirement, and the old fixed jitter produced a
        # narrow band of near-identical mild angles every time.
        jitter = int(min(w, h) * self._rng.uniform(0.05, 0.14))

        def j():
            return self._rng.randint(-jitter, jitter)

        # Source quad = the four corners perturbed; PIL maps this quad onto
        # the full output rectangle, producing the perspective warp.
        quad = (
            j(), j(),
            j(), h + j(),
            w + j(), h + j(),
            w + j(), j(),
        )
        return img.transform((w, h), Image.QUAD, quad, resample=Image.BICUBIC, fillcolor=(0, 0, 0))

    def _apply_lighting_and_shadow(self, img: Image.Image) -> Image.Image:
        """Step 4 + 5: directional lighting gradient and a soft cast
        shadow, composited as alpha overlays."""
        w, h = img.size
        angle = self._rng.uniform(0, 360)
        # AI Improvement Phase: widened from 0.15-0.35 to 0.10-0.48 --
        # "increase diversity across lighting conditions" named directly;
        # the old range never produced a genuinely harsh or genuinely flat
        # lighting example, only a narrow mid-band.
        strength = self._rng.uniform(0.10, 0.48)

        yy, xx = np.mgrid[0:h, 0:w]
        direction = np.deg2rad(angle)
        gradient = (xx * np.cos(direction) + yy * np.sin(direction))
        gradient = (gradient - gradient.min()) / (gradient.max() - gradient.min() + 1e-6)
        light = (gradient * strength * 255).astype(np.int16)

        arr = np.array(img).astype(np.int16)
        arr = np.clip(arr + light[:, :, None] - int(strength * 255 / 2), 0, 255).astype(np.uint8)
        lit = Image.fromarray(arr, mode="RGB")

        # A soft shadow band along one edge, simulating the envelope
        # casting a shadow on the surface beneath it.
        shadow_mask = Image.new("L", (w, h), 0)
        sdraw = ImageDraw.Draw(shadow_mask)
        edge = self._rng.choice(["bottom", "right"])
        band = int((h if edge == "bottom" else w) * 0.15)
        if edge == "bottom":
            sdraw.rectangle([0, h - band, w, h], fill=90)
        else:
            sdraw.rectangle([w - band, 0, w, h], fill=90)
        shadow_mask = shadow_mask.filter(ImageFilter.GaussianBlur(radius=band / 3))
        dark = Image.new("RGB", (w, h), (5, 5, 5))
        return Image.composite(dark, lit, shadow_mask)

    def _apply_color_variation(self, img: Image.Image) -> Image.Image:
        """Step 7: hue/saturation-ish jitter via PIL's Color enhancer."""
        factor = self._rng.uniform(0.75, 1.25)
        return ImageEnhance.Color(img).enhance(factor)

    def _apply_noise(self, img: Image.Image) -> Image.Image:
        """Step 8: sensor noise simulation."""
        arr = np.array(img).astype(np.int16)
        noise = np.random.default_rng(self._rng.randint(0, 2**31)).normal(0, 6, arr.shape)
        arr = np.clip(arr + noise, 0, 255).astype(np.uint8)
        return Image.fromarray(arr, mode="RGB")

    def _apply_blur(self, img: Image.Image) -> Image.Image:
        """Step 9: slight Gaussian blur, applied probabilistically (not
        every image — a fixed-focus camera producing a sharp image is also
        a realistic capture condition)."""
        if self._rng.random() < 0.5:
            return img.filter(ImageFilter.GaussianBlur(radius=self._rng.uniform(0.4, 1.4)))
        return img

    def _apply_occlusion(self, img: Image.Image) -> Image.Image:
        """Step 10: a foreign object (simplified as an opaque blob — a
        hand/stapler-shaped occluder) partially covering the envelope."""
        if self._rng.random() > 0.3:
            return img
        w, h = img.size
        draw = ImageDraw.Draw(img)
        ow, oh = self._rng.randint(int(w * 0.15), int(w * 0.3)), self._rng.randint(int(h * 0.15), int(h * 0.3))
        ox, oy = self._rng.randint(0, w - ow), self._rng.randint(0, h - oh)
        draw.ellipse([ox, oy, ox + ow, oy + oh], fill=(60, 45, 40))
        return img

    def _apply_compression(self, img: Image.Image) -> Image.Image:
        """Step 11: re-encode through JPEG at a randomized quality level."""
        import io

        quality = self._rng.randint(50, 90)
        buf = io.BytesIO()
        img.save(buf, format="JPEG", quality=quality)
        buf.seek(0)
        return Image.open(buf).convert("RGB")

    # --- public interface ---------------------------------------------

    def generate_one(self, damage_class: DamageClass) -> tuple[Image.Image, BoundingBox]:
        """
        Generates a single synthetic image for the given class, per the
        full pipeline above, and returns it with its bounding box (pixel
        coordinates in the final image). Does not write anything to disk —
        that's generate_batch()'s job, so this method stays trivially
        testable in isolation.
        """
        size = self.config.image_size
        background = generate_background(size, self._rng)

        # Envelope occupies a random sub-region of the frame, not the
        # entire canvas — more realistic than an edge-to-edge envelope.
        # AI Improvement Phase: widened from (0.55-0.8, 0.35-0.55) --
        # "increase diversity across envelope types" and real capture
        # distance implies the envelope should sometimes look further
        # away (a wide security-camera-style shot) and sometimes closer
        # (a phone held right up to it) than the old, fairly narrow range
        # allowed for.
        env_w = int(size[0] * self._rng.uniform(0.40, 0.92))
        env_h = int(size[1] * self._rng.uniform(0.25, 0.65))
        envelope = self._render_envelope_base((env_w, env_h))
        envelope = self._apply_perspective(envelope)
        envelope, local_bbox = apply_damage(envelope, damage_class, self._rng)

        offset_x = self._rng.randint(0, size[0] - env_w)
        offset_y = self._rng.randint(0, size[1] - env_h)
        composed = background.copy()
        composed.paste(envelope, (offset_x, offset_y))

        bbox = BoundingBox(local_bbox.x + offset_x, local_bbox.y + offset_y, local_bbox.width, local_bbox.height)

        composed = self._apply_lighting_and_shadow(composed)
        composed = self._apply_color_variation(composed)
        composed = self._apply_noise(composed)
        composed = self._apply_blur(composed)
        composed = self._apply_occlusion(composed)
        composed = self._apply_compression(composed)

        return composed, bbox

    def generate_batch(self, damage_class: DamageClass, count: int, output_dir: Path, manifest: DatasetManifest) -> list[Path]:
        """
        Generates `count` images for one class, writes each image + a
        YOLO-format .txt label to `output_dir/<class>/`, and appends a
        manifest entry for each — this is the method
        datasets/generator/cli.py actually calls.
        """
        class_dir = output_dir / damage_class
        class_dir.mkdir(parents=True, exist_ok=True)

        written: list[Path] = []
        for i in range(count):
            image, bbox = self.generate_one(damage_class)
            filename = f"{damage_class}_synthetic_{self.config.generator_version}_{i:04d}.jpg"
            image_path = class_dir / filename
            image.save(image_path, format="JPEG", quality=92)

            label_path = image_path.with_suffix(".txt")
            cx, cy, bw, bh = bbox.to_yolo(*image.size)
            class_index = list(self.config.images_per_class.keys()).index(damage_class)
            label_path.write_text(f"{class_index} {cx:.6f} {cy:.6f} {bw:.6f} {bh:.6f}\n")

            manifest.add(
                ManifestEntry.now(
                    filename=str(image_path.relative_to(output_dir.parent)),
                    damageClass=damage_class,
                    source="synthetic",
                    generatorVersion=self.config.generator_version,
                    width=image.size[0],
                    height=image.size[1],
                )
            )
            written.append(image_path)

        return written
