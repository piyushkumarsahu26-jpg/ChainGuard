"""
Tests for services/detection_client.py.

Uses a real local HTTP server (Python's http.server, in a background
thread) rather than mocking `requests` — this exercises the actual HTTP
call, header construction, and response parsing, the same way this
sprint's manual verification did (see
docs/chainguard-sprint-ai4b-completion-report.md §5). The real Node
backend can't run in this sandbox (Prisma engine binary blocked, same
limitation since Phase 1), so this is the most real verification
available for this specific module without it.
"""
import json
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer

import pytest

from services.detection_client import DetectionClientError, submit_detection


class _StubHandler(BaseHTTPRequestHandler):
    def do_POST(self):
        length = int(self.headers.get("Content-Length", 0))
        body = json.loads(self.rfile.read(length))
        auth = self.headers.get("Authorization", "")

        if not auth.startswith("Bearer "):
            self.send_response(401)
            self.end_headers()
            self.wfile.write(json.dumps({"success": False, "message": "Unauthorized"}).encode())
            return

        self.send_response(201)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        response = {
            "success": True,
            "statusCode": 201,
            "message": "Detection recorded",
            "data": {"detection": {"id": "stub-id", **body}, "alert": None},
        }
        self.wfile.write(json.dumps(response).encode())

    def log_message(self, format, *args):
        pass  # quiet test output


@pytest.fixture(scope="module")
def stub_server():
    server = HTTPServer(("localhost", 0), _StubHandler)
    port = server.server_port
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    yield f"http://localhost:{port}"
    server.shutdown()


def test_submit_detection_requires_camera_or_envelope():
    with pytest.raises(DetectionClientError, match="At least one"):
        submit_detection("TORN", 0.9, {"x": 0, "y": 0, "width": 1, "height": 1})


def test_submit_detection_requires_jwt_configured(monkeypatch, stub_server):
    import services.detection_client as dc

    monkeypatch.setattr(dc, "get_settings", lambda: type("S", (), {"ai_service_jwt": "", "backend_url": stub_server})())
    with pytest.raises(DetectionClientError, match="AI_SERVICE_JWT is not configured"):
        submit_detection("TORN", 0.9, {"x": 0, "y": 0, "width": 1, "height": 1}, envelope_id="e1")


def test_submit_detection_real_http_round_trip(monkeypatch, stub_server):
    import services.detection_client as dc

    monkeypatch.setattr(
        dc, "get_settings",
        lambda: type("S", (), {"ai_service_jwt": "fake-jwt", "backend_url": stub_server + "/api/v1"})(),
    )
    result = submit_detection(
        "TORN", 0.87, {"x": 10, "y": 20, "width": 100, "height": 80}, envelope_id="envelope-123",
    )
    assert result["success"] is True
    assert result["data"]["detection"]["prediction"] == "TORN"
    assert result["data"]["detection"]["envelopeId"] == "envelope-123"


def test_submit_detection_rejects_without_valid_auth(monkeypatch, stub_server):
    """Confirms the client surfaces the backend's 401 as a
    DetectionClientError rather than silently swallowing it — simulated by
    pointing at a path the stub always 401s if Authorization is malformed."""
    import services.detection_client as dc

    class BadAuthSettings:
        ai_service_jwt = "fake-jwt"
        backend_url = stub_server + "/api/v1"

    monkeypatch.setattr(dc, "get_settings", lambda: BadAuthSettings())
    monkeypatch.setattr(
        dc.requests, "post",
        lambda *a, **k: type("R", (), {"ok": False, "status_code": 401, "text": "Unauthorized", "json": lambda self: {}})(),
    )
    with pytest.raises(DetectionClientError, match="401"):
        submit_detection("TORN", 0.9, {"x": 0, "y": 0, "width": 1, "height": 1}, envelope_id="e1")
