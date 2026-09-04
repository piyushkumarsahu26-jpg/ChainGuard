"""
Tests for services/model_registry.py — real file I/O logic, tested against
a temporary manifest so these tests never touch the real
models/weights/manifest.json.
"""
import json

import pytest

from services import model_registry
from services.model_registry import ModelEntry, ModelMetrics, ModelManifest
from utils.exceptions import ModelNotAvailableError


@pytest.fixture
def temp_manifest(tmp_path, monkeypatch):
    manifest_path = tmp_path / "manifest.json"
    manifest_path.write_text(json.dumps({"models": [], "championVersion": None, "schemaVersion": 1}))
    monkeypatch.setattr(model_registry, "_manifest_path", lambda: manifest_path)
    return manifest_path


def _sample_entry(version="v1.0.0", champion=False):
    return ModelEntry(
        version=version,
        trainedAt="2026-01-01T00:00:00Z",
        datasetVersion="v1",
        metrics=ModelMetrics(precision=0.9, recall=0.85, mAP50=0.88, mAP50_95=0.7, f1=0.87),
        filename=f"{version}.pt",
        imageSize=64,
        isChampion=champion,
    )


def test_load_manifest_empty_state(temp_manifest):
    manifest = model_registry.load_manifest()
    assert manifest.models == []
    assert manifest.championVersion is None


def test_get_champion_raises_when_none_trained(temp_manifest):
    with pytest.raises(ModelNotAvailableError):
        model_registry.get_champion()


def test_register_model_and_promote(temp_manifest):
    entry = _sample_entry()
    manifest = model_registry.register_model(entry, promote_to_champion=True)

    assert manifest.championVersion == "v1.0.0"
    assert len(manifest.models) == 1
    assert manifest.models[0].isChampion is True

    champion = model_registry.get_champion()
    assert champion.version == "v1.0.0"


def test_registering_a_new_champion_demotes_the_old_one(temp_manifest):
    model_registry.register_model(_sample_entry("v1.0.0"), promote_to_champion=True)
    model_registry.register_model(_sample_entry("v1.1.0"), promote_to_champion=True)

    manifest = model_registry.load_manifest()
    v1 = next(m for m in manifest.models if m.version == "v1.0.0")
    v11 = next(m for m in manifest.models if m.version == "v1.1.0")
    assert v1.isChampion is False
    assert v11.isChampion is True
    assert manifest.championVersion == "v1.1.0"
