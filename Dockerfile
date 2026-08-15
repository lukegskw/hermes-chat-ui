# The UI is intentionally not derived from the Hermes image.  Hermes runs in
# its own official container; this image contains only the SPA, BFF, and Push.
FROM node:24-alpine@sha256:f70403e87646dc51b45295f4b8b70cdad0b63d2297c4c9899119b03f7af7a6b3 AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci --ignore-scripts
COPY . .
RUN npm run build

FROM python:3.13-slim
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_ROOT_USER_ACTION=ignore \
    HERMES_STATIC_DIR=/app/static \
    HERMES_UI_DATA_DIR=/app/data \
    HERMES_UI_HERMES_CONFIG=/hermes-config/config.yaml \
    HERMES_PROXY_PORT=8643
WORKDIR /app

COPY backend/requirements.txt ./backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt

COPY backend ./backend
COPY --from=build /app/dist ./static
COPY entrypoint.sh ./entrypoint.sh
RUN useradd --system --uid 10001 --create-home hermes-ui \
    && mkdir -p /app/data \
    && chown -R hermes-ui:hermes-ui /app \
    && chmod +x ./entrypoint.sh

USER hermes-ui
EXPOSE 8643
CMD ["/app/entrypoint.sh"]
