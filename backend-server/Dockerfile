# ─── Build stage ──────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app/backend-server

# Copy package files and install all dependencies (including dev for build)
COPY backend-server/package*.json ./
RUN npm ci

# Copy shared folder at the correct relative path (tsconfig rootDir is "../")
COPY shared/ /app/shared/

# Copy backend source and tsconfig
COPY backend-server/tsconfig.json ./
COPY backend-server/src/ ./src/

# Build TypeScript
RUN npm run build

# ─── Production stage ─────────────────────────────────────────────────────
FROM node:20-alpine AS runner

WORKDIR /app/backend-server

# Install production dependencies only
COPY backend-server/package*.json ./
RUN npm ci --omit=dev

# Copy compiled output (dist contains both backend-server/ and shared/ subdirs)
COPY --from=builder /app/backend-server/dist/ ./dist/

EXPOSE 3001

CMD ["node", "dist/backend-server/src/server.js"]
