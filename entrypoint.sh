#!/bin/sh

# Path where the public files are served
CONFIG_FILE="/usr/share/nginx/html/config.js"

# Generate runtime window.APP_CONFIG from container environment variables
echo "window.APP_CONFIG = {" > "$CONFIG_FILE"
echo "  HERMES_API_URL: \"${HERMES_API_URL:-http://localhost:8642}\"," >> "$CONFIG_FILE"
echo "  HERMES_API_KEY: \"${HERMES_API_KEY:-hermes-secure-api-key-2026}\"" >> "$CONFIG_FILE"
echo "};" >> "$CONFIG_FILE"

echo "Runtime configuration generated successfully at $CONFIG_FILE"

# Execute Nginx (CMD arguments)
exec "$@"
