from fastapi import APIRouter, HTTPException
from typing import List
import json
from ..database import get_db_connection
from ..models import Conversation, Message

router = APIRouter()

@router.get("/api/conversations")
async def list_conversations():
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT id, title, model_id, updated_at FROM conversations ORDER BY updated_at DESC")
    rows = cursor.fetchall()
    
    conversations = []
    for row in rows:
        conversations.append({
            "id": row["id"],
            "title": row["title"],
            "modelId": row["model_id"],
            "updated_at": row["updated_at"],
            "messages": [] # We don't need to load all messages for the list view
        })
    conn.close()
    return conversations

@router.get("/api/conversations/{conv_id}")
async def get_conversation(conv_id: str):
    conn = get_db_connection()
    cursor = conn.cursor()
    
    cursor.execute("SELECT * FROM conversations WHERE id = ?", (conv_id,))
    conv_row = cursor.fetchone()
    if not conv_row:
        conn.close()
        raise HTTPException(status_code=404, detail="Conversation not found")
        
    cursor.execute("SELECT * FROM messages WHERE conversation_id = ? ORDER BY timestamp ASC", (conv_id,))
    msg_rows = cursor.fetchall()
    
    messages = []
    for m in msg_rows:
        messages.append({
            "id": m["id"],
            "role": m["role"],
            "content": json.loads(m["content_json"]),
            "reasoning_content": json.loads(m["reasoning_content_json"]) if "reasoning_content_json" in m.keys() and m["reasoning_content_json"] else None,
            "tool_calls": json.loads(m["tool_calls_json"]) if m["tool_calls_json"] else None,
            "timestamp": m["timestamp"]
        })
        
    conn.close()
    return {
        "id": conv_row["id"],
        "title": conv_row["title"],
        "modelId": conv_row["model_id"],
        "updated_at": conv_row["updated_at"],
        "messages": messages
    }

@router.post("/api/conversations")
async def create_conversation(conv: Conversation):
    conn = get_db_connection()
    cursor = conn.cursor()
    
    try:
        cursor.execute(
            "INSERT INTO conversations (id, title, model_id) VALUES (?, ?, ?)",
            (conv.id, conv.title, conv.model_id)
        )
        for msg in conv.messages:
            cursor.execute(
                "INSERT INTO messages (id, conversation_id, role, content_json, tool_calls_json) VALUES (?, ?, ?, ?, ?)",
                (
                    msg.id,
                    conv.id,
                    msg.role,
                    json.dumps(msg.content),
                    json.dumps(msg.tool_calls) if msg.tool_calls else None
                )
            )
        conn.commit()
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()
    return {"status": "success", "id": conv.id}

@router.delete("/api/conversations/{conv_id}")
async def delete_conversation(conv_id: str):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM conversations WHERE id = ?", (conv_id,))
    conn.commit()
    conn.close()
    return {"status": "success"}

@router.delete("/api/conversations")
async def delete_all_conversations():
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM conversations")
    conn.commit()
    conn.close()
    return {"status": "success"}

@router.put("/api/conversations/{conv_id}")
async def update_conversation_title(conv_id: str, payload: dict):
    title = payload.get("title")
    if not title:
        raise HTTPException(status_code=400, detail="Title is required")
        
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("UPDATE conversations SET title = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", (title, conv_id))
    conn.commit()
    conn.close()
    return {"status": "success"}

@router.put("/api/conversations/{conv_id}/model")
async def update_conversation_model(conv_id: str, payload: dict):
    model_id = payload.get("modelId")
    if not model_id:
        raise HTTPException(status_code=400, detail="modelId is required")
        
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("UPDATE conversations SET model_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", (model_id, conv_id))
    conn.commit()
    conn.close()
    return {"status": "success"}

