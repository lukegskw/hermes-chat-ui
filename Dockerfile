FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM python:3.11-slim AS production
WORKDIR /app

# Install Python dependencies (including pywebpush for push notifications)
RUN pip install --no-cache-dir fastapi uvicorn pywebpush httpx

# Copy built frontend from builder
COPY --from=builder /app/dist ./dist

# Copy backend code
COPY backend ./backend

# Copy entrypoint
COPY entrypoint.sh ./entrypoint.sh
RUN chmod +x ./entrypoint.sh

EXPOSE 8643

ENTRYPOINT ["./entrypoint.sh"]
