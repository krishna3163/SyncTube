# ==============================================================================
# SyncTube Production Dockerfile
# Optimized for Render, Fly.io, Railway, or standalone Docker environments.
# ==============================================================================

# Stage 1: Build stage
FROM node:22-bookworm-slim AS builder
WORKDIR /app
COPY package*.json ./
COPY server/package*.json ./server/
COPY client/package*.json ./client/
COPY extension/package*.json ./extension/
RUN npm ci
COPY server/ ./server/
COPY client/ ./client/
COPY extension/ ./extension/
RUN npm run build:server && npm run build:client && npm run build:extension

# Stage 2: Production runtime stage
FROM node:22-bookworm-slim
# Install system dependencies required for production
RUN apt-get update && apt-get install -y --no-install-recommends \
    chromium \
    fonts-liberation \
    fonts-noto-color-emoji \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libatspi2.0-0 \
    libcairo2 \
    libcups2 \
    libdbus-1-3 \
    libdrm2 \
    libgbm1 \
    libglib2.0-0 \
    libnspr4 \
    libnss3 \
    libpango-1.0-0 \
    libx11-6 \
    libx11-xcb1 \
    libxcb1 \
    libxcomposite1 \
    libxcursor1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxi6 \
    libxrandr2 \
    libxrender1 \
    libxss1 \
    libxtst6 \
    xdg-utils \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Configure environment for production
ENV CHROMIUM_PATH=/usr/bin/chromium
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
ENV NODE_ENV=production
ENV PORT=10000

# Copy workspace package manifests
COPY package*.json ./
COPY server/package*.json ./server/
COPY client/package*.json ./client/
COPY extension/package*.json ./extension/

# Install production dependencies for all workspaces
RUN npm ci --omit=dev

# Copy server code and pre-built artifacts from builder
COPY server/ ./server/
COPY --from=builder /app/server/dist ./server/dist
COPY --from=builder /app/client/dist ./client/dist

# Create non-root node user with temp directory access
RUN mkdir -p /tmp/synctube-tb && chown -R node:node /app /tmp/synctube-tb

USER node

EXPOSE 10000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://localhost:10000/health').then(r => r.ok ? process.exit(0) : process.exit(1)).catch(() => process.exit(1))"

CMD ["npm", "run", "start", "-w", "server"]
