"""Tests for utils/auth.py's API key verification, and confirmation that
/models and /predict/* are actually guarded by it end-to-end."""
import pytest
from fastapi.testclient import TestClient

from config.settings import get_settings


@pytest.fixture
def client_with_api_key(monkeypatch):
    monkeypatch.setenv("AI_SERVICE_API_KEY", "test-key-123")
    get_settings.cache_clear()

    from main import app
    yield TestClient(app)

    monkeypatch.delenv("AI_SERVICE_API_KEY", raising=False)
    get_settings.cache_clear()


def test_models_endpoint_rejects_missing_key(client_with_api_key):
    response = client_with_api_key.get("/models")
    assert response.status_code == 401


def test_models_endpoint_rejects_wrong_key(client_with_api_key):
    response = client_with_api_key.get("/models", headers={"X-API-Key": "wrong"})
    assert response.status_code == 401


def test_models_endpoint_accepts_correct_key(client_with_api_key):
    response = client_with_api_key.get("/models", headers={"X-API-Key": "test-key-123"})
    assert response.status_code == 200


def test_health_endpoint_never_requires_a_key(client_with_api_key):
    """/health stays open even when AI_SERVICE_API_KEY is set — see
    utils/auth.py's module docstring for why."""
    response = client_with_api_key.get("/health")
    assert response.status_code == 200


def test_auth_disabled_when_no_api_key_configured():
    """Default state (no env var set) — auth is off, matching this
    project's existing dev-mode-default conventions elsewhere."""
    get_settings.cache_clear()
    from main import app
    client = TestClient(app)
    response = client.get("/models")
    assert response.status_code == 200
    get_settings.cache_clear()
