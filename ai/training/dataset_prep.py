"""
Dataset preparation: manifest.csv -> YOLO-format train/val directories.

Sprint AI-2 deliberately deferred this ("no training pipeline exists yet to
consume the split"). It exists now because the training engine genuinely
needs it — this is "Dataset selection" from the Sprint AI-3 objective list,
not scope creep from Sprint AI-2.

Stratified per class (each class split independently) so a tiny dataset
(e.g. this project's 30-image sample) doesn't end up with a class entirely
absent from validation purely by random chance.
"""
import random
import shutil
from pathlib import Path

from datasets.config import ALL_CLASSES
from datasets.manifest import DatasetManifest


def prepare_yolo_dataset(
    manifest_path: str | Path,
    dataset_root: str | Path,
    output_dir: str | Path,
    train_split: float = 0.8,
    seed: int = 42,
) -> dict:
    """
    Reads the manifest, copies each image+label pair into
    `output_dir/images/{train,val}/` and `output_dir/labels/{train,val}/`,
    and writes `output_dir/data.yaml` (the file ultralytics' YOLO.train()
    expects). Returns a summary dict (counts per split).
    """
    manifest = DatasetManifest(manifest_path)
    dataset_root = Path(dataset_root)
    output_dir = Path(output_dir)

    for split in ("train", "val"):
        (output_dir / "images" / split).mkdir(parents=True, exist_ok=True)
        (output_dir / "labels" / split).mkdir(parents=True, exist_ok=True)

    rng = random.Random(seed)
    counts = {"train": 0, "val": 0}

    for damage_class in ALL_CLASSES:
        entries = manifest.by_class(damage_class)
        if not entries:
            continue
        rng.shuffle(entries)
        split_idx = max(1, int(len(entries) * train_split)) if len(entries) > 1 else 1
        splits = {"train": entries[:split_idx], "val": entries[split_idx:] or entries[:1]}

        for split_name, split_entries in splits.items():
            for entry in split_entries:
                src_image = dataset_root / entry.filename
                src_label = src_image.with_suffix(".txt")
                if not src_image.exists():
                    continue  # tolerate a manifest row whose file was since removed

                dest_image = output_dir / "images" / split_name / src_image.name
                shutil.copy2(src_image, dest_image)
                counts[split_name] += 1

                if src_label.exists():
                    dest_label = output_dir / "labels" / split_name / src_label.name
                    shutil.copy2(src_label, dest_label)

    data_yaml = output_dir / "data.yaml"
    class_list = "\n".join(f"  {i}: {c}" for i, c in enumerate(ALL_CLASSES))
    data_yaml.write_text(
        f"path: {output_dir.resolve()}\n"
        f"train: images/train\n"
        f"val: images/val\n"
        f"names:\n{class_list}\n"
    )

    return {"counts": counts, "data_yaml": str(data_yaml)}
