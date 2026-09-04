"""
Performance measurement — REAL IMPLEMENTATION (Sprint AI-4A).

Wraps a single inference call with timing + memory snapshot. Also
maintains a small in-process running-average store that routers/metrics.py
reads from — deliberately in-memory only (not persisted to disk or a
database), since Sprint AI-4A is explicit that this service must not
create any external records; metrics reset on process restart, which is
the correct, honest behavior for a standalone service with no storage
layer of its own.
"""
import time
from contextlib import contextmanager
from dataclasses import dataclass, field
from datetime import datetime, timezone

import psutil

from schemas.inference import MetricsResponse, PerformanceSnapshot


@dataclass
class _MetricsStore:
    totalPredictions: int = 0
    totalInferenceTimeMs: float = 0.0
    device: str = "unknown"
    modelVersion: str | None = None
    lastPredictionAt: str | None = None

    def record(self, inference_time_ms: float, device: str, model_version: str) -> None:
        self.totalPredictions += 1
        self.totalInferenceTimeMs += inference_time_ms
        self.device = device
        self.modelVersion = model_version
        self.lastPredictionAt = datetime.now(timezone.utc).isoformat()

    def snapshot(self) -> MetricsResponse:
        avg_ms = (self.totalInferenceTimeMs / self.totalPredictions) if self.totalPredictions else 0.0
        avg_fps = (1000.0 / avg_ms) if avg_ms > 0 else None
        return MetricsResponse(
            totalPredictions=self.totalPredictions,
            averageInferenceTimeMs=avg_ms,
            averageFps=avg_fps,
            device=self.device,
            modelVersion=self.modelVersion,
            lastPredictionAt=self.lastPredictionAt,
        )


_store = _MetricsStore()


def get_metrics() -> MetricsResponse:
    return _store.snapshot()


def _memory_snapshot_mb() -> tuple[float, float]:
    vm = psutil.virtual_memory()
    process = psutil.Process()
    used_mb = process.memory_info().rss / (1024 * 1024)
    available_mb = vm.available / (1024 * 1024)
    return used_mb, available_mb


@contextmanager
def measure(device: str, model_version: str):
    """
    Usage:
        with measure(device, model_version) as perf:
            ... run inference ...
        # perf.inferenceTimeMs, perf.memoryUsedMb etc. are populated after the block exits
    """
    start = time.perf_counter()
    snapshot = PerformanceSnapshot(device=device, inferenceTimeMs=0.0, memoryUsedMb=0.0, memoryAvailableMb=0.0)
    try:
        yield snapshot
    finally:
        elapsed_ms = (time.perf_counter() - start) * 1000
        used_mb, available_mb = _memory_snapshot_mb()
        snapshot.inferenceTimeMs = elapsed_ms
        snapshot.fps = 1000.0 / elapsed_ms if elapsed_ms > 0 else None
        snapshot.memoryUsedMb = used_mb
        snapshot.memoryAvailableMb = available_mb
        _store.record(elapsed_ms, device, model_version)
