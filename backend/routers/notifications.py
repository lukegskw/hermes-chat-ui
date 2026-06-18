"""
Push notification API routes.
Handles subscription management and notification sending.
"""
import json
import os
from pathlib import Path

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from backend.push import get_vapid_public_key, send_push_notification

router = APIRouter(tags=["notifications"])

SUBSCRIPTIONS_FILE = os.environ.get(
    "PUSH_SUBSCRIPTIONS_FILE", "/app/push_subscriptions.json"
)


class PushSubscription(BaseModel):
    endpoint: str
    keys: dict


class NotificationPayload(BaseModel):
    title: str
    body: str
    url: str | None = None
    icon: str | None = None
    tag: str | None = None


def _load_subscriptions() -> list[dict]:
    """Load push subscriptions from file."""
    path = Path(SUBSCRIPTIONS_FILE)
    if not path.exists():
        return []
    with open(path, "r") as f:
        return json.load(f)


def _save_subscriptions(subscriptions: list[dict]) -> None:
    """Save push subscriptions to file."""
    path = Path(SUBSCRIPTIONS_FILE)
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w") as f:
        json.dump(subscriptions, f, indent=2)


@router.get("/vapid-public-key")
async def vapid_public_key():
    """Get the VAPID public key for push subscription."""
    return {"publicKey": get_vapid_public_key()}


@router.post("/subscribe")
async def subscribe(subscription: PushSubscription):
    """Register a push subscription."""
    subscriptions = _load_subscriptions()

    sub_dict = subscription.model_dump()

    # Avoid duplicates
    for existing in subscriptions:
        if existing.get("endpoint") == sub_dict["endpoint"]:
            # Update existing subscription
            existing.update(sub_dict)
            _save_subscriptions(subscriptions)
            return {"status": "updated"}

    subscriptions.append(sub_dict)
    _save_subscriptions(subscriptions)
    return {"status": "subscribed"}


@router.post("/unsubscribe")
async def unsubscribe(subscription: PushSubscription):
    """Remove a push subscription."""
    subscriptions = _load_subscriptions()

    endpoint = subscription.endpoint
    subscriptions = [s for s in subscriptions if s.get("endpoint") != endpoint]

    _save_subscriptions(subscriptions)
    return {"status": "unsubscribed"}


@router.post("/send")
async def send_notification(payload: NotificationPayload, request: Request):
    """
    Send a push notification to all subscribed devices.
    This endpoint is intended for internal use (e.g., from Hermes agent).
    """
    # Simple API key check for internal use
    api_key = os.environ.get("HERMES_PUSH_API_KEY", "")
    if api_key:
        auth_header = request.headers.get("Authorization", "")
        if auth_header != f"Bearer {api_key}":
            raise HTTPException(status_code=401, detail="Unauthorized")

    subscriptions = _load_subscriptions()

    if not subscriptions:
        return {"status": "no_subscriptions", "sent": 0}

    data = {
        "title": payload.title,
        "body": payload.body,
        "url": payload.url,
        "icon": payload.icon,
        "tag": payload.tag,
    }

    sent = 0
    failed = 0
    for sub in subscriptions:
        success = send_push_notification(sub, data)
        if success:
            sent += 1
        else:
            failed += 1

    return {"status": "sent", "sent": sent, "failed": failed}
