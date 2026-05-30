import json
import asyncio
import os
import yaml
import importlib.util
from fastapi import FastAPI, Request, HTTPException
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
import aiohttp

# --- PROXY APP ---
app = FastAPI(title="Hermes Chat UI Proxy")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

NATIVE_HERMES_URL = "http://localhost:8642"

__namespace = None
for ns in ['hermes_agent', 'hermes_cli', 'hermes', 'openhermes']:
    try:
        __import__(f"{ns}.models")
        __namespace = ns
        break
    except ImportError:
        pass

@app.get("/api/models")
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


@app.post("/api/session/compress")
async def compress_session(request: Request):
    """Trigger context compaction via chat completions"""
    body = {
        "model": "hermes-agent",
        "messages": [{"role": "user", "content": "/compress"}],
        "stream": False
    }
    headers = {"Content-Type": "application/json"}
    auth_header = os.environ.get("API_SERVER_KEY")
    if auth_header:
        headers["Authorization"] = f"Bearer {auth_header}"
        
    async with aiohttp.ClientSession() as session:
        try:
            async with session.post(f"{NATIVE_HERMES_URL}/v1/chat/completions", json=body, headers=headers) as response:
                if response.status == 200:
                    return {"status": "success"}
        except Exception as e:
            print("Failed to compress:", e)
            
    return {"status": "error"}

@app.post("/v1/chat/completions")
async def chat_completions(request: Request):
    """Proxy the chat completion request to the native Hermes API."""
    body = await request.body()
    
    headers = {"Content-Type": "application/json"}
    auth_header = os.environ.get("API_SERVER_KEY")
    if auth_header:
        headers["Authorization"] = f"Bearer {auth_header}"
    
    async def stream_generator():
        async with aiohttp.ClientSession() as session:
            try:
                async with session.post(f"{NATIVE_HERMES_URL}/v1/chat/completions", data=body, headers=headers) as response:
                    if response.status != 200:
                        error_msg = await response.read()
                        yield f"data: {json.dumps({'choices': [{'delta': {'content': f'API Error {response.status}: {error_msg.decode()}'}}]})}\n\n"
                        yield "data: [DONE]\n\n"
                        return
                    
                    async for chunk, _ in response.content.iter_chunks():
                        yield chunk
            except Exception as e:
                yield f"data: {json.dumps({'choices': [{'delta': {'content': f'Proxy Error: {str(e)}'}}]})}\n\n"
                yield "data: [DONE]\n\n"

    return StreamingResponse(stream_generator(), media_type="text/event-stream")

@app.get("/api/config")
async def get_config():
    """Returns the runtime configuration for the UI."""
    return {
        "auth_required": False
    }

# Mount SPA
from fastapi.staticfiles import StaticFiles
static_dir = os.environ.get("HERMES_STATIC_DIR", "/app/static")
if os.path.exists(static_dir):
    app.mount("/", StaticFiles(directory=static_dir, html=True), name="static")
else:
    print(f"WARNING: Static directory '{static_dir}' not found. UI will not be served.")

if __name__ == "__main__":
    import uvicorn
    print("Starting Hermes Proxy (Model Extractor & Compact Wrapper)...")
    port = int(os.environ.get("HERMES_PROXY_PORT", os.environ.get("PORT", 8643)))
    uvicorn.run(app, host="0.0.0.0", port=port)
