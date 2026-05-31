# Hermes Chat UI

Hermes Chat UI is a React/Vite Progressive Web App (PWA) designed as a frontend interface for the Hermes AI Agent.

## Architecture & Deployment Modes

This repository provides two deployment modes using Docker:

### 1. Unified Image (Recommended)

This is the default `Dockerfile`. It builds a single image based on `nousresearch/hermes-agent`, containing:

- The native Hermes Agent core.
- A FastAPI proxy (`hermes_proxy.py`) that serves the compiled React SPA and augments the API (e.g., model extraction, context compression).
- Runs on port `8643`.

**To build & run:**

```bash
docker compose up -d --build
```

You can update the underlying Hermes Agent version via build arguments:

```bash
docker build --build-arg HERMES_AGENT_VERSION=latest -t hermes-chat-ui .
```

### 2. Standalone Frontend Image

If you want to run the UI completely separated from the Hermes Agent backend, you can use `Dockerfile.standalone`. This builds an Nginx image that serves only the static React files.

**To build:**

```bash
docker build -f Dockerfile.standalone -t hermes-chat-ui-standalone .
```

## Local Development

For local frontend development:

1. Copy `.env.example` to `.env` (or configure your `.env` with the URL of a running Hermes Agent).
2. Install dependencies: `pnpm install`
3. Run the dev server: `pnpm run dev`

The local UI will automatically read the `.env` configuration to proxy requests to your development backend.
