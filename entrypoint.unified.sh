#!/bin/sh

# We rely on the base image's s6-rc services to start the gateway natively.

# Start the FastAPI proxy (serves UI + API)
echo "Starting Hermes Proxy and UI..."
exec python3 /app/hermes_proxy.py
