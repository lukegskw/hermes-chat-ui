# The UI is intentionally not derived from the Hermes image.  Hermes runs in
# its own official container; this image contains only the SPA, BFF, and Push.
FROM node:24-alpine@sha256:e67514e5d0f6c46656005e1b693b2ec9d52e80b641307de684d4a015ba7a4eaf AS base
ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN corepack enable

FROM base AS prod-deps
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --prod --frozen-lockfile --ignore-scripts

FROM base AS build
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --ignore-scripts
COPY . .
RUN pnpm run build

FROM node:24-alpine@sha256:e67514e5d0f6c46656005e1b693b2ec9d52e80b641307de684d4a015ba7a4eaf
ENV NODE_ENV=production \
    HERMES_STATIC_DIR=/app/static \
    HERMES_UI_DATA_DIR=/app/data \
    HERMES_UI_HERMES_CONFIG=/hermes-config/config.yaml \
    HERMES_PROXY_PORT=8643
LABEL org.opencontainers.image.source="https://github.com/lukegskw/hermes-chat-ui" \
      org.opencontainers.image.description="Self-hosted phone and browser client for Hermes Agent" \
      org.opencontainers.image.licenses="MIT"
WORKDIR /app

COPY package.json ./
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./static
COPY --from=build /app/dist-server ./dist-server
RUN mkdir -p /app/data \
    && chown -R 10001:10001 /app

USER 10001:10001
EXPOSE 8643
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:8643/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
CMD ["node", "/app/dist-server/index.js"]
