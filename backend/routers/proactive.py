"""Internal orchestration endpoint for canonical proactive Hermes messages."""

from __future__ import annotations

import asyncio
import hmac
import json
import os
import tempfile
import time
from pathlib import Path
from urllib.parse import quote
from uuid import uuid4

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from ..hermes_dashboard import DashboardImportError, import_assistant_session
from .notifications import NotificationPayload, deliver_notification

router = APIRouter(prefix="/api/proactive", tags=["proactive"])

MAX_IDEMPOTENCY_RECORDS = 500
_orchestration_lock = asyncio.Lock()


class ProactiveMessage(BaseModel):
    request_id: str = Field(min_length=1, max_length=128, pattern=r"^[A-Za-z0-9_.:-]+$")
    title: str = Field(default="Hermes Agent", min_length=1, max_length=200)
    message: str = Field(min_length=1, max_length=65_536)


def _records_path() -> Path:
    configured = os.environ.get("PROACTIVE_REQUESTS_FILE")
    if configured:
        return Path(configured).expanduser()
    data_dir = Path(os.environ.get("HERMES_UI_DATA_DIR", "/tmp/hermes-chat-ui"))
    return data_dir / "proactive_requests.json"


def _load_records() -> dict[str, dict]:
    path = _records_path()
    try:
        payload = json.loads(path.read_text())
    except (FileNotFoundError, OSError, json.JSONDecodeError):
        return {}
    if not isinstance(payload, dict):
        return {}
    return {
        key: value
        for key, value in payload.items()
        if isinstance(key, str) and isinstance(value, dict)
    }


def _save_records(records: dict[str, dict]) -> None:
    path = _records_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    ordered = sorted(
        records.items(),
        key=lambda item: float(item[1].get("stored_at", 0)),
        reverse=True,
    )[:MAX_IDEMPOTENCY_RECORDS]
    serializable = dict(ordered)
    temporary_name = ""
    try:
        with tempfile.NamedTemporaryFile(
            mode="w", encoding="utf-8", dir=path.parent, delete=False
        ) as temporary:
            json.dump(serializable, temporary, separators=(",", ":"))
            temporary_name = temporary.name
        os.replace(temporary_name, path)
    finally:
        if temporary_name:
            try:
                os.unlink(temporary_name)
            except FileNotFoundError:
                pass


def _require_internal_key(request: Request) -> None:
    expected = os.environ.get("HERMES_PUSH_API_KEY", "")
    if not expected:
        raise HTTPException(
            status_code=503,
            detail="Proactive messaging is not configured",
            headers={"Cache-Control": "no-store"},
        )
    supplied = request.headers.get("Authorization", "")
    if not hmac.compare_digest(supplied, f"Bearer {expected}"):
        raise HTTPException(status_code=401, detail="Unauthorized")


def _overall_status(persisted: bool, push_status: str) -> str:
    push_succeeded = push_status == "sent"
    if persisted and push_succeeded:
        return "complete"
    if persisted or push_status in {"sent", "partial"}:
        return "partial"
    return "failed"


@router.post("/messages")
async def create_proactive_message(
    payload: ProactiveMessage, request: Request
) -> dict:
    _require_internal_key(request)

    async with _orchestration_lock:
        records = await asyncio.to_thread(_load_records)
        existing = records.get(payload.request_id)
        if existing:
            replay = dict(existing.get("result") or {})
            replay["replayed"] = True
            return replay

        session_id = f"proactive_{int(time.time() * 1000)}_{uuid4().hex[:8]}"
        persistence_error: str | None = None
        try:
            await import_assistant_session(session_id, payload.title, payload.message)
            persisted = True
        except DashboardImportError as exc:
            persisted = False
            persistence_error = exc.code

        if persisted:
            push_body = payload.message
            push_url = f"/?session={quote(session_id, safe='')}"
        else:
            push_body = f"Conversation was not saved. {payload.message}"
            push_url = "/"

        push_result = await asyncio.to_thread(
            deliver_notification,
            NotificationPayload(
                title=payload.title,
                body=push_body[:500],
                url=push_url,
                tag=f"proactive-{payload.request_id}",
                notification_id=payload.request_id,
                session_id=session_id if persisted else None,
            ),
        )
        result = {
            "status": _overall_status(persisted, push_result["status"]),
            "session": {
                "persisted": persisted,
                **({"id": session_id} if persisted else {}),
                **({"error": persistence_error} if persistence_error else {}),
            },
            "push": push_result,
            "replayed": False,
        }
        records[payload.request_id] = {"stored_at": time.time(), "result": result}
        await asyncio.to_thread(_save_records, records)
        return result
