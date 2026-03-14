# ─── Build stage ──────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Copy root workspace files
COPY package*.json ./
COPY backend-server/package*.json ./backend-server/

# Install all workspace dependencies
RUN npm ci

# Copy source and compile
COPY backend-server/tsconfig.json ./backend-server/
COPY backend-server/src/ ./backend-server/src/

WORKDIR /app/backend-server
RUN npm run build

# ─── Production stage ─────────────────────────────────────────────────────
FROM node:20-alpine AS runner

WORKDIR /app

# Copy root workspace files and install production deps
COPY package*.json ./
COPY backend-server/package*.json ./backend-server/
RUN npm ci --omit=dev --workspace=backend-server

# Copy compiled output from builder
COPY --from=builder /app/backend-server/dist/ ./backend-server/dist/

WORKDIR /app/backend-server

EXPOSE 3001

CMD ["node", "dist/backend-server/src/server.js"]
