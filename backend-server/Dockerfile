# ─── Build stage ──────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app/backend-server

# Install backend dependencies using backend lockfile only
COPY backend-server/package*.json ./
RUN npm ci

# Copy shared folder and backend source
COPY shared/ /app/shared/
COPY backend-server/tsconfig.json ./
COPY backend-server/src/ ./src/

RUN npm run build

# ─── Production stage ─────────────────────────────────────────────────────
FROM node:20-alpine AS runner

WORKDIR /app/backend-server

# Install backend production dependencies only
COPY backend-server/package*.json ./
RUN npm ci --omit=dev

# Copy compiled output from builder
COPY --from=builder /app/backend-server/dist/ ./dist/

EXPOSE 3001

CMD ["node", "dist/backend-server/src/server.js"]
