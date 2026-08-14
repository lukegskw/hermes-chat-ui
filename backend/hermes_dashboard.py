"""Authenticated compatibility boundary for the official Hermes dashboard."""

from __future__ import annotations

import os
import time
from typing import Any

import aiohttp


class DashboardImportError(RuntimeError):
    """A stable, non-sensitive dashboard integration failure."""

    def __init__(self, code: str):
        super().__init__(code)
        self.code = code


def _required_environment(name: str) -> str:
    value = os.environ.get(name, "").strip()
    if not value:
        raise DashboardImportError("dashboard_configuration_missing")
    return value


async def import_assistant_session(
    session_id: str,
    title: str,
    message: str,
    *,
    timestamp: float | None = None,
) -> None:
    """Import one literal assistant message without invoking the Hermes LLM."""

    dashboard_url = _required_environment("HERMES_DASHBOARD_URL").rstrip("/")
    provider = os.environ.get("HERMES_DASHBOARD_AUTH_PROVIDER", "basic").strip()
    username = _required_environment("HERMES_DASHBOARD_BASIC_AUTH_USERNAME")
    password = _required_environment("HERMES_DASHBOARD_BASIC_AUTH_PASSWORD")
    observed_at = time.time() if timestamp is None else timestamp
    timeout = aiohttp.ClientTimeout(total=15, sock_connect=5)

    # The dashboard may be addressed through a Docker hostname or an IP. Its
    # session cookie is scoped to this short-lived in-memory client only.
    cookie_jar = aiohttp.CookieJar(unsafe=True)
    try:
        async with aiohttp.ClientSession(
            timeout=timeout, cookie_jar=cookie_jar
        ) as client:
            async with client.post(
                f"{dashboard_url}/auth/password-login",
                json={
                    "provider": provider or "basic",
                    "username": username,
                    "password": password,
                    "next": "/",
                },
            ) as login_response:
                if login_response.status in {401, 403, 404}:
                    raise DashboardImportError("dashboard_authentication_failed")
                if login_response.status != 200:
                    raise DashboardImportError("dashboard_unavailable")
                login_payload = await _json_object(login_response)
                if login_payload.get("ok") is not True:
                    raise DashboardImportError("dashboard_authentication_failed")

            import_payload = {
                "sessions": [
                    {
                        "id": session_id,
                        "source": "proactive",
                        "title": title,
                        "started_at": observed_at,
                        "ended_at": observed_at,
                        "end_reason": "proactive_message",
                        "messages": [
                            {
                                "role": "assistant",
                                "content": message,
                                "timestamp": observed_at,
                                "finish_reason": "stop",
                            }
                        ],
                    }
                ]
            }
            async with client.post(
                f"{dashboard_url}/api/sessions/import", json=import_payload
            ) as import_response:
                if import_response.status in {401, 403}:
                    raise DashboardImportError("dashboard_authentication_failed")
                if import_response.status != 200:
                    raise DashboardImportError("dashboard_import_failed")
                result = await _json_object(import_response)
    except DashboardImportError:
        raise
    except (aiohttp.ClientError, TimeoutError) as exc:
        raise DashboardImportError("dashboard_unavailable") from exc

    imported_ids = result.get("imported_ids")
    if (
        result.get("ok") is not True
        or not isinstance(imported_ids, list)
        or session_id not in imported_ids
    ):
        raise DashboardImportError("dashboard_import_rejected")


async def _json_object(response: aiohttp.ClientResponse) -> dict[str, Any]:
    try:
        payload = await response.json(content_type=None)
    except (aiohttp.ClientError, ValueError) as exc:
        raise DashboardImportError("dashboard_invalid_response") from exc
    if not isinstance(payload, dict):
        raise DashboardImportError("dashboard_invalid_response")
    return payload
