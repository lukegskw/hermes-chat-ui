# The UI is intentionally not derived from the Hermes image.  Hermes runs in
# its own official container; this image contains only the SPA, BFF, and Push.
FROM node:24-alpine@sha256:f70403e87646dc51b45295f4b8b70cdad0b63d2297c4c9899119b03f7af7a6b3 AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci --ignore-scripts
COPY . .
RUN npm run build

FROM node:24-alpine@sha256:f70403e87646dc51b45295f4b8b70cdad0b63d2297c4c9899119b03f7af7a6b3
ENV NODE_ENV=production \
    HERMES_STATIC_DIR=/app/static \
    HERMES_UI_DATA_DIR=/app/data \
    HERMES_UI_HERMES_CONFIG=/hermes-config/config.yaml \
    HERMES_PROXY_PORT=8643
WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev --ignore-scripts \
    && npm cache clean --force
COPY --from=build /app/dist ./static
COPY --from=build /app/dist-server ./dist-server
RUN mkdir -p /app/data \
    && chown -R 10001:10001 /app

USER 10001:10001
EXPOSE 8643
CMD ["node", "/app/dist-server/index.js"]
