"""
Procedural background generation.

Deliberately fully procedural (gradients + numpy noise textures) rather
than compositing onto real stock photos — this is a better fit for a
*synthetic* generator anyway (fully parametric, reproducible from a seed)
and avoids any question of where background photos would have come from.

AI Improvement Phase: expanded from 3 fixed-color themes to 7, each now
randomized *within* a plausible color range (not two fixed RGB tuples) --
"increase diversity across... backgrounds" meant this was a real, direct
gap: every previous "desk" background was the exact same two colors, just
noise-perturbed, which is a much narrower distribution than real desks/
shelves/tables actually span. Added themes matching realistic contexts
this project's own domain implies (a security envelope is handled at a
printing press, in a vehicle during transport, at a treasury counter, in
storage), not just generic surfaces.
"""
import random

import numpy as np
from PIL import Image

# Each theme is a (low, high) RGB range to sample two random gradient
# endpoint colors from, not two fixed colors — real surfaces of the same
# "kind" vary far more than a single fixed swatch implies.
BACKGROUND_PALETTES = {
    "desk": ((95, 75, 55), (165, 145, 120)),
    "shelf": ((70, 70, 78), (145, 145, 155)),
    "table": ((50, 42, 38), (125, 108, 96)),
    "cardboard_box": ((110, 85, 55), (175, 145, 105)),  # transport packaging context
    "vehicle_interior": ((30, 30, 34), (95, 92, 88)),  # in-transit context
    "treasury_counter": ((60, 65, 60), (140, 142, 130)),  # institutional counter/floor
    "storage_room": ((40, 38, 42), (100, 98, 108)),  # dim storage/warehouse
}


def generate_background(size: tuple[int, int], rng: random.Random) -> Image.Image:
    """Random gradient + subtle texture noise, one of several palette
    themes, each themselves randomized within a real color range and a
    randomized gradient direction (not always the same left-to-right
    sweep) — see module docstring for why this changed."""
    width, height = size
    theme = rng.choice(list(BACKGROUND_PALETTES.keys()))
    low, high = BACKGROUND_PALETTES[theme]
    color_a = tuple(rng.randint(low[i], high[i]) for i in range(3))
    color_b = tuple(rng.randint(low[i], high[i]) for i in range(3))

    # Gradient direction varies (horizontal/vertical/diagonal either way)
    # instead of always the same left-to-right sweep — a real light
    # source isn't always positioned the same way relative to the camera.
    direction = rng.choice(["horizontal", "vertical", "diagonal_down", "diagonal_up"])
    yy, xx = np.mgrid[0:height, 0:width].astype(np.float32)
    if direction == "horizontal":
        t = xx / max(width - 1, 1)
    elif direction == "vertical":
        t = yy / max(height - 1, 1)
    elif direction == "diagonal_down":
        t = (xx / max(width - 1, 1) + yy / max(height - 1, 1)) / 2
    else:
        t = (xx / max(width - 1, 1) + (1 - yy / max(height - 1, 1))) / 2

    gradient = np.zeros((height, width, 3), dtype=np.float32)
    for i in range(3):
        gradient[:, :, i] = color_a[i] + (color_b[i] - color_a[i]) * t

    # Subtle per-pixel texture noise so the background isn't a flat gradient.
    noise = np.random.default_rng(rng.randint(0, 2**31)).normal(0, 6, size=(height, width, 3))
    combined = np.clip(gradient + noise, 0, 255).astype(np.uint8)

    return Image.fromarray(combined, mode="RGB")
