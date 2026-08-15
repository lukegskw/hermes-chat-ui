import json
import os
import re
from pathlib import Path
from typing import Any

from fastapi import APIRouter
from fastapi.responses import JSONResponse
import yaml

from ..hermes_client import proxy_json_request

router = APIRouter()

KNOWN_REASONING_EFFORTS = (
    "none",
    "minimal",
    "low",
    "medium",
    "high",
    "xhigh",
    "max",
    "ultra",
)
UNCONFIRMED_SESSION_REASONING_EFFORTS = ("max", "ultra")


def _parse_reasoning_effort(value: object) -> dict[str, object] | None:
    if value is False:
        return {"enabled": False}
    if value is None or value is True:
        return None
    effort = str(value).strip().lower()
    if not effort:
        return None
    if effort in {"none", "false", "disabled"}:
        return {"enabled": False}
    if effort in KNOWN_REASONING_EFFORTS:
        return {"enabled": True, "effort": effort}
    return None


def _canonical_model_variants(model: str) -> list[str]:
    """Return the bounded spelling variants Hermes uses for overrides."""
    seen: set[str] = set()
    variants: list[str] = []

    def add(value: str) -> None:
        if value and value not in seen:
            seen.add(value)
            variants.append(value)

    def add_derivatives(value: str) -> None:
        dashed = value.replace(".", "-")
        dotted = value.replace("-", ".")
        for candidate in (
            value,
            dashed,
            dotted,
            re.sub(r"(\d)-(\d)", r"\1.\2", value),
            re.sub(r"(\d)\.(\d)", r"\1-\2", value),
            re.sub(r"(\d)-(\d)", r"\1.\2", dashed),
            re.sub(r"(\d)\.(\d)", r"\1-\2", dotted),
        ):
            add(candidate)

    add_derivatives(model)
    parts = model.split("/")
    if len(parts) >= 2:
        add_derivatives(parts[-1])
    if len(parts) >= 3:
        add_derivatives("/".join(parts[1:]))
    providers = (
        "anthropic",
        "openai",
        "google",
        "openrouter",
        "groq",
        "mistral",
        "xai",
        "cohere",
        "perplexity",
        "together",
        "fireworks",
        "deepseek",
    )
    for variant in [item for item in variants if "/" not in item]:
        for provider in providers:
            add(f"{provider}/{variant}")
    aggregators = ("openrouter", "opencode", "fireworks", "groq", "together")
    for variant in [item for item in variants if item.count("/") == 1]:
        for aggregator in aggregators:
            add(f"{aggregator}/{variant}")
    return variants


def _resolve_reasoning_config(
    config: dict[str, Any], model: str
) -> dict[str, object] | None:
    agent = config.get("agent")
    if not isinstance(agent, dict):
        agent = {}
    overrides = agent.get("reasoning_overrides")
    if isinstance(overrides, dict):
        for variant in _canonical_model_variants(model):
            if variant in overrides:
                parsed = _parse_reasoning_effort(overrides[variant])
                if parsed is not None:
                    return parsed
    return _parse_reasoning_effort(agent.get("reasoning_effort", ""))


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
    reasoning = _resolve_reasoning_config(config, model)
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

    upstream_efforts = payload.get("reasoning_efforts")
    confirmed_efforts = (
        {
            effort
            for effort in upstream_efforts
            if isinstance(effort, str) and effort in KNOWN_REASONING_EFFORTS
        }
        if isinstance(upstream_efforts, list) and upstream_efforts
        else set(KNOWN_REASONING_EFFORTS) - set(UNCONFIRMED_SESSION_REASONING_EFFORTS)
    )
    payload["reasoning_efforts"] = list(KNOWN_REASONING_EFFORTS)
    payload["reasoning_unconfirmed_efforts"] = [
        effort for effort in KNOWN_REASONING_EFFORTS if effort not in confirmed_efforts
    ]
    payload["reasoning_defaults"] = _catalog_reasoning_defaults(payload)
    return JSONResponse(content=payload, status_code=upstream.status_code)
