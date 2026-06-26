import asyncio
import json
import os
import aiohttp
from typing import AsyncGenerator
from .database import get_db_connection

NATIVE_HERMES_URL = "http://localhost:8642"

async def async_chat_engine(
    conv_id: str,
    user_msg_id: str,
    body: dict,
    headers: dict,
    response_queue: asyncio.Queue
):
    """
    Background task that sends the request to the native Hermes engine,
    consumes the SSE stream, stores the result in the database,
    and feeds the response_queue so the HTTP endpoint can stream to the client.
    """
    
    assistant_msg_id = f"msg_{os.urandom(4).hex()}"
    full_content = ""
    full_reasoning_content = ""
    tool_calls = []
    
    # Insert a placeholder assistant message into the DB
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute(
            "INSERT INTO messages (id, conversation_id, role, content_json, tool_calls_json, reasoning_content_json) VALUES (?, ?, ?, ?, ?, ?)",
            (assistant_msg_id, conv_id, "assistant", json.dumps(full_content), json.dumps(tool_calls), json.dumps(full_reasoning_content) if full_reasoning_content else None)
        )
        # Also update the conversation timestamp
        cursor.execute("UPDATE conversations SET updated_at = CURRENT_TIMESTAMP WHERE id = ?", (conv_id,))
        conn.commit()
    except Exception as e:
        print(f"Error inserting initial assistant message: {e}")
    finally:
        conn.close()

    async with aiohttp.ClientSession() as session:
        try:
            async with session.post(f"{NATIVE_HERMES_URL}/v1/chat/completions", json=body, headers=headers) as response:
                if response.status != 200:
                    error_msg = await response.read()
                    error_str = f"API Error {response.status}: {error_msg.decode()}"
                    
                    err_chunk = f"data: {json.dumps({'choices': [{'delta': {'content': error_str}}]})}\n\n".encode()
                    await response_queue.put(err_chunk)
                    await response_queue.put(b"data: [DONE]\n\n")
                    
                    # Update DB with error
                    _update_message_in_db(assistant_msg_id, error_str, "", tool_calls)
                    return
                
                # Consume stream
                async for chunk, _ in response.content.iter_chunks():
                    # Put chunk to the queue for the frontend
                    await response_queue.put(chunk)
                    
                    # Parse SSE to accumulate content, reasoning_content and tool calls
                    _parse_and_accumulate(chunk, tool_calls)
                    full_content += _extract_content(chunk)
                    full_reasoning_content += _extract_reasoning_content(chunk)

        except Exception as e:
            err_chunk = f"data: {json.dumps({'choices': [{'delta': {'content': f'Proxy Error: {str(e)}'}}]})}\n\n".encode()
            await response_queue.put(err_chunk)
    
    # Update DB BEFORE sending DONE to avoid race condition where the
    # frontend reloads between [DONE] and the DB write, leaving an empty
    # placeholder message in the database.
    _update_message_in_db(assistant_msg_id, full_content, full_reasoning_content, tool_calls)
    
    # Trigger push notification if configured
    try:
        from .routers.notifications import _load_subscriptions, is_any_client_active
        from .push import send_push_notification
        
        if is_any_client_active():
            print("[push] Client active, skipping push notification")
        else:
            subs = _load_subscriptions()
            if subs:
                import re
                clean_content = re.sub(r'<TITLE>.*?</TITLE>', '', full_content, flags=re.DOTALL).strip()
                preview = clean_content[:100] + "..." if len(clean_content) > 100 else clean_content
                data = {"title": "New message", "body": preview, "url": "/"}
                for sub in subs:
                    send_push_notification(sub, data)
    except Exception as e:
        print(f"[push] Failed to trigger notification after generation: {e}")
    
    # Stream is complete. Send DONE flag to queue.
    await response_queue.put(None) # None signifies end of stream


def _update_message_in_db(msg_id: str, content: str, reasoning_content: str, tool_calls: list):
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute(
            "UPDATE messages SET content_json = ?, reasoning_content_json = ?, tool_calls_json = ? WHERE id = ?",
            (json.dumps(content), json.dumps(reasoning_content) if reasoning_content else None, json.dumps(tool_calls) if tool_calls else None, msg_id)
        )
        conn.commit()
    except Exception as e:
        print(f"Error updating message in DB: {e}")
    finally:
        conn.close()


def _extract_content(chunk: bytes) -> str:
    content = ""
    text = chunk.decode(errors="ignore")
    lines = text.split('\n')
    for line in lines:
        if line.startswith("data: ") and line != "data: [DONE]":
            try:
                data = json.loads(line[6:])
                choices = data.get("choices", [])
                if choices:
                    delta = choices[0].get("delta", {})
                    if "content" in delta and delta["content"]:
                        content += delta["content"]
            except json.JSONDecodeError:
                pass
    return content


def _extract_reasoning_content(chunk: bytes) -> str:
    reasoning_content = ""
    text = chunk.decode(errors="ignore")
    lines = text.split('\n')
    for line in lines:
        if line.startswith("data: ") and line != "data: [DONE]":
            try:
                data = json.loads(line[6:])
                choices = data.get("choices", [])
                if choices:
                    delta = choices[0].get("delta", {})
                    if "reasoning_content" in delta and delta["reasoning_content"]:
                        reasoning_content += delta["reasoning_content"]
            except json.JSONDecodeError:
                pass
    return reasoning_content


def _parse_and_accumulate(chunk: bytes, tool_calls: list):
    text = chunk.decode(errors="ignore")
    lines = text.split('\n')
    for line in lines:
        if line.startswith("data: ") and line != "data: [DONE]":
            try:
                data = json.loads(line[6:])
                choices = data.get("choices", [])
                if choices:
                    delta = choices[0].get("delta", {})
                    if "tool_calls" in delta:
                        tc_delta = delta["tool_calls"]
                        for tc in tc_delta:
                            idx = tc.get("index", 0)
                            # Ensure list is long enough
                            while len(tool_calls) <= idx:
                                tool_calls.append({
                                    "id": "",
                                    "type": "function",
                                    "function": {"name": "", "arguments": ""},
                                    "status": "running"
                                })
                            
                            if "id" in tc and tc["id"]:
                                tool_calls[idx]["id"] = tc["id"]
                            if "type" in tc and tc["type"]:
                                tool_calls[idx]["type"] = tc["type"]
                            
                            if "function" in tc:
                                fn = tc["function"]
                                if "name" in fn and fn["name"]:
                                    tool_calls[idx]["function"]["name"] = fn["name"]
                                if "arguments" in fn and fn["arguments"]:
                                    tool_calls[idx]["function"]["arguments"] += fn["arguments"]
                                    
                            if "status" in tc and tc["status"]:
                                tool_calls[idx]["status"] = tc["status"]
                
                # Handle Hermes custom tool events
                if "toolCallId" in data and "tool" in data:
                    tool_id = data["toolCallId"]
                    # Find existing entry by id
                    existing_idx = next(
                        (i for i, tc in enumerate(tool_calls) if tc["id"] == tool_id),
                        None
                    )
                    if existing_idx is None:
                        tool_calls.append({
                            "id": tool_id,
                            "type": "function",
                            "function": {
                                "name": data.get("tool", ""),
                                "arguments": "",
                            },
                            "label": data.get("label", ""),
                            "status": data.get("status", "running"),
                        })
                    else:
                        if data.get("status"):
                            tool_calls[existing_idx]["status"] = data["status"]
                        if data.get("label"):
                            tool_calls[existing_idx]["label"] = data["label"]
            except json.JSONDecodeError:
                pass
