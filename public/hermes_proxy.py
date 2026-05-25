#!/usr/bin/env python3
"""
Hermes Model Proxy Server
This script runs a lightweight HTTP server that executes the `hermes model` CLI command,
captures its interactive output using a pseudo-terminal (pty), parses the models list,
and returns it as a clean JSON response over HTTP.

This is meant to be mapped inside the hermes-agent container.
"""

import pty
import os
import subprocess
import time
import json
import re
from http.server import BaseHTTPRequestHandler, HTTPServer

def get_hermes_models():
    """Get models directly via Python imports, fallback to pty scraping."""
    models = []
    active_model = "hermes-agent"
    provider = "github-copilot"
    
    # Removed Native Python imports block to prevent reading stale config.yaml files.
    # We will rely entirely on executing the CLI via PTY to ensure we see exactly what the user sees.

    # ATTEMPT 2: PTY Screen scraping with aggressive fallback
    try:
        master, slave = pty.openpty()
        process = subprocess.Popen(['hermes', 'model'], stdin=slave, stdout=slave, stderr=slave, close_fds=True, env=os.environ.copy())
        os.close(slave)
        
        output = b""
        start_time = time.time()
        
        while time.time() - start_time < 4.0:
            try:
                import select
                r, _, _ = select.select([master], [], [], 0.5)
                if r:
                    data = os.read(master, 1024)
                    if not data: break
                    output += data
                    if b"Skip" in output or b"Enter custom" in output or b"Select default" in output:
                        time.sleep(0.5) # Wait a bit for the rest of the menu to render
                        data = os.read(master, 4096)
                        output += data
                        break
            except OSError:
                break
                
        os.write(master, b'\x03') 
        process.terminate()
        os.close(master)
        
        text = output.decode('utf-8', errors='ignore')
        clean_text = re.sub(r'\x1b\[.*?m', '', text) # Strip ANSI
        
        # Aggressive Regex: find anything that looks like a known model family
        found_models = set()
        for match in re.finditer(r'(gemini|claude|gpt|o1|o3|deepseek)[a-zA-Z0-9\-\.]+', clean_text.lower()):
            found_models.add(match.group(0))
            
        # Try to find the active model (usually indicated by * or > in the CLI)
        for line in clean_text.splitlines():
            line = line.strip()
            if line.startswith('*') or line.startswith('>'):
                parts = line.replace('*', '').replace('>', '').split()
                for p in parts:
                    if any(x in p.lower() for x in ['gemini', 'claude', 'gpt', 'o1', 'o3', 'deepseek']):
                        active_model = p
                        found_models.add(p)
                        break
            
        for m in found_models:
            models.append({"id": m, "label": m.replace("-", " ").title()})
            
        if not models and active_model != "hermes-agent":
            models.append({"id": active_model, "label": active_model.title()})
            
        return {
            "active_provider": "proxy-fallback",
            "default_model": active_model,
            "data": models,
            "debug_output": clean_text[:500] if not models else None
        }
    except Exception as e:
        return {"error": str(e), "data": []}

class HermesProxyHandler(BaseHTTPRequestHandler):
    def handle(self):
        try:
            super().handle()
        except (ConnectionResetError, BrokenPipeError):
            pass # Client disconnected early, ignore

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
        self.end_headers()

    def do_GET(self):
        if self.path == '/api/models':
            print("Fetching models via hermes CLI...")
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
        # Mute standard access logging
        return

def run():
    # Allow port to be configured via environment variable
    port = int(os.environ.get('HERMES_PROXY_PORT', 8643))
    server_address = ('0.0.0.0', port)
    
    try:
        httpd = HTTPServer(server_address, HermesProxyHandler)
        print(f'Starting Hermes Models Proxy on port {port}...')
        print(f'Listening for GET requests on http://0.0.0.0:{port}/api/models')
        httpd.serve_forever()
    except OSError as e:
        print(f"Error starting server on port {port}: {e}")
        print("Ensure the port is available.")

if __name__ == '__main__':
    run()
