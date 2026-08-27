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
WORKDIR /app

COPY package.json ./
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./static
COPY --from=build /app/dist-server ./dist-server
RUN mkdir -p /app/data \
    && chown -R 10001:10001 /app

USER 10001:10001
EXPOSE 8643
CMD ["node", "/app/dist-server/index.js"]
