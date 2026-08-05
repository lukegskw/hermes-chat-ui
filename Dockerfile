# Define arguments before any FROM statement so they can be used in FROM directives
ARG HERMES_AGENT_VERSION=latest@sha256:a0e0bb479ad038782614bf57651c0f250aaecd93bc345114a52704adce517ede

# Stage 1: Build the SPA
FROM node:24-alpine@sha256:f70403e87646dc51b45295f4b8b70cdad0b63d2297c4c9899119b03f7af7a6b3 AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci --ignore-scripts
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
RUN uv pip install -r backend/requirements.txt

COPY backend /app/backend
COPY entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh

# Config injection script — runs BEFORE s6 services (dashboard, gateway) start
COPY scripts/00-inject-config /etc/cont-init.d/00-inject-config
RUN chmod +x /etc/cont-init.d/00-inject-config

EXPOSE 8643 9119

CMD ["/app/entrypoint.sh"]
