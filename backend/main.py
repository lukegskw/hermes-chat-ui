from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import Response
import os

from .routers import config, conversations, chat

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


@app.get("/config.js")
async def serve_config_js():
    """Dynamically generate config.js with ALL environment variables.
    
    The entrypoint runs as non-root (hermes user) and cannot overwrite
    /app/static/config.js which is root-owned. Serving dynamically via
    this route avoids filesystem permission issues entirely.
    """
    lines = [
        "// Auto-generated at runtime. Do not edit.\n",
        "window.APP_CONFIG = {\n",
    ]
    first = True
    for name, value in sorted(os.environ.items()):
        safe_value = value.replace("\\", "\\\\").replace('"', '\\"')
        if first:
            lines.append(f'  "{name}": "{safe_value}"')
            first = False
        else:
            lines.append(f',\n  "{name}": "{safe_value}"')
    lines.append("\n};\n")
    return Response(content="".join(lines), media_type="application/javascript")


# Include routers
app.include_router(config.router)
app.include_router(conversations.router)
app.include_router(chat.router)

# Mount SPA — must be after explicit routes so /config.js is intercepted
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
