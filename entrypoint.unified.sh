#!/bin/sh

# Start hermes-agent gateway in background
echo "Starting Hermes Agent gateway..."
hermes gateway run --accept-hooks &
HERMES_PID=$!

# Wait for gateway to be ready
echo "Waiting for Hermes Agent gateway to become ready..."
for i in $(seq 1 30); do
  if curl -s http://localhost:8642/v1/models > /dev/null 2>&1; then
    echo "Hermes Agent gateway is ready."
    break
  fi
  sleep 1
done

# Start the FastAPI proxy (serves UI + API)
echo "Starting Hermes Proxy and UI..."
exec python3 /app/hermes_proxy.py
