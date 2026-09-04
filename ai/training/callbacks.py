"""
Training callbacks — SKELETON ONLY.

Design: docs/chainguard-ai-technical-design-phase3a.md, Step 8 ("Early
stopping", "Checkpoint strategy") — early stopping on validation mAP@0.5
plateau (default patience 20 epochs), best-val-mAP checkpoint retention
separate from final-epoch weights. Not implemented in Sprint AI-1.
"""


class EarlyStopping:
    def __init__(self, patience: int = 20):
        self.patience = patience

    def should_stop(self, epoch: int, val_map50_history: list[float]) -> bool:
        raise NotImplementedError("Implemented in a future sprint.")


class CheckpointSaver:
    def maybe_save(self, epoch: int, val_map50: float, model_state) -> None:
        raise NotImplementedError("Implemented in a future sprint.")
