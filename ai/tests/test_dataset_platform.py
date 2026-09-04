"""Tests for the remaining Sprint AI-2 dataset modules."""
from PIL import Image

from datasets.augmentation.augmentor import Augmentor
from datasets.collector.collectors import BatchImporter
from datasets.collector.naming import generate_filename, is_generated_name
from datasets.config import AugmentationConfig
from datasets.manifest import DatasetManifest, ManifestEntry
from datasets.statistics.dataset_stats import DatasetStatistics
from datasets.validator.quality_validator import QualityValidator
from datasets.versioning import cut_version, list_versions


def _solid_image(size=(64, 64), color=(120, 100, 80)) -> Image.Image:
    return Image.new("RGB", size, color)


# --- Augmentor ---------------------------------------------------------

def test_augment_one_preserves_size():
    img = _solid_image()
    aug = Augmentor(AugmentationConfig(rotation_degrees=10, blur_probability=1.0, motion_blur_probability=1.0), seed=1)
    out = aug.augment_one(img)
    assert out.size == img.size
    assert out.mode == "RGB"


def test_augment_batch_produces_requested_count():
    img = _solid_image()
    aug = Augmentor(AugmentationConfig(variants_per_image=4), seed=2)
    batch = aug.augment_batch(img)
    assert len(batch) == 4


def test_augmented_images_differ_from_source():
    img = _solid_image()
    aug = Augmentor(AugmentationConfig(gaussian_noise_std=20, brightness_range=(0.5, 1.5)), seed=3)
    out = aug.augment_one(img)
    assert list(out.getdata()) != list(img.getdata())


# --- Validator -----------------------------------------------------------

def test_check_image_passes_a_normal_image(tmp_path):
    path = tmp_path / "ok.jpg"
    # A checkerboard-ish pattern has real edges, unlike a flat color, so it
    # legitimately passes the blur check rather than needing a lowered
    # threshold just to make the test pass.
    import numpy as np
    arr = (np.indices((100, 100)).sum(axis=0) % 2 * 200 + 20).astype("uint8")
    img = Image.fromarray(np.stack([arr] * 3, axis=-1), mode="RGB")
    img.save(path, quality=95)

    result = QualityValidator().check_image(path)
    assert result.passed, result.reason


def test_check_image_rejects_too_small(tmp_path):
    path = tmp_path / "tiny.jpg"
    _solid_image((20, 20)).save(path)
    result = QualityValidator(min_width=96, min_height=96).check_image(path)
    assert not result.passed
    assert "Resolution" in result.reason


def test_check_image_rejects_blurry_flat_image(tmp_path):
    path = tmp_path / "flat.jpg"
    _solid_image((200, 200), (128, 128, 128)).save(path)
    result = QualityValidator(blur_variance_threshold=15.0).check_image(path)
    assert not result.passed
    assert "blurry" in result.reason.lower()


def test_duplicate_detection_flags_identical_image(tmp_path):
    validator = QualityValidator()
    original = tmp_path / "a.jpg"
    duplicate = tmp_path / "b.jpg"
    _solid_image((100, 100), (90, 60, 30)).save(original)
    _solid_image((100, 100), (90, 60, 30)).save(duplicate)

    hashes = {"a.jpg": validator.compute_hash(original)}
    is_dup, matched = validator.check_duplicate(duplicate, hashes)
    assert is_dup
    assert matched == "a.jpg"


# --- Manifest / versioning ------------------------------------------------

def test_manifest_round_trips_through_csv(tmp_path):
    path = tmp_path / "manifest.csv"
    manifest = DatasetManifest(path)
    manifest.add(ManifestEntry.now(filename="a.jpg", damageClass="SAFE", source="synthetic", width=64, height=64))
    manifest.save()

    reloaded = DatasetManifest(path)
    assert len(reloaded.entries()) == 1
    assert reloaded.entries()[0].damageClass == "SAFE"


def test_cutting_a_version_is_idempotent_for_unchanged_manifest(tmp_path):
    manifest = DatasetManifest(tmp_path / "manifest.csv")
    manifest.add(ManifestEntry.now(filename="a.jpg", damageClass="SAFE", source="synthetic", width=64, height=64))

    v1 = cut_version(tmp_path, manifest)
    v2 = cut_version(tmp_path, manifest)  # no new entries added
    assert v1.version == v2.version
    assert len(list_versions(tmp_path)) == 1


def test_cutting_a_new_version_after_growth(tmp_path):
    manifest = DatasetManifest(tmp_path / "manifest.csv")
    manifest.add(ManifestEntry.now(filename="a.jpg", damageClass="SAFE", source="synthetic", width=64, height=64))
    cut_version(tmp_path, manifest)

    manifest.add(ManifestEntry.now(filename="b.jpg", damageClass="TORN", source="synthetic", width=64, height=64))
    v2 = cut_version(tmp_path, manifest)

    versions = list_versions(tmp_path)
    assert len(versions) == 2
    assert v2.totalImages == 2


# --- Statistics ------------------------------------------------------------

def test_statistics_flags_missing_classes(tmp_path):
    manifest = DatasetManifest(tmp_path / "manifest.csv")
    manifest.add(ManifestEntry.now(filename="a.jpg", damageClass="SAFE", source="synthetic", width=64, height=64))
    summary = DatasetStatistics().summarize(manifest)
    assert "TORN" in summary.missingClasses
    assert summary.totalImages == 1


def test_statistics_flags_class_imbalance(tmp_path):
    manifest = DatasetManifest(tmp_path / "manifest.csv")
    for _ in range(10):
        manifest.add(ManifestEntry.now(filename="a.jpg", damageClass="SAFE", source="synthetic", width=64, height=64))
    manifest.add(ManifestEntry.now(filename="b.jpg", damageClass="TORN", source="synthetic", width=64, height=64))
    summary = DatasetStatistics(imbalance_ratio_threshold=3.0).summarize(manifest)
    assert len(summary.imbalanceWarnings) == 1


# --- Naming ------------------------------------------------------------------

def test_generate_filename_matches_expected_shape():
    name = generate_filename("TORN", "batch_import", content=b"hello")
    assert name.startswith("TORN_batch_import_")
    assert name.endswith(".jpg")
    assert is_generated_name(name)


def test_generate_filename_is_collision_resistant_for_distinct_content():
    a = generate_filename("SAFE", "webcam", content=b"content-one")
    b = generate_filename("SAFE", "webcam", content=b"content-two")
    assert a != b


# --- BatchImporter -------------------------------------------------------------

def test_batch_importer_imports_valid_rejects_invalid(tmp_path):
    source_dir = tmp_path / "source"
    source_dir.mkdir()

    import numpy as np
    arr = (np.indices((100, 100)).sum(axis=0) % 2 * 200 + 20).astype("uint8")
    good = Image.fromarray(np.stack([arr] * 3, axis=-1), mode="RGB")
    good.save(source_dir / "good.jpg", quality=95)

    _solid_image((20, 20)).save(source_dir / "too_small.jpg")  # fails min resolution

    pending_dir = tmp_path / "pending"
    result = BatchImporter().import_directory(source_dir, pending_dir, damage_class_hint="TORN")

    assert len(result.imported) == 1
    assert len(result.rejected) == 1
    assert result.imported[0].exists()


def test_batch_importer_flags_duplicates_within_the_batch(tmp_path):
    source_dir = tmp_path / "source"
    source_dir.mkdir()

    import numpy as np
    arr = (np.indices((100, 100)).sum(axis=0) % 2 * 200 + 20).astype("uint8")
    img = Image.fromarray(np.stack([arr] * 3, axis=-1), mode="RGB")
    img.save(source_dir / "one.jpg", quality=95)
    img.save(source_dir / "one_copy.jpg", quality=95)  # identical pixels, different filename

    pending_dir = tmp_path / "pending"
    result = BatchImporter().import_directory(source_dir, pending_dir)

    assert len(result.imported) == 1
    assert len(result.duplicates) == 1
