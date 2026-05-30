import os
import yaml
from fastapi import APIRouter, Request

router = APIRouter()

__namespace = None
for ns in ['hermes_agent', 'hermes_cli', 'hermes', 'openhermes']:
    try:
        __import__(f"{ns}.models")
        __namespace = ns
        break
    except ImportError:
        pass

@router.get("/api/models")
async def get_models(request: Request):
    """Fetch models from config.yaml and the python package."""
    models = []
    active_model = "hermes-agent"
    provider = "proxy"
    
    try:
        hermes_home = os.environ.get("HERMES_HOME", "/opt/data")
        config_paths = [
            os.path.join(hermes_home, "config.yaml"),
            "/opt/data/config.yaml",
            "/opt/data/.hermes/config.yaml",
            os.path.expanduser("~/.hermes/config.yaml")
        ]
        
        for config_path in config_paths:
            if os.path.exists(config_path):
                try:
                    with open(config_path, 'r') as f:
                        config = yaml.safe_load(f) or {}
                        provider = config.get("model", {}).get("provider", provider)
                        active_model = config.get("model", {}).get("default", config.get("model", {}).get("name", active_model))
                    break
                except Exception as e:
                    print(f"Error reading config at {config_path}: {e}")
                    continue
    except Exception as e:
        print(f"Unexpected error in config parsing: {e}")

    try:
        if __namespace:
            models_module = __import__(f"{__namespace}.models", fromlist=['provider_model_ids', '_PROVIDER_MODELS'])
            try:
                m_ids = models_module.provider_model_ids(provider)
                if m_ids:
                    models = [{"id": m, "label": str(m).replace("-", " ").title()} for m in m_ids]
            except AttributeError:
                m_data_map = getattr(models_module, '_PROVIDER_MODELS', {})
                if provider in m_data_map:
                    m_data = m_data_map[provider]
                else:
                    m_data = []
                    for p_models in m_data_map.values():
                        m_data.extend(p_models)
                for m in m_data:
                    if isinstance(m, dict) and "id" in m:
                        models.append({"id": m["id"], "label": m["id"].replace("-", " ").title()})
                    elif isinstance(m, str):
                        models.append({"id": m, "label": m.replace("-", " ").title()})
    except Exception as e:
        print(f"Error fetching models from {__namespace}: {e}")
        pass

    if active_model != "hermes-agent" and not any(m["id"] == active_model for m in models):
        models.insert(0, {"id": active_model, "label": active_model.replace("-", " ").title()})
        
    if not models:
        models = [{"id": "hermes-agent", "label": "Hermes Agent"}]

    unique_models = []
    seen = set()
    for m in models:
        if m["id"] not in seen:
            seen.add(m["id"])
            unique_models.append(m)

    return {"data": unique_models, "default_model": active_model}

@router.get("/api/config")
async def get_config():
    """Returns the runtime configuration for the UI."""
    return {
        "auth_required": False
    }
