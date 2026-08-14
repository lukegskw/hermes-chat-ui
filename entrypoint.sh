#!/bin/sh
set -eu

# This process is the browser-facing UI/BFF only.  It never starts, supervises,
# configures, or writes to Hermes Agent.
exec uvicorn backend.main:app \
  --host 0.0.0.0 \
  --port "${HERMES_PROXY_PORT:-8643}"
