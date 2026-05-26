import json
import asyncio
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

@app.get("/api/models")
async def get_models():
    """Fetch models from the native Hermes API."""
    try:
        async with aiohttp.ClientSession() as session:
            async with session.get(f"{NATIVE_HERMES_URL}/v1/models", timeout=5.0) as response:
                if response.status == 200:
                    data = await response.json()
                    models = [{"id": m["id"], "label": m["id"].replace("-", " ").title()} for m in data.get("data", [])]
                    if models:
                        return models
    except Exception as e:
        print(f"Error fetching models from native API: {e}")
    
    # Fallback if native API fails
    return [{"id": "hermes-agent", "label": "Hermes Agent"}]

@app.get("/api/approval/pending")
async def get_pending_approvals():
    # The user decided to resolve approvals externally. 
    # Return empty to satisfy the frontend's polling.
    return {"pending": []}

@app.post("/api/approval/respond")
async def respond_approval():
    return {"status": "success"}

@app.post("/v1/chat/completions")
async def chat_completions(request: Request):
    """Proxy the chat completion request to the native Hermes API."""
    body = await request.body()
    
    async def stream_generator():
        async with aiohttp.ClientSession() as session:
            async with session.post(f"{NATIVE_HERMES_URL}/v1/chat/completions", data=body, headers={"Content-Type": "application/json"}) as response:
                if response.status != 200:
                    error_msg = await response.read()
                    yield f"data: {json.dumps({'choices': [{'delta': {'content': f'API Error {response.status}: {error_msg.decode()}'}}]})}\n\n"
                    yield "data: [DONE]\n\n"
                    return
                
                async for chunk, _ in response.content.iter_chunks():
                    yield chunk

    return StreamingResponse(stream_generator(), media_type="text/event-stream")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8643)
