#!/bin/sh

# Inject Docker environment variables into Hermes config.yaml
echo "Auto-populating config.yaml..."
python3 -c "
import os, yaml, hashlib, secrets

config_path = os.path.join(os.environ.get('HERMES_HOME', '/opt/data'), 'config.yaml')
try:
    config = {}
    if os.path.exists(config_path):
        with open(config_path, 'r') as f:
            config = yaml.safe_load(f) or {}

    # --- env_passthrough ---
    if 'terminal' not in config: config['terminal'] = {}
    passthrough = set(config['terminal'].get('env_passthrough', []) or [])
    exclude_exact = {'PATH', 'HOME', 'HOSTNAME', 'PWD', 'OLDPWD', 'TERM', 'SHLVL', 'SHELL', 'LANG', 'LANGUAGE', 'VIRTUAL_ENV', 'VIRTUAL_ENV_PROMPT', 'PYTHONUNBUFFERED', 'PS1', '_', 'HERMES_UID', 'HERMES_GID', 'HERMES_S6_SUPERVISED_CHILD', 'HERMES_WEB_DIST', 'HERMES_TUI_DIR'}
    exclude_prefixes = ('LC_', 'npm_', 'S6_', 'AGENT_BROWSER_', 'PLAYWRIGHT_')
    for k in os.environ.keys():
        if k in exclude_exact or any(k.startswith(p) for p in exclude_prefixes): continue
        passthrough.add(k)
    config['terminal']['env_passthrough'] = sorted(list(passthrough))
    print('Updated terminal.env_passthrough')

    # --- Dashboard basic_auth (from env vars) ---
    dash_user = os.environ.get('HERMES_DASHBOARD_USER', '')
    dash_pass = os.environ.get('HERMES_DASHBOARD_PASSWORD', '')
    if dash_user and dash_pass:
        if 'dashboard' not in config: config['dashboard'] = {}
        if 'basic_auth' not in config['dashboard']: config['dashboard']['basic_auth'] = {}
        salt = secrets.token_hex(16)
        pw_hash = hashlib.sha256((salt + dash_pass).encode()).hexdigest()
        password_hash = salt + ':' + pw_hash
        config['dashboard']['basic_auth']['username'] = dash_user
        config['dashboard']['basic_auth']['password_hash'] = password_hash
        if not config['dashboard']['basic_auth'].get('secret'):
            config['dashboard']['basic_auth']['secret'] = secrets.token_hex(32)
        print('Updated dashboard.basic_auth for user:', dash_user)
    else:
        print('Skipping dashboard auth setup (HERMES_DASHBOARD_USER / HERMES_DASHBOARD_PASSWORD not set)')

    with open(config_path, 'w') as f:
        yaml.dump(config, f, default_flow_style=False)
    print('Config saved successfully')
except Exception as e:
    print('Failed to update config.yaml:', e)
"

# Start hermes-agent gateway (with dashboard if auth is configured)
echo "Starting Hermes Agent gateway..."
# Enable s6-supervised dashboard if credentials are provided
if [ -n "${HERMES_DASHBOARD_USER}" ] && [ -n "${HERMES_DASHBOARD_PASSWORD}" ]; then
    export HERMES_DASHBOARD=1
    export HERMES_DASHBOARD_HOST=0.0.0.0
    export HERMES_DASHBOARD_PORT=${HERMES_DASHBOARD_PORT:-9119}
    echo "Dashboard enabled (s6-supervised) on port ${HERMES_DASHBOARD_PORT}"
else
    echo "Dashboard disabled — set HERMES_DASHBOARD_USER and HERMES_DASHBOARD_PASSWORD to enable"
fi

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
