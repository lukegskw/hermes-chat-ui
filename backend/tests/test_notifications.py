from fastapi.testclient import TestClient

from backend.main import app
from backend.routers import notifications, sessions


def setup_function():
    notifications._clear_client_presence()


def teardown_function():
    notifications._clear_client_presence()


def test_visible_presence_is_shared_and_hidden_removes_it():
    with TestClient(app) as client:
        response = client.post(
            "/api/push/presence",
            json={"client_id": "browser-tab", "visible": True},
        )
        assert response.status_code == 200
        assert response.json() == {"status": "visible"}
        assert notifications.is_any_client_visible()

        response = client.post(
            "/api/push/presence",
            json={"client_id": "browser-tab", "visible": False},
        )
        assert response.status_code == 200
        assert response.json() == {"status": "hidden"}
        assert not notifications.is_any_client_visible()


def test_presence_expires_after_ttl():
    notifications.update_client_presence("stale-tab", True, now=10.0)

    assert notifications.is_any_client_visible(now=10.0)
    assert not notifications.is_any_client_visible(
        now=10.0 + notifications.PRESENCE_TTL_SECONDS + 0.01
    )


def test_one_visible_client_keeps_presence_active():
    notifications.update_client_presence("stale-tab", True, now=10.0)
    notifications.update_client_presence("current-pwa", True, now=50.0)

    assert notifications.is_any_client_visible(now=51.0)


def test_completion_push_is_suppressed_while_a_client_is_visible(monkeypatch):
    sent_payloads: list[dict] = []
    monkeypatch.setattr(
        notifications, "_load_subscriptions", lambda: [{"endpoint": "pwa"}]
    )
    monkeypatch.setattr(
        "backend.push.send_push_notification",
        lambda subscription, payload: sent_payloads.append(payload) or True,
    )
    notifications.update_client_presence("visible-browser", True)

    sessions._send_completion_notification("session-1", "Finished")

    assert sent_payloads == []


def test_completion_push_is_sent_without_a_visible_client(monkeypatch):
    sent_payloads: list[dict] = []
    monkeypatch.setattr(
        notifications, "_load_subscriptions", lambda: [{"endpoint": "pwa"}]
    )
    monkeypatch.setattr(
        "backend.push.send_push_notification",
        lambda subscription, payload: sent_payloads.append(payload) or True,
    )

    sessions._send_completion_notification("session-1", "Finished")

    assert len(sent_payloads) == 1
    assert sent_payloads[0]["body"] == "Finished"
