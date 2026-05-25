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
    """Run `hermes model` via pty, capture output, and parse the models."""
    try:
        master, slave = pty.openpty()
        
        # We run hermes model in a pty so it thinks it has an interactive terminal
        # and prints the inquirer menu with the models list.
        process = subprocess.Popen(
            ['hermes', 'model'],
            stdin=slave,
            stdout=slave,
            stderr=slave,
            close_fds=True,
            env=os.environ.copy()
        )
        os.close(slave)
        
        output = b""
        start_time = time.time()
        
        # Read until we see the end of the prompt or timeout after 5 seconds
        while time.time() - start_time < 5.0:
            try:
                # Use os.read with a non-blocking approach if needed, but simple read usually works
                # Since we want to avoid blocking forever, we'll use a short timeout via select
                import select
                r, _, _ = select.select([master], [], [], 0.5)
                if r:
                    data = os.read(master, 1024)
                    if not data:
                        break
                    output += data
                    # Break early if we see the last option of the menu
                    if b"Skip (keep current)" in output or b"Enter custom model name" in output:
                        break
            except OSError:
                break
                
        # Send Ctrl+C to abort the interactive prompt safely
        os.write(master, b'\x03') 
        
        process.terminate()
        try:
            process.wait(timeout=1)
        except subprocess.TimeoutExpired:
            process.kill()
            
        os.close(master)
        
        text = output.decode('utf-8', errors='ignore')
        
        # Parse the text output
        # Output example:
        # Current model:    gemini-3-flash-preview
        # Active provider:  github-copilot
        # ...
        # ->  gemini-3-flash-preview  <- currently in use
        #     claude-opus-4.7
        
        active_model = "hermes-agent"
        models = []
        
        in_list = False
        for line in text.split('\n'):
            line = line.strip('\r\n')
            
            # Extract active model
            if line.startswith('Current model:'):
                parts = line.split(':', 1)
                if len(parts) > 1:
                    active_model = parts[1].strip()
                    
            # Start of the model list menu
            if 'Select default model:' in line:
                in_list = True
                continue
                
            if in_list:
                # Stop parsing if we hit these typical inquirer footers
                if 'Enter custom model name' in line or 'Skip' in line or 'Answer:' in line:
                    break
                    
                # A model line starts with '-> ' (selected) or '   ' (unselected)
                # Note: there might be ANSI escape codes for colors, so we strip them
                clean_line = re.sub(r'\x1b\[.*?m', '', line)
                
                # Check if it looks like a list item
                if clean_line.startswith('-> ') or clean_line.startswith('   ') or clean_line.startswith('\u276f '): # \u276f is the arrow
                    # Clean up prefix and suffix
                    model_str = clean_line.replace('->', '').replace('\u276f', '').strip()
                    
                    # Remove " <- currently in use" suffix if present
                    if '<- currently in use' in model_str:
                        model_str = model_str.split('<-')[0].strip()
                        
                    # If there's still a space, just take the first word (the model ID)
                    model_id = model_str.split(' ')[0].strip()
                    
                    if model_id and model_id not in ['Enter', 'Skip']:
                        # Create a nice label
                        label = model_id.replace('-', ' ').title()
                        label = label.replace('Gpt', 'GPT')
                        models.append({"id": model_id, "label": label})
        
        # Ensure the list is unique and has the active model
        unique_models = []
        seen = set()
        for m in models:
            if m["id"] not in seen:
                seen.add(m["id"])
                unique_models.append(m)
                
        # If we failed to parse but got the active model, at least return that
        if not unique_models and active_model != "hermes-agent":
            unique_models.append({"id": active_model, "label": active_model.title()})
            
        return {
            "active_provider": "proxy",
            "default_model": active_model,
            "data": unique_models
        }
    except Exception as e:
        print(f"Error extracting models: {e}")
        return {
            "error": str(e),
            "data": []
        }

class HermesProxyHandler(BaseHTTPRequestHandler):
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
