from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse
import asyncio
import os
import aiohttp
import json

from ..engine import async_chat_engine

router = APIRouter()
NATIVE_HERMES_URL = "http://localhost:8642"
active_tasks = {}

@router.post("/api/chat/{conv_id}/cancel")
async def cancel_chat(conv_id: str):
    """Explicitly cancel a running generation task for a conversation."""
    if conv_id in active_tasks:
        active_tasks[conv_id].cancel()
        return {"status": "cancelled"}
    return {"status": "not found"}

@router.post("/api/session/compress")
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

@router.post("/v1/chat/completions")
async def chat_completions(request: Request):
    """Proxy the chat completion request to the native Hermes API."""
    body_bytes = await request.body()
    body = json.loads(body_bytes)
    
    # We need the conversation_id and user message ID to track this in the DB
    # The frontend should pass `conversation_id` in the body or headers, or inside messages.
    # We can extract it from the payload if the frontend passes it in a custom field.
    conv_id = request.headers.get("X-Conversation-Id")
    if not conv_id:
        # Fallback to generating a dummy one, though frontend MUST pass it
        conv_id = f"chat_{os.urandom(4).hex()}"
        
    # The last message is the user message
    messages = body.get("messages", [])
    user_msg_id = ""
    if messages and messages[-1]["role"] == "user":
        # frontend must inject the ID or we assume it's already saved by frontend?
        # Actually, the proxy saves it. But the proxy needs to save the user message to the DB here!
        user_msg = messages[-1]
        user_msg_id = f"msg_{os.urandom(4).hex()}"
        from ..database import get_db_connection
        try:
            conn = get_db_connection()
            cursor = conn.cursor()
            cursor.execute(
                "INSERT OR IGNORE INTO conversations (id, title) VALUES (?, ?)",
                (conv_id, "Nova Conversa")
            )
            cursor.execute(
                "INSERT INTO messages (id, conversation_id, role, content_json) VALUES (?, ?, ?, ?)",
                (user_msg_id, conv_id, "user", json.dumps(user_msg.get("content", "")))
            )
            cursor.execute("UPDATE conversations SET updated_at = CURRENT_TIMESTAMP WHERE id = ?", (conv_id,))
            conn.commit()
            conn.close()
        except Exception as e:
            print(f"Failed to save user message: {e}")

    headers = {"Content-Type": "application/json"}
    auth_header = os.environ.get("API_SERVER_KEY")
    if auth_header:
        headers["Authorization"] = f"Bearer {auth_header}"
        
    # Clean up custom headers from body if we added any before passing to native API
    if "conversation_id" in body:
        del body["conversation_id"]
        
    response_queue = asyncio.Queue()

    # Launch background task
    bg_task = asyncio.create_task(
        async_chat_engine(conv_id, user_msg_id, body, headers, response_queue)
    )
    active_tasks[conv_id] = bg_task
    bg_task.add_done_callback(lambda t: active_tasks.pop(conv_id, None))

    async def stream_generator():
        try:
            while True:
                chunk = await response_queue.get()
                if chunk is None:
                    # End of stream
                    break
                yield chunk
        except asyncio.CancelledError:
            # Client disconnected. Generator is cancelled.
            # But the background task `async_chat_engine` continues running!
            print("Client disconnected from SSE stream. Background generation continues...")
            pass

    return StreamingResponse(stream_generator(), media_type="text/event-stream")
