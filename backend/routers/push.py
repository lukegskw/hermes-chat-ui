import os
import asyncio
import json
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
from ..database import get_db_connection

router = APIRouter()


# --- Pydantic models ---

class PushSubscriptionKeys(BaseModel):
    p256dh: str
    auth: str


class PushSubscription(BaseModel):
    endpoint: str
    keys: PushSubscriptionKeys


class PushMessage(BaseModel):
    title: str
    body: str
    url: Optional[str] = None


# --- VAPID config ---

VAPID_PUBLIC_KEY = os.environ.get("VAPID_PUBLIC_KEY", "")
VAPID_PRIVATE_KEY = os.environ.get("VAPID_PRIVATE_KEY", "")
VAPID_CLAIMS = {"sub": "mailto:admin@hermes.local"}


# --- Endpoints ---

@router.get("/api/push/vapid-public-key")
async def get_vapid_public_key():
    """Return the VAPID public key for the client to use when subscribing."""
    if not VAPID_PUBLIC_KEY:
        raise HTTPException(status_code=503, detail="VAPID public key not configured")
    return {"publicKey": VAPID_PUBLIC_KEY}


@router.post("/api/push/subscribe")
async def subscribe(subscription: PushSubscription):
    """Save a push subscription to the database."""
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute(
            "INSERT OR REPLACE INTO push_subscriptions (endpoint, p256dh, auth) VALUES (?, ?, ?)",
            (subscription.endpoint, subscription.keys.p256dh, subscription.keys.auth),
        )
        conn.commit()
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()
    return {"status": "success"}


@router.post("/api/push/unsubscribe")
async def unsubscribe(payload: dict):
    """Remove a push subscription from the database."""
    endpoint = payload.get("endpoint")
    if not endpoint:
        raise HTTPException(status_code=400, detail="endpoint is required")

    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute(
            "DELETE FROM push_subscriptions WHERE endpoint = ?", (endpoint,)
        )
        conn.commit()
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()
    return {"status": "success"}


@router.post("/api/push/send")
async def send_push_notification(message: PushMessage):
    """Send a push notification to all stored subscriptions."""
    if not VAPID_PRIVATE_KEY:
        raise HTTPException(status_code=503, detail="VAPID private key not configured – push notifications are disabled")

    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT endpoint, p256dh, auth FROM push_subscriptions")
    rows = cursor.fetchall()
    conn.close()

    if not rows:
        return {"status": "success", "sent": 0, "message": "No subscriptions found"}

    payload = json.dumps({
        "title": message.title,
        "body": message.body,
        "url": message.url,
    })

    results = await _send_to_all(rows, payload)
    return {
        "status": "success",
        "sent": results["sent"],
        "failed": results["failed"],
    }


@router.get("/api/push/status")
async def push_status():
    """Return whether push notifications are configured."""
    configured = bool(VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY)
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT COUNT(*) FROM push_subscriptions")
    count = cursor.fetchone()[0]
    conn.close()
    return {
        "configured": configured,
        "subscriptionCount": count,
    }


# --- Helper: broadcast to all subscriptions ---

async def _send_to_all(rows, payload: str) -> dict:
    """Send a push message to every subscription. Remove invalid ones."""
    from pywebpush import webpush, WebPushException

    sent = 0
    failed = 0
    endpoints_to_remove = []

    loop = asyncio.get_event_loop()

    for row in rows:
        endpoint, p256dh, auth = row["endpoint"], row["p256dh"], row["auth"]
        subscription_info = {
            "endpoint": endpoint,
            "keys": {"p256dh": p256dh, "auth": auth},
        }
        try:
            # pywebpush is synchronous – run in executor to avoid blocking
            await loop.run_in_executor(
                None,
                lambda: webpush(
                    subscription_info=subscription_info,
                    data=payload,
                    vapid_private_key=VAPID_PRIVATE_KEY,
                    vapid_claims=VAPID_CLAIMS,
                ),
            )
            sent += 1
        except WebPushException as exc:
            failed += 1
            # If the subscription is no longer valid, mark for removal
            if "410" in str(exc) or "no longer valid" in str(exc).lower():
                endpoints_to_remove.append(endpoint)
        except Exception:
            failed += 1

    # Clean up stale subscriptions
    if endpoints_to_remove:
        conn = get_db_connection()
        cursor = conn.cursor()
        try:
            cursor.executemany(
                "DELETE FROM push_subscriptions WHERE endpoint = ?",
                [(e,) for e in endpoints_to_remove],
            )
            conn.commit()
        finally:
            conn.close()

    return {"sent": sent, "failed": failed}
