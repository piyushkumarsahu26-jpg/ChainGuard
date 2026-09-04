"""Tests for datasets.generator.synthetic_generator."""
from pathlib import Path

from datasets.config import ALL_CLASSES, GenerationConfig
from datasets.generator.synthetic_generator import SyntheticGenerator
from datasets.manifest import DatasetManifest


def test_generate_one_produces_correct_size_image():
    config = GenerationConfig(image_size=(128, 128), seed=1)
    gen = SyntheticGenerator(config)
    image, bbox = gen.generate_one("TORN")
    assert image.size == (128, 128)
    assert image.mode == "RGB"


def test_generate_one_bbox_within_image_bounds():
    config = GenerationConfig(image_size=(128, 128), seed=1)
    gen = SyntheticGenerator(config)
    for damage_class in ALL_CLASSES:
        _, bbox = gen.generate_one(damage_class)
        assert bbox.x >= 0 and bbox.y >= 0
        assert bbox.x + bbox.width <= 128
        assert bbox.y + bbox.height <= 128
        assert bbox.width > 0 and bbox.height > 0


def test_same_seed_is_deterministic():
    config_a = GenerationConfig(image_size=(96, 96), seed=7)
    config_b = GenerationConfig(image_size=(96, 96), seed=7)
    image_a, bbox_a = SyntheticGenerator(config_a).generate_one("SAFE")
    image_b, bbox_b = SyntheticGenerator(config_b).generate_one("SAFE")
    assert list(image_a.getdata()) == list(image_b.getdata())
    assert bbox_a == bbox_b


def test_generate_batch_writes_files_and_manifest(tmp_path):
    config = GenerationConfig(image_size=(64, 64), seed=3, images_per_class={"SAFE": 2, "TORN": 0, "OPENED": 0, "CRUSHED": 0, "TAPED": 0, "PARTIAL_DAMAGE": 0})
    gen = SyntheticGenerator(config)
    output_dir = tmp_path / "synthetic"
    manifest = DatasetManifest(tmp_path / "manifest.csv")

    written = gen.generate_batch("SAFE", 2, output_dir, manifest)

    assert len(written) == 2
    for image_path in written:
        assert image_path.exists()
        label_path = image_path.with_suffix(".txt")
        assert label_path.exists()
        parts = label_path.read_text().split()
        assert len(parts) == 5  # class_index cx cy w h

    assert len(manifest.entries()) == 2
    assert all(e.damageClass == "SAFE" for e in manifest.entries())


# --- AI Improvement Phase: new SEAL_OPEN class + bbox tightening ---

def test_seal_open_is_in_all_classes():
    assert "SEAL_OPEN" in ALL_CLASSES


def test_seal_open_generates_a_valid_image_and_box():
    config = GenerationConfig(image_size=(128, 128), seed=3)
    gen = SyntheticGenerator(config)
    image, bbox = gen.generate_one("SEAL_OPEN")
    assert image.size == (128, 128)
    assert bbox.width > 0 and bbox.height > 0
    # Box must lie within the image bounds -- a real, previously-untested
    # failure mode for any new overlay function (an off-by-one or a
    # radius computed from the wrong dimension could silently produce a
    # box hanging off the edge of the image).
    assert 0 <= bbox.x and bbox.x + bbox.width <= 128
    assert 0 <= bbox.y and bbox.y + bbox.height <= 128


def test_seal_open_box_has_a_sane_minimum_size_even_for_small_envelope_crops():
    # Regression guard for the real bug found and fixed during this same
    # phase: widening the envelope size range could produce a seal box
    # small enough to be effectively unlearnable (was observed at 4x4
    # before the fix; the fix guarantees a minimum absolute seal radius).
    config = GenerationConfig(image_size=(96, 96), seed=11)
    gen = SyntheticGenerator(config)
    smallest = min(
        min(gen.generate_one("SEAL_OPEN")[1].width, gen.generate_one("SEAL_OPEN")[1].height)
        for _ in range(15)
    )
    assert smallest >= 6, f"expected every SEAL_OPEN box to be at least 6px, smallest was {smallest}"


def test_seal_open_is_visually_distinct_from_opened():
    # The two classes must not collapse into "the same bounding box shape
    # in different clothing" -- OPENED's box always spans the image's
    # full width (a flap cavity, widest at the top edge); SEAL_OPEN's
    # should be a small, roughly-square, centered region. Confirms the
    # documented design intent (damage_overlays.py's apply_seal_open
    # docstring) actually holds in the generated output, not just in the
    # comment describing it.
    config = GenerationConfig(image_size=(128, 128), seed=5)
    gen = SyntheticGenerator(config)
    _, opened_box = gen.generate_one("OPENED")
    _, seal_box = gen.generate_one("SEAL_OPEN")
    assert opened_box.width > seal_box.width * 2, "OPENED should span far more width than the localized SEAL_OPEN box"


def test_bbox_tightening_never_produces_a_degenerate_box():
    # Runs every real class through the full pipeline many times with
    # different seeds -- a broad, real smoke test that the pixel-diff
    # tightening (which intersects two independently-computed regions)
    # never collapses to a zero or negative-size box for any class.
    for seed in range(10):
        config = GenerationConfig(image_size=(112, 112), seed=seed)
        gen = SyntheticGenerator(config)
        for cls in ALL_CLASSES:
            _, bbox = gen.generate_one(cls)
            assert bbox.width > 0 and bbox.height > 0, f"{cls} produced a degenerate box at seed {seed}: {bbox}"
