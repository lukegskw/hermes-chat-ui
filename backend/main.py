from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import os

from .routers import config, conversations, chat, health, notifications

# Initialize database
from . import database

app = FastAPI(title="Hermes Chat UI Proxy")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(config.router)
app.include_router(conversations.router)
app.include_router(chat.router)
app.include_router(health.router)
app.include_router(notifications.router, prefix="/api/push")

# Mount SPA
static_dir = os.environ.get("HERMES_STATIC_DIR", "/app/static")
if os.path.exists(static_dir):
    app.mount("/", StaticFiles(directory=static_dir, html=True), name="static")
else:
    print(f"WARNING: Static directory '{static_dir}' not found. UI will not be served.")

if __name__ == "__main__":
    import uvicorn
    print("Starting Hermes Proxy (Async Chat Engine)...")
    port = int(os.environ.get("HERMES_PROXY_PORT", os.environ.get("PORT", 8643)))
    uvicorn.run("backend.main:app", host="0.0.0.0", port=port, reload=False)
