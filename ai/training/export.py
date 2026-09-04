"""
Model export — REAL IMPLEMENTATION (Sprint AI-3).

PyTorch (.pt) is already what training produces natively (weights/best.pt) —
nothing to convert. ONNX export uses Ultralytics' built-in exporter, per
docs/chainguard-ai-technical-design-phase3a.md, Step 8 ("Export strategy"):
ONNX for serving, PyTorch retained for any future continued fine-tuning.

Usage:
    python -m training.export --weights training/runs/<experiment_id>/weights/best.pt
"""
import argparse
from pathlib import Path


def export_onnx(weights_path: str | Path, image_size: int = 64) -> Path:
    from ultralytics import YOLO  # lazy import, same reasoning as train.py

    model = YOLO(str(weights_path))
    exported_path = model.export(format="onnx", imgsz=image_size, simplify=True)
    return Path(exported_path)


def main() -> None:
    parser = argparse.ArgumentParser(description="Export a trained ChainGuard model to ONNX.")
    parser.add_argument("--weights", required=True, help="Path to a .pt weights file")
    parser.add_argument("--image-size", type=int, default=64)
    args = parser.parse_args()

    weights_path = Path(args.weights)
    if not weights_path.exists():
        raise SystemExit(f"Weights file not found: {weights_path}")

    onnx_path = export_onnx(weights_path, args.image_size)
    print(f"Exported ONNX model: {onnx_path}")


if __name__ == "__main__":
    main()
