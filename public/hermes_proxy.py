import os
import json
import yaml
import uuid
import asyncio
from typing import Dict, Any, AsyncGenerator

from fastapi import FastAPI, Request, HTTPException
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
import uvicorn

# Try to import hermes agent components
try:
    from hermes_agent.agent import AIAgent
    from hermes_agent.config import AgentConfig
except ImportError:
    AIAgent = None

app = FastAPI(title="Hermes Chat UI Proxy")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# In-memory storage for pending approvals
_pending_approvals: list[dict] = []
# Events to block and wait for user response
_approval_events: dict[str, asyncio.Event] = {}
# Stores the response chosen by the user
_approval_responses: dict[str, str] = {}


def get_hermes_models():
    """Get models via config.yaml and fallback."""
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
    except Exception:
        pass

    try:
        try:
            from hermes_agent.models import provider_model_ids
            m_ids = provider_model_ids(provider)
            if m_ids:
                models = [{"id": m, "label": str(m).replace("-", " ").title()} for m in m_ids]
        except ImportError:
            from hermes_agent.models import _PROVIDER_MODELS
            m_data = _PROVIDER_MODELS.get(provider, [])
            for m in m_data:
                if isinstance(m, dict) and "id" in m:
                    models.append({"id": m["id"], "label": m["id"].replace("-", " ").title()})
                elif isinstance(m, str):
                    models.append({"id": m, "label": m.replace("-", " ").title()})
    except Exception:
        pass

    if active_model != "hermes-agent" and not any(m["id"] == active_model for m in models):
        models.insert(0, {"id": active_model, "label": active_model.replace("-", " ").title()})

    return {
        "active_provider": provider,
        "default_model": active_model,
        "data": models
    }


def approval_callback(tool_name: str, args: dict, **kwargs) -> str:
    """
    Called synchronously by the AIAgent when a restricted tool is invoked.
    We must block until the user resolves the approval via the API.
    """
    global _pending_approvals
    
    approval_id = str(uuid.uuid4())
    
    # Register the pending approval
    pending_data = {
        "id": approval_id,
        "tool": tool_name,
        "command": args.get("command", "") or json.dumps(args),
        "label": f"Hermes requested permission to run {tool_name}",
        "risk_level": "high"
    }
    
    _pending_approvals.append(pending_data)
    
    event = asyncio.Event()
    _approval_events[approval_id] = event
    
    # Since AIAgent might call this from a sync context or thread,
    # we need to wait safely. If we are in an asyncio loop, we await.
    # If not, we run a small loop.
    loop = asyncio.get_event_loop()
    if loop.is_running():
        # Actually, AIAgent's approval_callback is currently synchronous.
        # So we cannot 'await' here easily without a separate thread.
        # But wait, if AIAgent is running in a separate thread via run_in_executor,
        # we can use concurrent.futures to block.
        # A simple busy wait or thread event is safer for a sync callback.
        import threading
        thread_event = threading.Event()
        
        # We need a way to set the thread_event when the asyncio event is set.
        async def waiter():
            await event.wait()
            thread_event.set()
        
        asyncio.run_coroutine_threadsafe(waiter(), loop)
        thread_event.wait()
    else:
        loop.run_until_complete(event.wait())
        
    # Once resolved, retrieve the response and clean up
    response = _approval_responses.pop(approval_id, "deny")
    if approval_id in _approval_events:
        del _approval_events[approval_id]
        
    # Remove from pending queue
    _pending_approvals = [p for p in _pending_approvals if p["id"] != approval_id]
    
    return response


@app.get("/api/models")
async def get_models():
    return get_hermes_models()


@app.get("/api/approval/pending")
async def get_pending_approvals():
    # Return the first pending approval if any, matching the hermes-webui structure
    if _pending_approvals:
        return {"pending": [_pending_approvals[0]]}
    return {"pending": []}


@app.post("/api/approval/respond")
async def respond_approval(request: Request):
    data = await request.json()
    approval_id = data.get("approval_id")
    decision = data.get("decision", "deny")
    
    if approval_id in _approval_events:
        _approval_responses[approval_id] = decision
        _approval_events[approval_id].set()
        return {"status": "success"}
    else:
        raise HTTPException(status_code=404, detail="Approval ID not found or already resolved.")


async def chat_stream_generator(messages: list) -> AsyncGenerator[str, None]:
    if AIAgent is None:
        yield f"data: {json.dumps({'choices': [{'delta': {'content': 'Error: hermes_agent package not found. Cannot run AIAgent natively.'}}]})}\n\n"
        yield "data: [DONE]\n\n"
        return

    # In a real scenario, AIAgent needs to be initialized.
    # hermes-webui handles this by maintaining agent sessions.
    # We will instantiate a new one or use a dummy for simplicity.
    try:
        config = AgentConfig()
        # Ensure the approval mode allows our callback
        config.approvals.mode = "manual" 
        
        agent = AIAgent(config=config)
        agent.set_approval_callback(approval_callback)
        
        # Map messages
        # ... logic to run agent.stream_chat(messages) ...
        # For this proxy, since AIAgent stream implementation is complex:
        async for chunk in agent.stream_chat(messages):
            # Format as OpenAI SSE
            sse_chunk = {
                "id": f"chatcmpl-{uuid.uuid4()}",
                "object": "chat.completion.chunk",
                "choices": [{"index": 0, "delta": {"content": chunk}, "finish_reason": None}]
            }
            yield f"data: {json.dumps(sse_chunk)}\n\n"
            
        yield "data: [DONE]\n\n"
    except Exception as e:
        yield f"data: {json.dumps({'choices': [{'delta': {'content': f'Agent Error: {str(e)}'}}]})}\n\n"
        yield "data: [DONE]\n\n"


@app.post("/v1/chat/completions")
async def chat_completions(request: Request):
    data = await request.json()
    messages = data.get("messages", [])
    stream = data.get("stream", False)
    
    if stream:
        return StreamingResponse(chat_stream_generator(messages), media_type="text/event-stream")
    else:
        # Not implementing non-streaming for now as hermes-chat-ui uses streaming
        raise HTTPException(status_code=501, detail="Only streaming is supported by this proxy.")


def run():
    port = int(os.environ.get('HERMES_PROXY_PORT', 8643))
    print(f'Starting Hermes FastAPI Proxy on port {port}...')
    uvicorn.run(app, host="0.0.0.0", port=port)

if __name__ == '__main__':
    run()
