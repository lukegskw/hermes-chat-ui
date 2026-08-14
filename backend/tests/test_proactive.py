import json

from fastapi.testclient import TestClient

from backend.main import app
from backend.hermes_dashboard import DashboardImportError
from backend.routers import proactive


def _configure(monkeypatch, tmp_path):
    monkeypatch.setenv("HERMES_PUSH_API_KEY", "internal-secret")
    monkeypatch.setenv(
        "PROACTIVE_REQUESTS_FILE", str(tmp_path / "proactive_requests.json")
    )


def _headers():
    return {"Authorization": "Bearer internal-secret"}


def _payload(request_id="request-1"):
    return {
        "request_id": request_id,
        "title": "NAS report",
        "message": "Backup completed.",
    }


def test_proactive_endpoint_requires_a_configured_matching_key(monkeypatch, tmp_path):
    monkeypatch.delenv("HERMES_PUSH_API_KEY", raising=False)
    monkeypatch.setenv(
        "PROACTIVE_REQUESTS_FILE", str(tmp_path / "proactive_requests.json")
    )

    with TestClient(app) as client:
        unconfigured = client.post("/api/proactive/messages", json=_payload())

    assert unconfigured.status_code == 503

    monkeypatch.setenv("HERMES_PUSH_API_KEY", "internal-secret")
    with TestClient(app) as client:
        unauthorized = client.post("/api/proactive/messages", json=_payload())

    assert unauthorized.status_code == 401


def test_proactive_message_imports_literal_assistant_text_and_pushes(
    monkeypatch, tmp_path
):
    _configure(monkeypatch, tmp_path)
    imported: list[tuple[str, str, str]] = []

    async def fake_import(session_id, title, message):
        imported.append((session_id, title, message))

    pushed = []
    monkeypatch.setattr(proactive, "import_assistant_session", fake_import)
    monkeypatch.setattr(
        proactive,
        "deliver_notification",
        lambda payload: pushed.append(payload) or {"status": "sent", "sent": 1, "failed": 0},
    )

    with TestClient(app) as client:
        response = client.post(
            "/api/proactive/messages", json=_payload(), headers=_headers()
        )

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "complete"
    assert body["session"]["persisted"] is True
    assert imported == [
        (body["session"]["id"], "NAS report", "Backup completed.")
    ]
    assert pushed[0].body == "Backup completed."
    assert pushed[0].url == f"/?session={body['session']['id']}"
    assert pushed[0].session_id == body["session"]["id"]


def test_proactive_request_id_is_idempotent(monkeypatch, tmp_path):
    _configure(monkeypatch, tmp_path)
    imports = 0
    pushes = 0

    async def fake_import(*_args):
        nonlocal imports
        imports += 1

    def fake_push(_payload):
        nonlocal pushes
        pushes += 1
        return {"status": "sent", "sent": 1, "failed": 0}

    monkeypatch.setattr(proactive, "import_assistant_session", fake_import)
    monkeypatch.setattr(proactive, "deliver_notification", fake_push)

    with TestClient(app) as client:
        first = client.post(
            "/api/proactive/messages", json=_payload(), headers=_headers()
        )
        replay = client.post(
            "/api/proactive/messages", json=_payload(), headers=_headers()
        )

    assert first.json()["replayed"] is False
    assert replay.json()["replayed"] is True
    assert replay.json()["session"]["id"] == first.json()["session"]["id"]
    assert imports == 1
    assert pushes == 1


def test_persistence_failure_still_sends_push_with_warning(monkeypatch, tmp_path):
    _configure(monkeypatch, tmp_path)
    pushed = []

    async def failed_import(*_args):
        raise DashboardImportError("dashboard_unavailable")

    monkeypatch.setattr(proactive, "import_assistant_session", failed_import)
    monkeypatch.setattr(
        proactive,
        "deliver_notification",
        lambda payload: pushed.append(payload) or {"status": "sent", "sent": 1, "failed": 0},
    )

    with TestClient(app) as client:
        response = client.post(
            "/api/proactive/messages", json=_payload(), headers=_headers()
        )

    body = response.json()
    assert body["status"] == "partial"
    assert body["session"] == {
        "persisted": False,
        "error": "dashboard_unavailable",
    }
    assert pushed[0].body.startswith("Conversation was not saved.")
    assert pushed[0].url == "/"
    assert pushed[0].session_id is None
    assert "internal-secret" not in response.text


def test_push_failure_preserves_the_imported_session_result(monkeypatch, tmp_path):
    _configure(monkeypatch, tmp_path)

    async def fake_import(*_args):
        return None

    monkeypatch.setattr(proactive, "import_assistant_session", fake_import)
    monkeypatch.setattr(
        proactive,
        "deliver_notification",
        lambda _payload: {"status": "failed", "sent": 0, "failed": 1},
    )

    with TestClient(app) as client:
        response = client.post(
            "/api/proactive/messages", json=_payload(), headers=_headers()
        )

    body = response.json()
    assert body["status"] == "partial"
    assert body["session"]["persisted"] is True
    assert body["push"] == {"status": "failed", "sent": 0, "failed": 1}
    stored = json.loads((tmp_path / "proactive_requests.json").read_text())
    assert "request-1" in stored


def test_distinct_requests_create_distinct_sessions(monkeypatch, tmp_path):
    _configure(monkeypatch, tmp_path)

    async def fake_import(*_args):
        return None

    monkeypatch.setattr(proactive, "import_assistant_session", fake_import)
    monkeypatch.setattr(
        proactive,
        "deliver_notification",
        lambda _payload: {"status": "sent", "sent": 1, "failed": 0},
    )

    with TestClient(app) as client:
        first = client.post(
            "/api/proactive/messages", json=_payload("request-1"), headers=_headers()
        )
        second = client.post(
            "/api/proactive/messages", json=_payload("request-2"), headers=_headers()
        )

    assert first.json()["session"]["id"] != second.json()["session"]["id"]
