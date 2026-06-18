"""
Web Push notification module.
Handles VAPID key management and push notification delivery.
"""
import json
import os
from pathlib import Path

from pywebpush import webpush, WebPushException


VAPID_KEYS_FILE = os.environ.get("VAPID_KEYS_FILE", "/app/vapid_keys.json")
VAPID_SUBJECT = os.environ.get("VAPID_SUBJECT", "mailto:admin@hermes.local")


def get_vapid_keys() -> dict:
    """Get or generate VAPID keys."""
    keys_path = Path(VAPID_KEYS_FILE)

    if keys_path.exists():
        with open(keys_path, "r") as f:
            keys = json.load(f)
        if "private_key" in keys and "public_key" in keys:
            return keys

    # Generate new keys
    from cryptography.hazmat.primitives.asymmetric import ec
    from cryptography.hazmat.primitives import serialization

    private_key = ec.generate_private_key(ec.SECP256R1())
    private_pem = private_key.private_bytes(
        serialization.Encoding.PEM,
        serialization.PrivateFormat.PKCS8,
        serialization.NoEncryption(),
    ).decode()

    public_pem = (
        private_key.public_key()
        .public_bytes(
            serialization.Encoding.PEM,
            serialization.PublicFormat.SubjectPublicKeyInfo,
        )
        .decode()
    )

    # Convert public key to uncompressed point format for VAPID
    from cryptography.hazmat.primitives.asymmetric.utils import (
        decode_dss_signature,
    )
    import base64

    public_numbers = private_key.public_key().public_numbers()
    x = public_numbers.x.to_bytes(32, "big")
    y = public_numbers.y.to_bytes(32, "big")
    uncompressed_point = b"\x04" + x + y
    public_key_b64 = base64.urlsafe_b64encode(uncompressed_point).rstrip(b"=").decode()

    keys = {
        "private_key": private_pem,
        "public_key": public_key_b64,
    }

    # Save to file
    keys_path.parent.mkdir(parents=True, exist_ok=True)
    with open(keys_path, "w") as f:
        json.dump(keys, f)

    print(f"[push] Generated new VAPID keys, saved to {keys_path}")
    return keys


def get_vapid_public_key() -> str:
    """Get the VAPID public key (base64url-encoded uncompressed point)."""
    keys = get_vapid_keys()
    return keys["public_key"]


def send_push_notification(subscription_info: dict, data: dict) -> bool:
    """
    Send a push notification to a subscription.
    Returns True if successful, False otherwise.
    """
    keys = get_vapid_keys()

    try:
        webpush(
            subscription_info=subscription_info,
            data=json.dumps(data),
            vapid_private_key=keys["private_key"],
            vapid_claims={"sub": VAPID_SUBJECT},
        )
        return True
    except WebPushException as e:
        print(f"[push] Failed to send notification: {e}")
        return False
    except Exception as e:
        print(f"[push] Unexpected error: {e}")
        return False
