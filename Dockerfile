# Define arguments before any FROM statement so they can be used in FROM directives
ARG HERMES_AGENT_VERSION=latest

# Stage 1: Build the SPA
FROM node:20-alpine AS build
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

EXPOSE 8643

CMD ["/app/entrypoint.sh"]
