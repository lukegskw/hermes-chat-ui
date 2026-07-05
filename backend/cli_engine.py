import asyncio
import json
import os
import re
import logging
from .database import get_db_connection

logger = logging.getLogger(__name__)

async def async_cli_chat_engine(
    conv_id: str,
    user_msg_id: str, # Not directly used for DB here but useful context
    user_message: str,
    hermes_session_id: str | None,
    response_queue: asyncio.Queue,
    image_path: str | None = None,
) -> str | None:
    """
    Spawns 'hermes chat -q MESSAGE [--resume SESSION_ID]' as a subprocess,
    streams stdout line by line, parses the CLI output into SSE events,
    and returns the new hermes_session_id for this conversation.
    """
    assistant_msg_id = f"msg_{os.urandom(4).hex()}"
    full_content = ""
    reasoning_content = ""
    tool_calls = []
    
    # Insert a placeholder assistant message into the DB
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute(
            "INSERT INTO messages (id, conversation_id, role, content_json, reasoning_content_json, tool_calls_json) VALUES (?, ?, ?, ?, ?, ?)",
            (assistant_msg_id, conv_id, "assistant", json.dumps(full_content), json.dumps(reasoning_content), json.dumps(tool_calls))
        )
        # Also update the conversation timestamp
        cursor.execute("UPDATE conversations SET updated_at = CURRENT_TIMESTAMP WHERE id = ?", (conv_id,))
        conn.commit()
    except Exception as e:
        print(f"Error inserting initial assistant message: {e}")
    finally:
        conn.close()

    cmd = ["hermes", "chat", "-q", user_message]
    if image_path:
        cmd.extend(["--image", image_path])
    if hermes_session_id:
        cmd.extend(["--resume", hermes_session_id])

    logger.info(f"Starting hermes CLI: {' '.join(cmd)}")

    try:
        process = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT,
        )

        state = "INIT"
        new_session_id = hermes_session_id
        tool_call_counter = 0

        while True:
            line_bytes = await process.stdout.readline()
            if not line_bytes:
                break
                
            line = line_bytes.decode('utf-8').rstrip('\r\n')
            
            # 1) Intercept tool call lines regardless of state
            is_tool_line = False
            if "┊" in line:
                parts = line.split("┊", 1)
                if len(parts) > 1:
                    part_after_bar = parts[1].strip()
                    tokens = part_after_bar.split()
                    if len(tokens) >= 2:
                        tool_text = " ".join(tokens[1:])
                        # Tool text e.g., "preparing search_files…" or "search_files      *  1.5s"
                        if tool_text.startswith("preparing ") or "*" in tool_text or "s" in tokens[-1]:
                            is_tool_line = True
            
            if is_tool_line:
                # Process tool call
                part_after_bar = line.split("┊", 1)[1].strip()
                tokens = part_after_bar.split()
                tool_text = " ".join(tokens[1:])
                
                status = "running"
                if "*" in tool_text or "s" in tokens[-1]:
                    status = "completed"
                    
                if tool_text.startswith("preparing "):
                    tool_name = tool_text.split("preparing ")[1].replace('…', '').strip()
                else:
                    tool_name = tokens[1].strip() # tokens[0] is emoji, tokens[1] is name
                    
                tool_id = f"cli_tool_{tool_call_counter}"
                if status == "running":
                    tool_call_counter += 1
                    tool_calls.append({
                        "id": tool_id,
                        "type": "function",
                        "function": {
                            "name": tool_name,
                            "arguments": "",
                        },
                        "label": tool_text,
                        "status": status,
                    })
                else:
                    if tool_calls:
                        tool_id = tool_calls[-1]["id"]
                        tool_calls[-1]["status"] = status
                        tool_calls[-1]["label"] = tool_text

                # Emit tool call SSE
                tool_call_event = {
                    "type": "tool_call",
                    "tool": tool_name,
                    "status": status,
                    "label": tool_text,
                    "toolCallId": tool_id
                }
                event_str = json.dumps(tool_call_event, ensure_ascii=False)
                await response_queue.put(f"data: {event_str}\n\n".encode('utf-8'))
                continue
            
            # 2) Standard state machine for content and reasoning
            if state == "INIT":
                if "┌─ Reasoning" in line:
                    state = "IN_REASONING"
                    continue
                elif "╭─ ⚕ Hermes" in line:
                    state = "IN_RESPONSE"
                    continue
                elif "hermes --resume " in line:
                    parts = line.split("hermes --resume ")
                    if len(parts) > 1:
                        new_session_id = parts[1].strip()
                    continue
                elif "Session:" in line:
                    parts = line.split("Session:")
                    if len(parts) > 1:
                        new_session_id = parts[1].strip()
                    continue
                    
            elif state == "IN_REASONING":
                if "└─" in line:
                    state = "INIT"
                    continue
                else:
                    content = line + "\n"
                    reasoning_content += content
                    reasoning_event = {
                        "type": "reasoning",
                        "content": content
                    }
                    event_str = json.dumps(reasoning_event, ensure_ascii=False)
                    await response_queue.put(f"data: {event_str}\n\n".encode('utf-8'))
                    continue
                    
            elif state == "IN_RESPONSE":
                if "╰─" in line:
                    state = "INIT"
                    continue
                else:
                    # Strip the first 4 spaces if they exist (CLI indents the content)
                    content = line
                    if content.startswith("    "):
                        content = content[4:]
                    content = content + "\n"
                    
                    full_content += content
                    
                    content_event = {
                        "choices": [
                            {
                                "delta": {
                                    "content": content
                                }
                            }
                        ]
                    }
                    event_str = json.dumps(content_event, ensure_ascii=False)
                    await response_queue.put(f"data: {event_str}\n\n".encode('utf-8'))
                    continue

        await process.wait()

        # Cleanup temp image if it exists
        if image_path and os.path.exists(image_path):
            try:
                os.remove(image_path)
            except Exception as e:
                logger.error(f"Failed to remove temp image {image_path}: {e}")

    except Exception as e:
        logger.error(f"Error in async_cli_chat_engine: {e}")
        err_str = f"CLI Error: {str(e)}"
        err_chunk = f"data: {json.dumps({'choices': [{'delta': {'content': err_str}}]})}\n\n".encode()
        await response_queue.put(err_chunk)
        full_content += err_str

    # Update DB BEFORE sending DONE
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute(
            "UPDATE messages SET content_json = ?, reasoning_content_json = ?, tool_calls_json = ? WHERE id = ?",
            (json.dumps(full_content), json.dumps(reasoning_content) if reasoning_content else None, json.dumps(tool_calls) if tool_calls else None, assistant_msg_id)
        )
        if new_session_id:
            cursor.execute(
                "UPDATE conversations SET hermes_session_id = ? WHERE id = ?",
                (new_session_id, conv_id)
            )
        conn.commit()
    except Exception as e:
        print(f"Error updating message in DB: {e}")
    finally:
        conn.close()
        
    # Trigger push notification if configured
    try:
        from .routers.notifications import _load_subscriptions, is_any_client_active
        from .push import send_push_notification
        
        if is_any_client_active():
            print("[push] Client active, skipping push notification")
        else:
            subs = _load_subscriptions()
            if subs:
                clean_content = re.sub(r'<TITLE>.*?</TITLE>', '', full_content, flags=re.DOTALL).strip()
                preview = clean_content[:100] + "..." if len(clean_content) > 100 else clean_content
                data = {"title": "New message", "body": preview, "url": "/"}
                for sub in subs:
                    send_push_notification(sub, data)
    except Exception as e:
        print(f"[push] Failed to trigger notification after generation: {e}")

    # Stream is complete. Send DONE flag to queue.
    await response_queue.put(b"data: [DONE]\n\n")
    await response_queue.put(None) # None signifies end of stream
    
    return new_session_id
