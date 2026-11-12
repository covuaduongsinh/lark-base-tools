# ==============================================================================
# Multi-stage Dockerfile for Lark Base ETL Server (< 150MB on Node 22 Alpine)
# ==============================================================================

# --- Stage 1: Build & Bundle ---
FROM node:22-alpine AS builder

WORKDIR /app

# Enable pnpm via corepack
RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy workspace configurations
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.json ./
COPY packages/core ./packages/core
COPY packages/cli ./packages/cli
COPY packages/server ./packages/server

# Install all dependencies (including devDependencies for build)
RUN pnpm install

# Build all TypeScript packages
RUN pnpm run build

# Deploy isolated production bundle for @duongsinh/lark-base-server
RUN pnpm --filter @duongsinh/lark-base-server deploy /app/deploy --prod

# --- Stage 2: Ultra-lightweight Production Runner ---
FROM node:22-alpine AS runner

WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000 \
    HOST=0.0.0.0

# Copy production artifacts
COPY --from=builder /app/deploy/package.json ./package.json
COPY --from=builder /app/deploy/node_modules ./node_modules
COPY --from=builder /app/packages/server/dist ./dist
COPY --from=builder /app/packages/server/public ./public

# Use non-root node user for container security
USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:3000/api/health || exit 1

CMD ["node", "dist/index.js"]
