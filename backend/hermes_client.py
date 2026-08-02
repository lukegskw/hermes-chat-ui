import os
from collections.abc import Mapping

import aiohttp
from fastapi.responses import JSONResponse, Response

HERMES_API_URL = os.environ.get("HERMES_API_URL", "http://127.0.0.1:8642").rstrip("/")


def hermes_headers(*, accept: str = "application/json") -> dict[str, str]:
    headers = {"Accept": accept}
    api_key = os.environ.get("API_SERVER_KEY") or os.environ.get("HERMES_API_KEY")
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"
    return headers


def upstream_unavailable(exc: Exception) -> JSONResponse:
    return JSONResponse(
        status_code=503,
        content={
            "detail": "Hermes Agent is unavailable",
            "code": "hermes_unavailable",
            "error": str(exc),
        },
    )


async def proxy_json_request(
    method: str,
    path: str,
    *,
    params: Mapping[str, str] | list[tuple[str, str]] | None = None,
    payload: object | None = None,
) -> Response:
    timeout = aiohttp.ClientTimeout(total=30)
    try:
        async with (
            aiohttp.ClientSession(timeout=timeout) as session,
            session.request(
                method,
                f"{HERMES_API_URL}{path}",
                params=params,
                json=payload,
                headers=hermes_headers(),
            ) as upstream,
        ):
            content = await upstream.read()
            response_headers: dict[str, str] = {}
            content_type = upstream.headers.get("Content-Type")
            if content_type:
                response_headers["Content-Type"] = content_type
            session_id = upstream.headers.get("X-Hermes-Session-Id")
            if session_id:
                response_headers["X-Hermes-Session-Id"] = session_id
            return Response(
                content=content,
                status_code=upstream.status,
                headers=response_headers,
            )
    except (aiohttp.ClientError, TimeoutError) as exc:
        return upstream_unavailable(exc)
