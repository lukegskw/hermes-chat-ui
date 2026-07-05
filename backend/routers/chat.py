from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse
import asyncio
import os
import aiohttp
import json
import yaml
import base64
import uuid
import yaml

from ..engine import async_chat_engine

router = APIRouter()
NATIVE_HERMES_URL = "http://localhost:8642"
active_tasks = {}
active_model_per_conv = {}

# Candidate paths for hermes config.yaml, ordered by priority
_CONFIG_PATHS = [
    os.path.join(os.environ.get("HERMES_HOME", "/opt/data"), "config.yaml"),
    "/opt/data/config.yaml",
    "/opt/data/.hermes/config.yaml",
    os.path.expanduser("~/.hermes/config.yaml"),
]


def _update_hermes_config_model(model_name: str) -> None:
    """
    Write the desired model directly into hermes config.yaml.

    The hermes-agent gateway reads config.yaml when spawning new
    sessions, so updating `model.default` here ensures the next
    API request uses the correct model.
    """
    for config_path in _CONFIG_PATHS:
        if os.path.exists(config_path):
            with open(config_path, "r") as f:
                config = yaml.safe_load(f) or {}

            if "model" not in config:
                config["model"] = {}

            config["model"]["default"] = model_name

            with open(config_path, "w") as f:
                yaml.dump(config, f, default_flow_style=False)

            print(f"Updated {config_path}: model.default = {model_name}")
            return

    raise FileNotFoundError(
        f"No hermes config.yaml found in any of: {_CONFIG_PATHS}"
    )

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
        user_msg = messages[-1]
        # Use clean user_content if provided (without injected instructions)
        clean_content = body.get("user_content", user_msg.get("content", ""))
        user_msg_id = f"msg_{os.urandom(4).hex()}"
        from ..database import get_db_connection
        try:
            conn = get_db_connection()
            cursor = conn.cursor()
            cursor.execute(
                "INSERT OR IGNORE INTO conversations (id, title, model_id) VALUES (?, ?, ?)",
                (conv_id, "New Chat", body.get("model"))
            )
            cursor.execute(
                "INSERT INTO messages (id, conversation_id, role, content_json) VALUES (?, ?, ?, ?)",
                (user_msg_id, conv_id, "user", json.dumps(clean_content))
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
        
    # Handle model switch by updating config.yaml directly.
    # 
    # Why not use `/model X` as a chat message?
    # The hermes-agent api_server adapter does NOT intercept slash commands.
    # They fall through to the conversation_loop, which tries to call the
    # current default model. If that model is broken (e.g. no credits),
    # even the `/model` command itself fails — a chicken-and-egg problem.
    # 
    # Instead, we write the desired model directly into config.yaml.
    # The gateway reads config.yaml when spawning new sessions, so the
    # next request will use the updated model.
    requested_model = body.get("model")
    if requested_model and active_model_per_conv.get(conv_id) != requested_model:
        # Persist the model choice in our own DB first
        try:
            from ..database import get_db_connection
            conn = get_db_connection()
            cursor = conn.cursor()
            cursor.execute("UPDATE conversations SET model_id = ? WHERE id = ?", (requested_model, conv_id))
            conn.commit()
            conn.close()
        except Exception as e:
            print(f"Error updating model_id in DB: {e}")

        # Update hermes config.yaml
        try:
            _update_hermes_config_model(requested_model)
            active_model_per_conv[conv_id] = requested_model
            print(f"Successfully switched model to {requested_model} via config.yaml")
        except Exception as e:
            print(f"Error switching model via config.yaml: {e}")

    # Import new engine
    from ..cli_engine import async_cli_chat_engine
    
    # Read hermes_session_id from db
    hermes_session_id = None
    try:
        from ..database import get_db_connection
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT hermes_session_id FROM conversations WHERE id = ?", (conv_id,))
        row = cursor.fetchone()
        if row and row["hermes_session_id"]:
            hermes_session_id = row["hermes_session_id"]
        conn.close()
    except Exception as e:
        print(f"Error reading hermes_session_id from DB: {e}")

    response_queue = asyncio.Queue()

    # Launch background task using the CLI engine
    # Extract the user message content as a string
    user_message_str = ""
    image_path = None
    
    if messages and messages[-1]["role"] == "user":
        content = messages[-1].get("content", "")
        if isinstance(content, list):
            # Multimodal content
            text_parts = []
            for part in content:
                if part.get("type") == "text":
                    text_parts.append(part.get("text", ""))
                elif part.get("type") == "image_url" and not image_path:
                    # Extract base64 and save to /tmp
                    img_data = part.get("image_url", {}).get("url", "")
                    if img_data.startswith("data:image"):
                        # Extract base64 string
                        try:
                            b64_str = img_data.split(",")[1]
                            img_bytes = base64.b64decode(b64_str)
                            temp_filename = f"/tmp/hermes_upload_{uuid.uuid4().hex}.png"
                            with open(temp_filename, "wb") as f:
                                f.write(img_bytes)
                            image_path = temp_filename
                        except Exception as e:
                            print(f"Failed to decode/save image: {e}")
            user_message_str = "\n".join(text_parts)
        else:
            user_message_str = content
    elif "user_content" in body:
        content = body["user_content"]
        if isinstance(content, list):
            text_parts = [p.get("text", "") for p in content if p.get("type") == "text"]
            user_message_str = "\n".join(text_parts)
        else:
            user_message_str = content
        
    bg_task = asyncio.create_task(
        async_cli_chat_engine(conv_id, user_msg_id, user_message_str, hermes_session_id, response_queue, image_path)
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
