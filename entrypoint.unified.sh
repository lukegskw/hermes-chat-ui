#!/bin/sh

# Start hermes-agent gateway in background
echo "Starting Hermes Agent gateway..."
if [ "$(id -u)" = "0" ]; then
    echo "Running as root, dropping privileges using shim..."
    /opt/hermes/docker/entrypoint.sh hermes gateway run --accept-hooks &
else
    echo "Running as $(whoami), starting directly..."
    hermes gateway run --accept-hooks &
fi

# Wait for gateway to be ready
echo "Waiting for Hermes Agent gateway to become ready..."
BACKEND_PORT=${API_SERVER_PORT:-8642}
for i in $(seq 1 30); do
  if curl -s http://localhost:${BACKEND_PORT}/v1/models > /dev/null 2>&1; then
    echo "Hermes Agent gateway is ready."
    break
  fi
  sleep 1
done

# Start the FastAPI proxy (serves UI + API)
echo "Starting Hermes Proxy and UI..."
cd /app
exec python3 -m backend.main
