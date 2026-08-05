# Define arguments before any FROM statement so they can be used in FROM directives
ARG HERMES_AGENT_VERSION=latest@sha256:728b068f9fd6dee95beb1b057c4f332ef7eac3a8f8925d0dc725939b7a0c335a

# Stage 1: Build the SPA
FROM node:24-alpine@sha256:d32cdf619f63fe0471182d08996dd516c6275bb5fd31ae06e55a570bd9e1ad43 AS build
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

# Stage 2: Unified image based on hermes-agent
FROM nousresearch/hermes-agent:${HERMES_AGENT_VERSION}

# Set PATH to use the agent's virtual environment
ENV PATH="/opt/hermes/.venv/bin:$PATH"

# Copy built SPA
COPY --from=build /app/dist /app/static/

# Install python backend dependencies
COPY backend/requirements.txt ./backend/
# Try pip first, if not found try uv pip, if not try installing pip, etc.
RUN (pip install --no-cache-dir -r backend/requirements.txt && pip install --no-cache-dir pywebpush cryptography) || \
    (python -m pip install --no-cache-dir -r backend/requirements.txt && python -m pip install --no-cache-dir pywebpush cryptography) || \
    (uv pip install -r backend/requirements.txt && uv pip install pywebpush cryptography) || \
    (apt-get update && apt-get install -y python3-pip && pip3 install --no-cache-dir -r backend/requirements.txt pywebpush cryptography)

COPY backend /app/backend
COPY entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh

# Config injection script — runs BEFORE s6 services (dashboard, gateway) start
COPY scripts/00-inject-config /etc/cont-init.d/00-inject-config
RUN chmod +x /etc/cont-init.d/00-inject-config

EXPOSE 8643 9119

CMD ["/app/entrypoint.sh"]
