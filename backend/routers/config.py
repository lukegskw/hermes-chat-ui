import importlib
import json
import os
from pathlib import Path
from typing import Any

from fastapi import APIRouter
from fastapi.responses import JSONResponse
import yaml

from ..hermes_client import proxy_json_request

router = APIRouter()

# Hermes 0.19 publishes the generic constants but predates the gateway's
# private parser constant. This is the conservative Sessions API compatibility
# contract for the recent Agent release; it prevents a 0.19 UI package from
# advertising `max` and `ultra` to an Agent whose session endpoint ignores them.
_FALLBACK_SESSION_API_REASONING_EFFORTS = frozenset(
    {"minimal", "low", "medium", "high", "xhigh"}
)


def _session_api_reasoning_efforts() -> list[str]:
    """Return only values accepted by the installed Hermes Sessions API.

    Hermes' public model catalog currently exposes only a reasoning capability
    bit. Until it exposes per-model levels, use the Hermes compatibility
    package carried by this UI and intersect its general constants with the
    gateway parser. An empty list is safer than inventing a UI fallback.
    """
    try:
        constants = importlib.import_module("hermes_constants")
        try:
            api_server = importlib.import_module("gateway.platforms.api_server")
            supported = set(
                getattr(
                    api_server,
                    "_REASONING_EFFORTS",
                    _FALLBACK_SESSION_API_REASONING_EFFORTS,
                )
            )
        except ImportError:
            supported = _FALLBACK_SESSION_API_REASONING_EFFORTS
        return [
            effort
            for effort in getattr(constants, "VALID_REASONING_EFFORTS")
            if isinstance(effort, str) and effort in supported
        ]
    except (AttributeError, ImportError, TypeError):
        return []


def _load_hermes_config() -> dict[str, Any]:
    """Read the explicitly mounted Hermes config without returning its contents."""
    config_path = Path(
        os.environ.get("HERMES_UI_HERMES_CONFIG", "/hermes-config/config.yaml")
    )
    try:
        parsed = yaml.safe_load(config_path.read_text()) or {}
        return parsed if isinstance(parsed, dict) else {}
    except (OSError, UnicodeDecodeError, yaml.YAMLError):
        return {}


def _effective_reasoning_default(config: dict[str, Any], model: str) -> str:
    """Return a non-sensitive display value for Hermes' effective default."""
    try:
        constants = importlib.import_module("hermes_constants")
        reasoning = constants.resolve_reasoning_config(config, model)
    except (AttributeError, ImportError, TypeError, ValueError):
        return "provider"
    if not isinstance(reasoning, dict):
        return "provider"
    if reasoning.get("enabled") is False:
        return "none"
    effort = reasoning.get("effort")
    return str(effort).strip() if effort else "provider"


def _catalog_reasoning_defaults(payload: dict[str, Any]) -> dict[str, dict[str, str]]:
    config = _load_hermes_config()
    providers = payload.get("providers")
    if not isinstance(providers, list):
        return {}
    defaults: dict[str, dict[str, str]] = {}
    for provider in providers:
        if not isinstance(provider, dict):
            continue
        provider_id = provider.get("slug")
        models = provider.get("models")
        if not isinstance(provider_id, str) or not isinstance(models, list):
            continue
        defaults[provider_id] = {
            model: _effective_reasoning_default(config, model)
            for model in models
            if isinstance(model, str)
        }
    return defaults


@router.get("/api/model/options")
async def model_options():
    """Expose Hermes' catalog plus compatibility-derived session efforts."""
    upstream = await proxy_json_request("GET", "/api/model/options")
    if upstream.status_code != 200:
        return upstream

    try:
        payload = json.loads(upstream.body)
    except (TypeError, json.JSONDecodeError):
        return upstream
    if not isinstance(payload, dict):
        return upstream

    payload["reasoning_efforts"] = _session_api_reasoning_efforts()
    payload["reasoning_defaults"] = _catalog_reasoning_defaults(payload)
    return JSONResponse(content=payload, status_code=upstream.status_code)
