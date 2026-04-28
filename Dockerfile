# ── Stage 1: Build ────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

# Native-module build tools (bcrypt, better-sqlite3)
RUN apk add --no-cache python3 make g++

WORKDIR /app

# 1. Copy dependency files trước
COPY package.json package-lock.json ./

# 2. Install deps (cache layer này rất quan trọng)
RUN npm ci

# 3. Copy source code
COPY tsconfig.json ./
COPY src ./src

# 4. Build
RUN npm run build

# ── Stage 2: Production ────────────────────────────────────────────────────────
FROM node:20-alpine AS production

# Same build tools needed to install native production deps
RUN apk add --no-cache python3 make g++

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

# Copy compiled output from builder
COPY --from=builder /app/dist ./dist

# HuggingFace Spaces requires port 7860
ENV NODE_ENV=production \
    PORT=7860

EXPOSE 7860

# Run as non-root for security
USER node

CMD ["node", "dist/server.js"]
