"""
Environment snapshot for reproducibility.

Per the Sprint AI-3 objective's "Reproducibility" requirement: every
experiment record stores exactly what environment produced it, so a result
can be sanity-checked or reproduced later even if dependency versions have
since moved on.
"""
import platform
import sys


def capture_environment_info() -> dict:
    info = {
        "python_version": sys.version.split()[0],
        "platform": platform.platform(),
    }
    for package in ("torch", "torchvision", "ultralytics", "numpy"):
        try:
            module = __import__(package)
            info[f"{package}_version"] = getattr(module, "__version__", "unknown")
        except ImportError:
            info[f"{package}_version"] = "not installed"

    try:
        import torch
        info["cuda_available"] = torch.cuda.is_available()
        info["device_used"] = "cuda" if torch.cuda.is_available() else "cpu"
    except ImportError:
        info["cuda_available"] = False
        info["device_used"] = "unknown"

    return info
