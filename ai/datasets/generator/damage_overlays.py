"""
Class-specific damage overlays.

Per docs/chainguard-ai-technical-design-phase3a.md, Step 6, item 6
("Class-specific damage overlay"). Each function takes a clean envelope
image and returns (modified_image, bounding_box) where bounding_box is the
pixel-space region a detector should learn to flag — computed directly from
where the overlay was drawn, which is exactly the "no manual annotation
needed for synthetic data" advantage the design document calls out.

Honesty note (not in the original design doc, added here because it
matters for anyone extending this later): these are first-pass, clearly
synthetic-looking techniques (drawn polygons, alpha blending, simple pixel
displacement) — good enough to bootstrap training per the design's stated
purpose, not a claim of photorealism. A future sprint may want to swap
harder classes (CRUSHED especially) for more sophisticated deformation.
"""
import math
import random
from dataclasses import dataclass

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

from datasets.config import DamageClass


@dataclass
class BoundingBox:
    x: int
    y: int
    width: int
    height: int

    def to_yolo(self, image_width: int, image_height: int) -> tuple[float, float, float, float]:
        """Normalized (center_x, center_y, width, height), 0-1 — YOLO label format."""
        cx = (self.x + self.width / 2) / image_width
        cy = (self.y + self.height / 2) / image_height
        return (cx, cy, self.width / image_width, self.height / image_height)


def _envelope_bbox(envelope: Image.Image, margin: int = 0) -> BoundingBox:
    w, h = envelope.size
    return BoundingBox(margin, margin, w - 2 * margin, h - 2 * margin)


def apply_safe(envelope: Image.Image, rng: random.Random) -> tuple[Image.Image, BoundingBox]:
    return envelope, _envelope_bbox(envelope)


def _tighten_bbox_from_diff(original: Image.Image, damaged: Image.Image, geometric_bbox: "BoundingBox", pad: int = 4, threshold: int = 18) -> "BoundingBox":
    """AI Improvement Phase: annotation-quality fix. Every apply_*() function
    above computes its bounding box from the *parameters* it drew with
    (e.g. "the tear polygon's own points") — reasonable, but not the same
    thing as "the region where the rendered pixels actually changed."
    Blur/antialiasing at overlay edges, alpha-blended tape, and the
    partial-damage blend-back can all make the box implied by drawing
    parameters measurably looser than what a human labeler looking at the
    final image would draw.

    This recomputes the box from a real per-pixel difference between the
    damaged image and the same envelope with no damage applied, thresholded
    to ignore near-invisible antialiasing noise, then intersected with the
    geometric box (expanded by `pad`) so a stray, unrelated pixel diff
    somewhere else in the image (there shouldn't be one, but this is a
    safety bound, not an assumption) can't blow the box up. Falls back to
    the geometric box unchanged if the diff is empty (e.g. apply_safe,
    which has nothing to tighten around).
    """
    orig_arr = np.asarray(original.convert("RGB"), dtype=np.int16)
    dmg_arr = np.asarray(damaged.convert("RGB"), dtype=np.int16)
    if orig_arr.shape != dmg_arr.shape:
        return geometric_bbox  # sizes differ (e.g. tape rotation expanded the crop) -- not safely comparable pixel-for-pixel

    diff = np.abs(orig_arr - dmg_arr).sum(axis=2)  # (h, w)
    changed = diff > threshold
    if not changed.any():
        return geometric_bbox

    ys, xs = np.where(changed)
    diff_x0, diff_x1 = int(xs.min()), int(xs.max())
    diff_y0, diff_y1 = int(ys.min()), int(ys.max())

    geo_x0, geo_y0 = geometric_bbox.x - pad, geometric_bbox.y - pad
    geo_x1, geo_y1 = geometric_bbox.x + geometric_bbox.width + pad, geometric_bbox.y + geometric_bbox.height + pad

    x0 = max(diff_x0, geo_x0)
    y0 = max(diff_y0, geo_y0)
    x1 = min(diff_x1, geo_x1)
    y1 = min(diff_y1, geo_y1)
    if x1 <= x0 or y1 <= y0:
        return geometric_bbox  # intersection degenerate -- keep the geometric box rather than emit an invalid one

    h, w = orig_arr.shape[:2]
    x0, y0 = max(0, x0), max(0, y0)
    x1, y1 = min(w, x1), min(h, y1)
    return BoundingBox(x0, y0, x1 - x0, y1 - y0)


def apply_seal_open(envelope: Image.Image, rng: random.Random) -> tuple[Image.Image, BoundingBox]:
    """New class (AI Improvement Phase): the security seal specifically is
    broken/compromised, distinct from apply_opened's full-width flap
    cavity. Real-world distinction this models: an envelope can have its
    flap fully closed-looking while the seal itself (wax, sticker, or
    tamper strip) has been broken and pressed back down -- a subtler,
    arguably more security-relevant signal than an obviously gaping flap,
    and one this project's class list had no way to represent before this
    class existed. Rendered as a small, localized circular seal centered
    on the flap edge (a realistic seal placement) with a crack pattern and
    a lifted/peeling fragment, kept deliberately small and centered so the
    class is visually distinguishable from OPENED at a glance, not just by
    label name.
    """
    img = envelope.copy()
    draw = ImageDraw.Draw(img)
    w, h = img.size

    seal_r = max(6, int(min(w, h) * rng.uniform(0.07, 0.11)))
    cx = w // 2 + rng.randint(-int(w * 0.08), int(w * 0.08))
    cy = int(h * 0.32) + rng.randint(-int(h * 0.04), int(h * 0.04))  # near the flap edge, where a real seal sits

    seal_color = rng.choice([(150, 30, 30), (120, 90, 40), (60, 60, 65)])  # wax-red, brass/foil, grey security-sticker tones
    draw.ellipse([cx - seal_r, cy - seal_r, cx + seal_r, cy + seal_r], fill=seal_color)

    # Crack lines through the seal, plus one lifted/peeled fragment drawn
    # in the envelope's own base tone showing through -- the visual cue
    # that this seal is broken, not just present.
    for _ in range(rng.randint(3, 5)):
        angle = rng.uniform(0, 360)
        dx, dy = math.cos(math.radians(angle)) * seal_r, math.sin(math.radians(angle)) * seal_r
        draw.line([(cx, cy), (cx + dx, cy + dy)], fill=(20, 15, 12), width=rng.randint(1, 2))

    frag_angle = rng.uniform(0, 360)
    fx = cx + math.cos(math.radians(frag_angle)) * seal_r * 0.5
    fy = cy + math.sin(math.radians(frag_angle)) * seal_r * 0.5
    frag_r = seal_r * rng.uniform(0.3, 0.5)
    draw.ellipse([fx - frag_r, fy - frag_r, fx + frag_r, fy + frag_r], fill=tuple(min(255, c + 15) for c in envelope.getpixel((min(w - 1, int(fx)), min(h - 1, int(fy))))))

    box = BoundingBox(int(cx - seal_r * 1.15), int(cy - seal_r * 1.15), int(seal_r * 2.3), int(seal_r * 2.3))
    return img, box


def apply_torn(envelope: Image.Image, rng: random.Random) -> tuple[Image.Image, BoundingBox]:
    img = envelope.copy()
    draw = ImageDraw.Draw(img)
    w, h = img.size

    edge = rng.choice(["top", "right"])
    if edge == "top":
        y0 = rng.randint(int(h * 0.05), int(h * 0.25))
        points = [(0, y0)]
        x = 0
        while x < w:
            x += rng.randint(int(w * 0.05), int(w * 0.15))
            points.append((min(x, w), y0 + rng.randint(-12, 12)))
        points += [(w, 0), (0, 0)]
        bbox = BoundingBox(0, 0, w, max(p[1] for p in points[:-2]) + 10)
    else:
        x0 = rng.randint(int(w * 0.75), int(w * 0.95))
        points = [(x0, 0)]
        y = 0
        while y < h:
            y += rng.randint(int(h * 0.05), int(h * 0.15))
            points.append((x0 + rng.randint(-12, 12), min(y, h)))
        points += [(w, h), (w, 0)]
        bbox = BoundingBox(min(p[0] for p in points[:-2]) - 10, 0, w - min(p[0] for p in points[:-2]) + 10, h)

    draw.polygon(points, fill=(25, 22, 20))
    # A few loose fiber-like lines along the tear edge for texture.
    for _ in range(6):
        px, py = rng.choice(points[:-2])
        draw.line([(px, py), (px + rng.randint(-8, 8), py + rng.randint(4, 14))], fill=(60, 55, 50), width=1)

    return img, bbox


def apply_opened(envelope: Image.Image, rng: random.Random) -> tuple[Image.Image, BoundingBox]:
    img = envelope.copy()
    draw = ImageDraw.Draw(img)
    w, h = img.size

    flap_height = rng.randint(int(h * 0.18), int(h * 0.32))
    apex_x = w // 2 + rng.randint(-int(w * 0.1), int(w * 0.1))
    # The flap's fold line, plus a darker open cavity beneath it.
    draw.polygon([(0, 0), (w, 0), (apex_x, flap_height)], fill=(35, 30, 28))
    draw.line([(0, 0), (apex_x, flap_height)], fill=(15, 13, 12), width=2)
    draw.line([(w, 0), (apex_x, flap_height)], fill=(15, 13, 12), width=2)

    return img, BoundingBox(0, 0, w, flap_height + 6)


def apply_crushed(envelope: Image.Image, rng: random.Random) -> tuple[Image.Image, BoundingBox]:
    img = envelope.copy()
    draw = ImageDraw.Draw(img)
    w, h = img.size

    region_x = rng.randint(0, w // 3)
    region_w = rng.randint(w // 3, int(w * 0.6))
    fold_count = rng.randint(3, 5)
    for i in range(fold_count):
        x = region_x + int(region_w * i / fold_count) + rng.randint(-6, 6)
        shade = rng.randint(15, 45)
        draw.line([(x, 0), (x + rng.randint(-15, 15), h)], fill=(shade, shade, shade), width=rng.randint(2, 4))

    # Slight overall darkening of the crushed region, applied via a soft
    # blur of a drawn mask, to look like a shadowed crease rather than
    # flat drawn lines only.
    mask = Image.new("L", img.size, 0)
    mdraw = ImageDraw.Draw(mask)
    mdraw.rectangle([region_x, 0, region_x + region_w, h], fill=60)
    mask = mask.filter(ImageFilter.GaussianBlur(radius=8))
    dark = Image.new("RGB", img.size, (10, 10, 10))
    img = Image.composite(dark, img, mask)

    return img, BoundingBox(region_x, 0, region_w, h)


def apply_taped(envelope: Image.Image, rng: random.Random) -> tuple[Image.Image, BoundingBox]:
    img = envelope.copy().convert("RGBA")
    w, h = img.size

    tape_w = rng.randint(int(w * 0.35), int(w * 0.6))
    tape_h = rng.randint(int(h * 0.08), int(h * 0.14))
    tx = rng.randint(0, w - tape_w)
    ty = rng.randint(0, h - tape_h)
    angle = rng.uniform(-8, 8)

    tape = Image.new("RGBA", (tape_w, tape_h), (225, 220, 195, 160))
    tdraw = ImageDraw.Draw(tape)
    for i in range(0, tape_w, 10):
        tdraw.line([(i, 0), (i, tape_h)], fill=(200, 195, 170, 60), width=1)
    tape = tape.rotate(angle, expand=True, resample=Image.BICUBIC)

    img.alpha_composite(tape, (tx, ty))
    return img.convert("RGB"), BoundingBox(tx, ty, tape.width, tape.height)


def apply_partial_damage(envelope: Image.Image, rng: random.Random) -> tuple[Image.Image, BoundingBox]:
    """A smaller/blended version of one other damage type, per the design
    document's description of this class as a deliberate catch-all."""
    base_fn = rng.choice([apply_torn, apply_crushed, apply_taped])
    img, bbox = base_fn(envelope, rng)
    # Shrink the affected region's visual intensity by blending back toward
    # the original, undamaged envelope — "partial" damage, not full damage.
    blended = Image.blend(envelope, img, alpha=rng.uniform(0.35, 0.6))
    shrink = 0.6
    small_bbox = BoundingBox(
        int(bbox.x + bbox.width * (1 - shrink) / 2),
        int(bbox.y + bbox.height * (1 - shrink) / 2),
        int(bbox.width * shrink),
        int(bbox.height * shrink),
    )
    return blended, small_bbox


_OVERLAY_FUNCTIONS = {
    "SAFE": apply_safe,
    "TORN": apply_torn,
    "OPENED": apply_opened,
    "CRUSHED": apply_crushed,
    "TAPED": apply_taped,
    "PARTIAL_DAMAGE": apply_partial_damage,
    "SEAL_OPEN": apply_seal_open,
}


def apply_damage(envelope: Image.Image, damage_class: DamageClass, rng: random.Random) -> tuple[Image.Image, BoundingBox]:
    damaged, geometric_bbox = _OVERLAY_FUNCTIONS[damage_class](envelope, rng)
    if damage_class == "SAFE":
        return damaged, geometric_bbox  # nothing to tighten around -- the box is deliberately the whole envelope
    tightened_bbox = _tighten_bbox_from_diff(envelope, damaged, geometric_bbox)
    return damaged, tightened_bbox
