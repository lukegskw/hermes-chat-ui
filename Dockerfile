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

# Install Python dependencies for the proxy
RUN pip install fastapi uvicorn aiohttp pyyaml

# Copy built SPA
COPY --from=build /app/dist /app/static/

# Copy proxy server
COPY hermes_proxy.py /app/hermes_proxy.py
COPY entrypoint.unified.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh

EXPOSE 8643

ENTRYPOINT ["/app/entrypoint.sh"]
