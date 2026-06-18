"""
Web Push notification module.
Handles VAPID key management and push notification delivery.
"""
import json
import os
from pathlib import Path


VAPID_KEYS_FILE = os.environ.get("VAPID_KEYS_FILE", "/opt/data/vapid_keys.json")
VAPID_SUBJECT = os.environ.get("VAPID_SUBJECT", "mailto:push@example.com")


def get_vapid_keys() -> dict:
    """Get or generate VAPID keys."""
    keys_path = Path(VAPID_KEYS_FILE).expanduser()
    
    # Verifica fallback
    fallback_path = Path("~/.hermes/vapid_keys.json").expanduser()
    if not keys_path.exists() and fallback_path.exists():
        keys_path = fallback_path

    if keys_path.exists():
        try:
            with open(keys_path, "r") as f:
                keys = json.load(f)
            if "private_key" in keys and "public_key" in keys:
                return keys
        except Exception:
            pass

    # Generate new keys
    try:
        from cryptography.hazmat.primitives.asymmetric import ec
        from cryptography.hazmat.primitives import serialization
        import base64
    except ImportError:
        print("[push] Warning: cryptography package not installed. VAPID generation failed.")
        return {}

    private_key = ec.generate_private_key(ec.SECP256R1())
    private_pem = private_key.private_bytes(
        serialization.Encoding.PEM,
        serialization.PrivateFormat.PKCS8,
        serialization.NoEncryption(),
    ).decode()

    # Convert public key to uncompressed point format for VAPID
    public_numbers = private_key.public_key().public_numbers()
    x = public_numbers.x.to_bytes(32, "big")
    y = public_numbers.y.to_bytes(32, "big")
    uncompressed_point = b"\x04" + x + y
    public_key_b64 = base64.urlsafe_b64encode(uncompressed_point).rstrip(b"=").decode()

    keys = {
        "private_key": private_pem,
        "public_key": public_key_b64,
    }

    try:
        keys_path.parent.mkdir(parents=True, exist_ok=True)
        with open(keys_path, "w") as f:
            json.dump(keys, f)
        print(f"[push] Generated new VAPID keys, saved to {keys_path}")
    except Exception as e:
        print(f"[push] Failed to save VAPID keys to {keys_path}: {e}")
        try:
            keys_path = Path("~/.hermes/vapid_keys.json").expanduser()
            keys_path.parent.mkdir(parents=True, exist_ok=True)
            with open(keys_path, "w") as f:
                json.dump(keys, f)
            print(f"[push] Saved VAPID keys to fallback {keys_path}")
        except Exception as e2:
            print(f"[push] Failed to save VAPID keys to fallback: {e2}")

    return keys


def get_vapid_public_key() -> str:
    """Get the VAPID public key (base64url-encoded uncompressed point)."""
    keys = get_vapid_keys()
    return keys.get("public_key", "")


def send_push_notification(subscription_info: dict, data: dict) -> bool:
    """
    Send a push notification to a subscription.
    Returns True if successful, False otherwise.
    """
    keys = get_vapid_keys()
    if not keys:
        print("[push] No VAPID keys available, skipping push.")
        return False

    try:
        from pywebpush import webpush, WebPushException
    except ImportError:
        print("[push] Warning: pywebpush package not installed. Skipping push.")
        return False

    import tempfile
    import os
    tmp_path = None
    try:
        with tempfile.NamedTemporaryFile(mode="w", delete=False, suffix=".pem") as tmp:
            tmp.write(keys["private_key"])
            tmp_path = tmp.name

        webpush(
            subscription_info=subscription_info,
            data=json.dumps(data),
            vapid_private_key=tmp_path,
            vapid_claims={"sub": VAPID_SUBJECT},
        )
        return True
    except WebPushException as e:
        print(f"[push] Failed to send notification: {e}")
        return False
    except Exception as e:
        print(f"[push] Unexpected error: {e}")
        return False
    finally:
        if tmp_path and os.path.exists(tmp_path):
            os.remove(tmp_path)
