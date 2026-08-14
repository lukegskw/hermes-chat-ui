import asyncio

import pytest

from backend import hermes_dashboard
from backend.hermes_dashboard import DashboardImportError


class _FakeResponse:
    def __init__(self, status, payload):
        self.status = status
        self._payload = payload

    async def __aenter__(self):
        return self

    async def __aexit__(self, *_args):
        return None

    async def json(self, *, content_type=None):
        return self._payload


class _FakeClientSession:
    def __init__(self, responses, calls, **_kwargs):
        self._responses = iter(responses)
        self._calls = calls

    async def __aenter__(self):
        return self

    async def __aexit__(self, *_args):
        return None

    def post(self, url, *, json):
        self._calls.append((url, json))
        return next(self._responses)


def _configure(monkeypatch):
    monkeypatch.setenv("HERMES_DASHBOARD_URL", "http://hermes-agent:9119/")
    monkeypatch.setenv("HERMES_DASHBOARD_AUTH_PROVIDER", "basic")
    monkeypatch.setenv("HERMES_DASHBOARD_BASIC_AUTH_USERNAME", "lucas")
    monkeypatch.setenv("HERMES_DASHBOARD_BASIC_AUTH_PASSWORD", "secret")


def test_import_assistant_session_logs_in_and_imports_literal_message(monkeypatch):
    _configure(monkeypatch)
    calls = []
    responses = [
        _FakeResponse(200, {"ok": True}),
        _FakeResponse(200, {"ok": True, "imported_ids": ["proactive_1"]}),
    ]
    monkeypatch.setattr(
        hermes_dashboard.aiohttp,
        "ClientSession",
        lambda **kwargs: _FakeClientSession(responses, calls, **kwargs),
    )

    asyncio.run(
        hermes_dashboard.import_assistant_session(
            "proactive_1", "NAS report", "Backup completed.", timestamp=123.0
        )
    )

    assert calls[0] == (
        "http://hermes-agent:9119/auth/password-login",
        {
            "provider": "basic",
            "username": "lucas",
            "password": "secret",
            "next": "/",
        },
    )
    assert calls[1][0] == "http://hermes-agent:9119/api/sessions/import"
    imported = calls[1][1]["sessions"][0]
    assert imported["id"] == "proactive_1"
    assert imported["source"] == "proactive"
    assert imported["messages"] == [
        {
            "role": "assistant",
            "content": "Backup completed.",
            "timestamp": 123.0,
            "finish_reason": "stop",
        }
    ]


def test_import_assistant_session_maps_login_failure_without_leaking_secret(
    monkeypatch,
):
    _configure(monkeypatch)
    calls = []
    responses = [_FakeResponse(401, {"ok": False})]
    monkeypatch.setattr(
        hermes_dashboard.aiohttp,
        "ClientSession",
        lambda **kwargs: _FakeClientSession(responses, calls, **kwargs),
    )

    with pytest.raises(DashboardImportError) as caught:
        asyncio.run(
            hermes_dashboard.import_assistant_session(
                "proactive_1", "NAS report", "Backup completed."
            )
        )

    assert caught.value.code == "dashboard_authentication_failed"
    assert "secret" not in str(caught.value)
