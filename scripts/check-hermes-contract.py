#!/usr/bin/env python3
"""Fail fast when a Hermes image lacks this UI's required HTTP contract.

Run manually against the *separately deployed* Hermes service; it does not
write to Hermes and does not start any container.
"""

from __future__ import annotations

import os
import sys

import httpx

base_url = os.environ.get("HERMES_CONTRACT_URL", "").rstrip("/")
api_key = os.environ.get("HERMES_CONTRACT_API_KEY", "")
if not base_url:
    sys.exit("Set HERMES_CONTRACT_URL, for example http://nas-host:8642")

headers = {"Authorization": f"Bearer {api_key}"} if api_key else {}
required_features = {
    "session_resources",
    "session_chat",
    "session_chat_streaming",
    "model_options",
    "session_model_lock",
}

with httpx.Client(timeout=20, headers=headers) as client:
    capabilities_response = client.get(f"{base_url}/v1/capabilities")
    capabilities_response.raise_for_status()
    capabilities = capabilities_response.json()
    missing = sorted(
        feature
        for feature in required_features
        if capabilities.get("features", {}).get(feature) is not True
    )
    if missing:
        sys.exit(f"Hermes contract missing features: {', '.join(missing)}")

    model_options_response = client.get(f"{base_url}/api/model/options")
    model_options_response.raise_for_status()
    payload = model_options_response.json()
    if not isinstance(payload.get("providers"), list):
        sys.exit("Hermes model options payload has no providers list")

print("Hermes API contract: compatible")
