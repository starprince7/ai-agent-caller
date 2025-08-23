# syntax=docker/dockerfile:1
FROM node:20-slim AS base

# Install system dependencies in one layer
RUN apt-get update -qq && apt-get install --no-install-recommends -y \
    ca-certificates \
    python3 \
    python3-pip \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install pnpm
RUN npm install -g pnpm@9.15.9

# ---- Build Stage ----
FROM base AS build

# Copy dependency files first for better caching
COPY package.json pnpm-lock.yaml ./

# Install dependencies with frozen lockfile
RUN pnpm install --frozen-lockfile

# Copy source and build
COPY --link . .
RUN pnpm build

# Clean up dev dependencies
RUN pnpm prune --production

# ---- Production Stage ----
FROM base AS production

# Create non-root user
RUN groupadd --gid 1001 --system nodejs && \
    useradd --uid 1001 --system --gid nodejs nodejs

# Copy built application and production dependencies from build stage
COPY --from=build --chown=nodejs:nodejs /app/dist ./dist
COPY --from=build --chown=nodejs:nodejs /app/node_modules ./node_modules
COPY --from=build --chown=nodejs:nodejs /app/package.json ./package.json

# Copy SSL certificates for secure connections
COPY --from=build /etc/ssl/certs /etc/ssl/certs

# Switch to non-root user
USER nodejs

# Set production environment
ENV NODE_ENV=production

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD node -e "process.exit(0)" || exit 1

# Expose port (uncomment if needed)
# EXPOSE 8080

# Start the agent
CMD ["node", "./dist/agent.js"]