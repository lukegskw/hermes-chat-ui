#!/bin/sh
set -e

# Generate VAPID keys if not present
if [ ! -f /app/vapid_keys.json ]; then
    echo "[entrypoint] Generating VAPID keys..."
    python3 -c "
import json
from pathlib import Path
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives import serialization
import base64

private_key = ec.generate_private_key(ec.SECP256R1())
private_pem = private_key.private_bytes(
    serialization.Encoding.PEM,
    serialization.PrivateFormat.PKCS8,
    serialization.NoEncryption(),
).decode()

public_pem = private_key.public_key().public_bytes(
    serialization.Encoding.PEM,
    serialization.PublicFormat.SubjectPublicKeyInfo,
).decode()

public_numbers = private_key.public_key().public_numbers()
x = public_numbers.x.to_bytes(32, 'big')
y = public_numbers.y.to_bytes(32, 'big')
uncompressed_point = b'\x04' + x + y
public_key_b64 = base64.urlsafe_b64encode(uncompressed_point).rstrip(b'=').decode()

keys = {
    'private_key': private_pem,
    'public_key': public_key_b64,
}
Path('/app/vapid_keys.json').write_text(json.dumps(keys, indent=2))
print(f'[entrypoint] VAPID public key: {public_key_b64}')
"
fi

# Export VAPID env vars from keys file if not already set
if [ -f /app/vapid_keys.json ]; then
    export VAPID_PRIVATE_KEY=$(python3 -c "import json; print(json.load(open('/app/vapid_keys.json'))['private_key'])")
    export VAPID_PUBLIC_KEY=$(python3 -c "import json; print(json.load(open('/app/vapid_keys.json'))['public_key'])")
fi

# Populate CHAT_MODEL env var from config.yaml
export_vars_from_config() {
    CONFIG_FILE=/app/config.yaml
    if [ -f "$CONFIG_FILE" ]; then
        echo "[entrypoint] Reading config from $CONFIG_FILE"
        # Extract env_passthrough values and export them
        python3 -c "
import yaml, os, sys
with open('$CONFIG_FILE') as f:
    config = yaml.safe_load(f)
passthrough = config.get('env_passthrough', [])
for key in passthrough:
    val = os.environ.get(key, '')
    if val:
        print(f'{key}={val}')
"
    fi
}

# Start the backend server
echo "[entrypoint] Starting Hermes Chat UI..."
exec uvicorn backend.main:app --host 0.0.0.0 --port 8643 --forwarded-allow-ips='*'
