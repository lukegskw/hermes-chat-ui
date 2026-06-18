import sqlite3
import os
import json

DB_PATH = os.environ.get("HERMES_DB_PATH", "~/.hermes/hermes_chats.db")

def get_db_connection():
    db_file = os.path.expanduser(DB_PATH)
    os.makedirs(os.path.dirname(db_file), exist_ok=True)
    
    conn = sqlite3.connect(db_file)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_db_connection()
    cursor = conn.cursor()
    
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS conversations (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            model_id TEXT,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    """)
    
    # Migration: add model_id to existing db if missing
    try:
        cursor.execute("ALTER TABLE conversations ADD COLUMN model_id TEXT")
    except sqlite3.OperationalError:
        pass # Column already exists
    
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS messages (
            id TEXT PRIMARY KEY,
            conversation_id TEXT NOT NULL,
            role TEXT NOT NULL,
            content_json TEXT NOT NULL,
            tool_calls_json TEXT,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
        )
    """)
    
    conn.commit()
    conn.close()

# Initialize DB on import
init_db()
