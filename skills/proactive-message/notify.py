import sys
import uuid
import time
import requests
import os

def send_proactive_message(message: str, title: str = "Hermes Agent"):
    base_url = "http://localhost:8643"
    conv_id = f"chat_{int(time.time()*1000)}_{uuid.uuid4().hex[:8]}"
    msg_id = f"msg_{uuid.uuid4().hex[:8]}"
    
    # 1. Create conversation in DB
    conv_payload = {
        "id": conv_id,
        "title": title,
        "model_id": "hermes-agent",
        "messages": [
            {
                "id": msg_id,
                "role": "assistant",
                "content": message
            }
        ]
    }
    
    try:
        r = requests.post(f"{base_url}/api/conversations", json=conv_payload)
        r.raise_for_status()
    except Exception as e:
        print(f"Failed to create conversation: {e}")
        sys.exit(1)
        
    # 2. Trigger Push Notification
    push_payload = {
        "title": title,
        "body": message[:100] + "..." if len(message) > 100 else message,
        "url": "/"
    }
    
    headers = {}
    api_key = os.environ.get("HERMES_PUSH_API_KEY", "")
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"
        
    try:
        r = requests.post(f"{base_url}/api/push/send", json=push_payload, headers=headers)
        r.raise_for_status()
        print(f"Successfully sent proactive message! Conversation ID: {conv_id}")
    except Exception as e:
        print(f"Failed to send push notification: {e}")
        sys.exit(1)

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python3 notify.py \"<message>\" [\"<title>\"]")
        sys.exit(1)
    
    message = sys.argv[1]
    title = sys.argv[2] if len(sys.argv) > 2 else "Hermes Agent"
    send_proactive_message(message, title)
