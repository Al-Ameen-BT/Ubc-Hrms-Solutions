# syntax=docker/dockerfile:1
# Multi-stage rootless Containerfile / Dockerfile for Podman (Protocol 7: Rootless minimal image)

# ----------------------------------------------------
# Stage 1: Build the React Console Frontend
# ----------------------------------------------------
FROM docker.io/library/node:20-alpine AS frontend-builder
WORKDIR /build/frontend

COPY frontend/package*.json ./
RUN npm ci

COPY frontend/ ./
RUN npm run build

# ----------------------------------------------------
# Stage 2: Production Dependencies
# ----------------------------------------------------
FROM docker.io/library/node:20-alpine AS deps
WORKDIR /build

COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# ----------------------------------------------------
# Stage 3: Minimal Rootless Runner
# ----------------------------------------------------
FROM docker.io/library/node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

# Install runtime utilities for container health checks
RUN apk add --no-cache wget

# Copy production node_modules and code
COPY --from=deps --chown=node:node /build/node_modules ./node_modules
COPY --from=frontend-builder --chown=node:node /build/frontend/dist ./frontend/dist
COPY --chown=node:node package*.json ./
COPY --chown=node:node src/ ./src/
COPY --chown=node:node public/ ./public/

# Run strictly as unprivileged non-root user (USER node has uid 1000 on alpine)
USER node

EXPOSE 3000

# Standardized liveness check (Protocol 56 & 57)
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3000/healthz || exit 1

CMD ["node", "src/server.js"]
