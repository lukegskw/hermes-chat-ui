import json
from types import SimpleNamespace

from fastapi.responses import Response
from fastapi.testclient import TestClient

from backend.main import app
from backend.routers import config


def test_reasoning_efforts_intersect_hermes_constants_with_session_parser(monkeypatch):
    def fake_import(module_name: str):
        if module_name == "hermes_constants":
            return SimpleNamespace(
                VALID_REASONING_EFFORTS=(
                    "minimal",
                    "low",
                    "medium",
                    "high",
                    "xhigh",
                    "max",
                    "ultra",
                )
            )
        if module_name == "gateway.platforms.api_server":
            return SimpleNamespace(_REASONING_EFFORTS={"minimal", "medium", "xhigh"})
        raise ImportError(module_name)

    monkeypatch.setattr(config.importlib, "import_module", fake_import)

    assert config._session_api_reasoning_efforts() == ["minimal", "medium", "xhigh"]


def test_reasoning_efforts_use_the_conservative_session_contract_for_hermes_019(
    monkeypatch,
):
    def fake_import(module_name: str):
        if module_name == "hermes_constants":
            return SimpleNamespace(
                VALID_REASONING_EFFORTS=("minimal", "xhigh", "max", "ultra")
            )
        if module_name == "gateway.platforms.api_server":
            return SimpleNamespace()
        raise ImportError(module_name)

    monkeypatch.setattr(config.importlib, "import_module", fake_import)

    assert config._session_api_reasoning_efforts() == ["minimal", "xhigh"]


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
        config, "_session_api_reasoning_efforts", lambda: ["minimal", "xhigh"]
    )
    monkeypatch.setattr(
        config,
        "_catalog_reasoning_defaults",
        lambda _payload: {"p": {"test": "high"}},
    )

    with TestClient(app) as client:
        response = client.get("/api/model/options")

    assert response.status_code == 200
    assert response.json()["reasoning_efforts"] == ["minimal", "xhigh"]
    assert response.json()["reasoning_defaults"] == {"p": {"test": "high"}}
