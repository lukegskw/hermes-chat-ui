import asyncio
import json
from contextlib import suppress
from dataclasses import dataclass, field
from urllib.parse import quote

import aiohttp
from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse, Response, StreamingResponse

from ..hermes_client import (
    HERMES_API_URL,
    hermes_headers,
    proxy_json_request,
    upstream_unavailable,
)

router = APIRouter(tags=["hermes-sessions"])


@dataclass
class ActiveSessionStream:
    queue: asyncio.Queue[bytes | None] = field(default_factory=asyncio.Queue)
    connected: bool = True
    task: asyncio.Task[None] | None = None


active_streams: dict[str, ActiveSessionStream] = {}


def _session_path(session_id: str, suffix: str = "") -> str:
    return f"/api/sessions/{quote(session_id, safe='')}{suffix}"


async def _cancel_active_stream(session_id: str) -> bool:
    active = active_streams.get(session_id)
    if not active or not active.task or active.task.done():
        return False
    active.task.cancel()
    with suppress(asyncio.CancelledError):
        await active.task
    return True


def _forward_query(request: Request) -> list[tuple[str, str]]:
    return list(request.query_params.multi_items())


async def _request_payload(request: Request) -> object:
    try:
        return await request.json()
    except (json.JSONDecodeError, UnicodeDecodeError):
        return {}


def _extract_completed_content(buffer: str) -> tuple[str, str]:
    completed = ""
    blocks = buffer.split("\n\n")
    remainder = blocks.pop() if blocks else ""
    for block in blocks:
        event_name = ""
        data_lines: list[str] = []
        for line in block.splitlines():
            if line.startswith("event:"):
                event_name = line[6:].strip()
            elif line.startswith("data:"):
                data_lines.append(line[5:].strip())
        if event_name != "assistant.completed" or not data_lines:
            continue
        try:
            payload = json.loads("\n".join(data_lines))
        except json.JSONDecodeError:
            continue
        content = payload.get("content")
        if isinstance(content, str):
            completed = content
    return remainder, completed


def _send_completion_notification(content: str) -> None:
    if not content:
        return
    try:
        from ..push import send_push_notification
        from .notifications import _load_subscriptions, is_any_client_active

        if is_any_client_active():
            return
        preview = content.strip()
        if len(preview) > 100:
            preview = f"{preview[:100]}..."
        payload = {"title": "New message", "body": preview, "url": "/"}
        for subscription in _load_subscriptions():
            send_push_notification(subscription, payload)
    except Exception as exc:  # noqa: BLE001 - notifications must not fail a run
        print(f"[push] Failed to send completion notification: {exc}")


async def _consume_upstream_stream(
    session_id: str,
    active: ActiveSessionStream,
    client: aiohttp.ClientSession,
    upstream: aiohttp.ClientResponse,
) -> None:
    event_buffer = ""
    completed_content = ""
    try:
        async for chunk in upstream.content.iter_any():
            if active.connected:
                await active.queue.put(chunk)
            event_buffer += chunk.decode("utf-8", errors="ignore")
            event_buffer, parsed_content = _extract_completed_content(event_buffer)
            if parsed_content:
                completed_content = parsed_content
    except asyncio.CancelledError:
        raise
    except Exception as exc:  # noqa: BLE001 - translate stream failures to SSE
        if active.connected:
            payload = json.dumps({"message": str(exc)})
            await active.queue.put(f"event: error\ndata: {payload}\n\n".encode())
    finally:
        upstream.close()
        await client.close()
        if active.connected:
            await active.queue.put(None)
        if active_streams.get(session_id) is active:
            active_streams.pop(session_id, None)
        if completed_content:
            await asyncio.to_thread(_send_completion_notification, completed_content)


@router.get("/v1/capabilities")
async def capabilities():
    return await proxy_json_request("GET", "/v1/capabilities")


@router.get("/api/sessions")
async def list_sessions(request: Request):
    return await proxy_json_request(
        "GET", "/api/sessions", params=_forward_query(request)
    )


@router.post("/api/sessions")
async def create_session(request: Request):
    return await proxy_json_request(
        "POST", "/api/sessions", payload=await _request_payload(request)
    )


@router.get("/api/sessions/{session_id}")
async def get_session(session_id: str):
    return await proxy_json_request("GET", _session_path(session_id))


@router.patch("/api/sessions/{session_id}")
async def patch_session(session_id: str, request: Request):
    return await proxy_json_request(
        "PATCH",
        _session_path(session_id),
        payload=await _request_payload(request),
    )


@router.delete("/api/sessions/{session_id}")
async def delete_session(session_id: str):
    await _cancel_active_stream(session_id)
    return await proxy_json_request("DELETE", _session_path(session_id))


@router.get("/api/sessions/{session_id}/messages")
async def get_session_messages(session_id: str):
    return await proxy_json_request("GET", _session_path(session_id, "/messages"))


@router.post("/api/sessions/{session_id}/model")
async def set_session_model(session_id: str, request: Request):
    return await proxy_json_request(
        "POST",
        _session_path(session_id, "/model"),
        payload=await _request_payload(request),
    )


@router.post("/api/sessions/{session_id}/chat/stream")
async def stream_session_chat(session_id: str, request: Request):
    existing = active_streams.get(session_id)
    if existing and existing.task and not existing.task.done():
        return JSONResponse(
            status_code=409,
            content={
                "detail": "A generation is already active for this session",
                "code": "session_generation_active",
            },
        )

    payload = await _request_payload(request)
    client = aiohttp.ClientSession(
        timeout=aiohttp.ClientTimeout(total=None, sock_connect=30, sock_read=None)
    )
    try:
        upstream = await client.post(
            f"{HERMES_API_URL}{_session_path(session_id, '/chat/stream')}",
            json=payload,
            headers=hermes_headers(accept="text/event-stream"),
        )
    except (aiohttp.ClientError, TimeoutError) as exc:
        await client.close()
        return upstream_unavailable(exc)

    if upstream.status != 200:
        content = await upstream.read()
        content_type = upstream.headers.get("Content-Type", "application/json")
        upstream.close()
        await client.close()
        return Response(
            content=content,
            status_code=upstream.status,
            headers={"Content-Type": content_type},
        )

    active = ActiveSessionStream()
    active_streams[session_id] = active
    active.task = asyncio.create_task(
        _consume_upstream_stream(session_id, active, client, upstream)
    )

    async def browser_stream():
        try:
            while True:
                chunk = await active.queue.get()
                if chunk is None:
                    break
                yield chunk
        finally:
            active.connected = False

    return StreamingResponse(
        browser_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "X-Hermes-Session-Id": upstream.headers.get(
                "X-Hermes-Session-Id", session_id
            ),
        },
    )


@router.post("/api/sessions/{session_id}/chat/cancel")
async def cancel_session_chat(session_id: str):
    cancelled = await _cancel_active_stream(session_id)
    return {"status": "cancelled" if cancelled else "not_found"}
