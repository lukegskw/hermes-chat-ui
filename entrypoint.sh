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
export HERMES_API_URL="${HERMES_API_URL:-http://localhost:8642}"
export HERMES_API_KEY="${HERMES_API_KEY}"
export HERMES_PROXY_PORT="${HERMES_PROXY_PORT:-8643}"
for i in $(seq 1 30); do
  if curl -s http://localhost:${BACKEND_PORT}/v1/models > /dev/null 2>&1; then
    echo "Hermes Agent gateway is ready."
    break
  fi
  sleep 1
done

# Rewrite config.js with ALL environment variables so the frontend can access them
echo "Injecting environment variables into config.js..."
{
  printf "// Auto-generated at container startup. Do not edit.\n"
  printf "window.APP_CONFIG = {\n"
  first=true
  env | while IFS='=' read -r name value; do
    # Skip empty names and internal shell vars
    [ -z "$name" ] && continue
    # Escape backslashes, double quotes, and control chars for JS
    escaped=$(printf '%s' "$value" | sed 's/\\/\\\\/g; s/"/\\"/g')
    if $first; then
      printf '  "%s": "%s"' "$name" "$escaped"
      first=false
    else
      printf ',\n  "%s": "%s"' "$name" "$escaped"
    fi
  done
  printf "\n};\n"
} > /app/static/config.js
echo "config.js written with $(wc -l < /app/static/config.js) lines"

# Start the FastAPI proxy (serves UI + API)
echo "Starting Hermes Proxy and UI..."
cd /app
exec python3 -m backend.main
