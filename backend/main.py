import os
import sys

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

from backend.routers import chat, config, health, notifications

app = FastAPI(title="Hermes Chat UI")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(chat.router, prefix="/api")
app.include_router(config.router, prefix="/api")
app.include_router(health.router, prefix="/api")
app.include_router(notifications.router, prefix="/api/push")


# Serve static frontend files
frontend_path = os.path.join(os.path.dirname(__file__), "..", "dist")
if os.path.isdir(frontend_path):
    app.mount("/", StaticFiles(directory=frontend_path, html=True), name="frontend")
    
# Fallback for SPA routing - serve index.html for any unmatched route
@app.get("/{full_path:path}")
async def serve_spa(full_path: str):
    frontend_path = os.path.join(os.path.dirname(__file__), "..", "dist")
    index_path = os.path.join(frontend_path, "index.html")
    if os.path.exists(index_path):
        return FileResponse(index_path)
    return {"error": "Frontend not built. Run 'npm run build' first."}
