#!/bin/sh

# Inject Docker environment variables into Hermes config.yaml
echo "Auto-populating env_passthrough in config.yaml..."
python3 -c "
import os, yaml
config_path = os.path.join(os.environ.get('HERMES_HOME', '/opt/data'), 'config.yaml')
try:
    config = {}
    if os.path.exists(config_path):
        with open(config_path, 'r') as f:
            config = yaml.safe_load(f) or {}
    if 'terminal' not in config: config['terminal'] = {}
    passthrough = set(config['terminal'].get('env_passthrough', []) or [])
    exclude_exact = {'PATH', 'HOME', 'HOSTNAME', 'PWD', 'OLDPWD', 'TERM', 'SHLVL', 'SHELL', 'LANG', 'LANGUAGE', 'VIRTUAL_ENV', 'VIRTUAL_ENV_PROMPT', 'PYTHONUNBUFFERED', 'PS1', '_', 'HERMES_UID', 'HERMES_GID', 'HERMES_S6_SUPERVISED_CHILD', 'HERMES_WEB_DIST', 'HERMES_TUI_DIR'}
    exclude_prefixes = ('LC_', 'npm_', 'S6_', 'AGENT_BROWSER_', 'PLAYWRIGHT_')
    for k in os.environ.keys():
        if k in exclude_exact or any(k.startswith(p) for p in exclude_prefixes): continue
        passthrough.add(k)
    config['terminal']['env_passthrough'] = sorted(list(passthrough))
    with open(config_path, 'w') as f:
        yaml.dump(config, f, default_flow_style=False)
    print('Successfully updated terminal.env_passthrough')
except Exception as e:
    print('Failed to update config.yaml:', e)
"

# Start hermes-agent dashboard in background
echo "Starting Hermes Agent dashboard..."
DASHBOARD_PORT=${HERMES_DASHBOARD_PORT:-9119}
if [ "$(id -u)" = "0" ]; then
    /opt/hermes/docker/entrypoint.sh hermes dashboard --host 0.0.0.0 --port ${DASHBOARD_PORT} --insecure &
else
    hermes dashboard --host 0.0.0.0 --port ${DASHBOARD_PORT} --insecure &
fi

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

# Start the FastAPI proxy (serves UI + API)
echo "Starting Hermes Proxy and UI..."
cd /app
exec python3 -m backend.main
