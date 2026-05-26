import json
import asyncio
import os
import yaml
from fastapi import FastAPI, Request, HTTPException
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
import aiohttp

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
                with open(config_path, 'r') as f:
                    config = yaml.safe_load(f) or {}
                    provider = config.get("model", {}).get("provider", provider)
                    active_model = config.get("model", {}).get("default", config.get("model", {}).get("name", active_model))
                break
    except Exception as e:
        print(f"Error reading config: {e}")

    try:
        if __namespace:
            models_module = __import__(f"{__namespace}.models", fromlist=['provider_model_ids', '_PROVIDER_MODELS'])
            try:
                m_ids = models_module.provider_model_ids(provider)
                if m_ids:
                    models = [{"id": m, "label": str(m).replace("-", " ").title()} for m in m_ids]
            except AttributeError:
                m_data = getattr(models_module, '_PROVIDER_MODELS', {}).get(provider, [])
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

    return {"data": models, "default_model": active_model}

@app.get("/api/approval/pending")
async def get_pending_approvals():
    # Return empty dict so data.pending is undefined
    return {}

@app.post("/api/approval/respond")
async def respond_approval():
    return {"status": "success"}

@app.post("/v1/chat/completions")
async def chat_completions(request: Request):
    """Proxy the chat completion request to the native Hermes API."""
    body = await request.body()
    
    headers = {"Content-Type": "application/json"}
    auth_header = request.headers.get("Authorization")
    if auth_header:
        headers["Authorization"] = auth_header
    
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

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8643)
