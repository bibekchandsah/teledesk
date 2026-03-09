# ─── Build stage ──────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files and install all deps (including devDeps for tsc)
COPY backend-server/package*.json ./backend-server/
COPY shared/ ./shared/

WORKDIR /app/backend-server
RUN npm ci

# Copy source and compile
COPY backend-server/tsconfig.json ./
COPY backend-server/src/ ./src/

RUN npm run build

# ─── Production stage ─────────────────────────────────────────────────────
FROM node:20-alpine AS runner

WORKDIR /app/backend-server

# Install only production deps
COPY backend-server/package*.json ./
RUN npm ci --omit=dev

# Copy compiled output from builder (rootDir is ../ so dist mirrors the monorepo structure)
COPY --from=builder /app/backend-server/dist/ ./dist/

EXPOSE 3001

CMD ["node", "dist/backend-server/src/server.js"]
