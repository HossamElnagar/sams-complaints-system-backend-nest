# ==============================================================================
# SAMS Academic Complaints Portal - Backend Service (NestJS)
# Production Multi-Stage Dockerfile
# ==============================================================================

# Stage 1: Build stage
FROM node:22-alpine AS builder

WORKDIR /app

# Copy dependency definitions
COPY package.json package-lock.json ./

# Install all dependencies (including devDependencies needed for build)
RUN npm ci

# Copy application source and build configurations
COPY tsconfig.json tsconfig.build.json nest-cli.json vitest.config.ts vitest.config.e2e.ts ./
COPY src ./src

# Compile NestJS application to /app/dist
RUN npm run build

# Stage 2: Production runtime stage
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=5000

# Install production dependencies only
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Copy compiled JavaScript output from builder stage
COPY --from=builder /app/dist ./dist

# Use non-root node user for hardened security
USER node

EXPOSE 5000

# Zero-cost native healthcheck using Alpine's built-in wget
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:5000/health || exit 1

# Launch production server
CMD ["node", "dist/main.js"]
