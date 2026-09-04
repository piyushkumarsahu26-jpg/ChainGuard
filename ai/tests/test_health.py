"""
Tests for the health endpoint — the only real endpoint in Sprint AI-1.
"""
from fastapi.testclient import TestClient

from main import app

client = TestClient(app)


def test_health_returns_200():
    response = client.get("/health")
    assert response.status_code == 200


def test_health_reports_the_real_champion_model():
    """
    As of Sprint AI-3, this repo ships a real trained (smoke-test) champion
    model — see docs/chainguard-sprint-ai3-completion-report.md. This test
    originally asserted `modelLoaded is False`, written in Sprint AI-1
    when that was true. The health endpoint's job was always to honestly
    report whatever the real manifest state is — not to promise "no model"
    forever — so this test is updated to match the new (also real, also
    honest) state rather than being deleted or left failing.
    """
    response = client.get("/health")
    body = response.json()
    assert body["success"] is True
    assert body["data"]["modelLoaded"] is True
    assert body["data"]["championVersion"] is not None
    # NOT asserting a specific value for lastInferenceAt here (Sprint AI-1
    # asserted `is None`, correct at the time). As of Sprint AI-4A,
    # inference/performance.py's metrics store is a process-wide singleton
    # shared across every test module in one pytest run — whether this is
    # None or a real timestamp by the time this test executes now depends
    # on test file/ordering, not on anything this test is actually meant
    # to verify. Type-checking instead of value-checking keeps this
    # meaningful without being order-dependent.
    assert body["data"]["lastInferenceAt"] is None or isinstance(body["data"]["lastInferenceAt"], str)
    assert isinstance(body["data"]["totalPredictions"], int)


def test_health_response_envelope_shape():
    """
    Confirms the response matches the shared ApiResponse envelope
    (success/statusCode/message/data), mirroring the Node backend's shape.
    """
    response = client.get("/health")
    body = response.json()
    assert set(["success", "statusCode", "message", "data"]).issubset(body.keys())
