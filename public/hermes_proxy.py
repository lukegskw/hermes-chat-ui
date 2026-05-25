#!/usr/bin/env python3
"""
Hermes Model Proxy Server
This script runs a lightweight HTTP server that queries the local `hermes-agent` backend
and reads the `config.yaml` file to determine the true active model, returning it over HTTP.
"""

import os
import json
import yaml
import urllib.request
from http.server import BaseHTTPRequestHandler, HTTPServer

def get_hermes_models():
    """Get models via localhost API and read config.yaml for default."""
    models = []
    active_model = "hermes-agent"
    provider = "proxy"
    
    # 1. Fetch available models from the local API running on 8642
    try:
        req = urllib.request.Request(
            "http://localhost:8642/v1/models",
            headers={"Content-Type": "application/json"}
        )
        with urllib.request.urlopen(req, timeout=3.0) as response:
            if response.status == 200:
                data = json.loads(response.read().decode('utf-8'))
                raw_models = data.get("data", [])
                for m in raw_models:
                    m_id = m.get("id")
                    if m_id and m_id != "hermes-agent":
                        models.append({"id": m_id, "label": m_id.replace("-", " ").title()})
    except Exception as e:
        print(f"Failed to fetch from local API: {e}")

    # 2. Read the config.yaml to find out exactly which one is the active default
    try:
        hermes_home = os.environ.get("HERMES_HOME", "/opt/data")
        config_paths = [
            os.path.join(hermes_home, "config.yaml"),
            "/opt/data/config.yaml",
            "/opt/data/.hermes/config.yaml",
            os.path.expanduser("~/.hermes/config.yaml")
        ]
        
        for config_path in config_paths:
            if os.path.exists(config_path):
                print(f"Reading active model from: {config_path}")
                with open(config_path, 'r') as f:
                    config = yaml.safe_load(f) or {}
                    provider = config.get("model", {}).get("provider", provider)
                    active_model = config.get("model", {}).get("name", active_model)
                break
    except Exception as e:
        print(f"Failed to read config.yaml: {e}")

    # Ensure the active model is in the list, just in case
    if active_model != "hermes-agent" and not any(m["id"] == active_model for m in models):
        models.insert(0, {"id": active_model, "label": active_model.replace("-", " ").title()})

    return {
        "active_provider": provider,
        "default_model": active_model,
        "data": models
    }

class HermesProxyHandler(BaseHTTPRequestHandler):
    def handle(self):
        try:
            super().handle()
        except (ConnectionResetError, BrokenPipeError):
            pass

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
        self.end_headers()

    def do_GET(self):
        if self.path == '/api/models':
            result = get_hermes_models()
            
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            
            self.wfile.write(json.dumps(result).encode('utf-8'))
        else:
            self.send_response(404)
            self.end_headers()
            
    def log_message(self, format, *args):
        return

def run():
    port = int(os.environ.get('HERMES_PROXY_PORT', 8643))
    server_address = ('0.0.0.0', port)
    
    try:
        httpd = HTTPServer(server_address, HermesProxyHandler)
        print(f'Starting Hermes Models Proxy on port {port}...')
        httpd.serve_forever()
    except OSError as e:
        print(f"Error starting server on port {port}: {e}")

if __name__ == '__main__':
    run()
