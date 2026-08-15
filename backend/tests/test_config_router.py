import json

from fastapi.responses import Response
from fastapi.testclient import TestClient

from backend.main import app
from backend.routers import config


def test_reasoning_defaults_match_global_and_spelling_tolerant_overrides():
    config_data = {
        "agent": {
            "reasoning_effort": "medium",
            "reasoning_overrides": {
                "claude-opus-4.5": "ultra",
                "disabled-model": False,
            },
        }
    }

    assert config._effective_reasoning_default(config_data, "claude-opus-4-5") == "ultra"
    assert config._effective_reasoning_default(config_data, "disabled-model") == "none"
    assert config._effective_reasoning_default(config_data, "other-model") == "medium"


def test_reasoning_defaults_are_resolved_per_catalog_model(monkeypatch):
    monkeypatch.setattr(config, "_load_hermes_config", lambda: {"agent": {}})
    monkeypatch.setattr(
        config,
        "_effective_reasoning_default",
        lambda _cfg, model: {"model-a": "high", "model-b": "none"}.get(
            model, "provider"
        ),
    )

    assert config._catalog_reasoning_defaults(
        {
            "providers": [
                {"slug": "openai", "models": ["model-a", "model-b"]},
                {"slug": "anthropic", "models": ["model-c"]},
            ]
        }
    ) == {
        "openai": {"model-a": "high", "model-b": "none"},
        "anthropic": {"model-c": "provider"},
    }


def test_model_options_adds_compatibility_reasoning_efforts(monkeypatch):
    async def fake_proxy(*_args, **_kwargs):
        return Response(
            content=json.dumps({"model": "test", "provider": "p", "providers": []}),
            status_code=200,
            media_type="application/json",
        )

    monkeypatch.setattr(config, "proxy_json_request", fake_proxy)
    monkeypatch.setattr(
        config,
        "_catalog_reasoning_defaults",
        lambda _payload: {"p": {"test": "high"}},
    )

    with TestClient(app) as client:
        response = client.get("/api/model/options")

    assert response.status_code == 200
    assert response.json()["reasoning_efforts"] == list(config.KNOWN_REASONING_EFFORTS)
    assert response.json()["reasoning_unconfirmed_efforts"] == ["max", "ultra"]
    assert response.json()["reasoning_defaults"] == {"p": {"test": "high"}}


def test_model_options_prefers_known_efforts_advertised_by_hermes(monkeypatch):
    async def fake_proxy(*_args, **_kwargs):
        return Response(
            content=json.dumps(
                {
                    "providers": [],
                    "reasoning_efforts": ["none", "high", "future-level"],
                }
            ),
            status_code=200,
            media_type="application/json",
        )

    monkeypatch.setattr(config, "proxy_json_request", fake_proxy)
    with TestClient(app) as client:
        response = client.get("/api/model/options")

    assert response.json()["reasoning_efforts"] == list(config.KNOWN_REASONING_EFFORTS)
    assert response.json()["reasoning_unconfirmed_efforts"] == [
        "minimal",
        "low",
        "medium",
        "xhigh",
        "max",
        "ultra",
    ]
