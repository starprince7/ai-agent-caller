# syntax=docker/dockerfile:1
FROM node:20-slim AS base

# Install system dependencies required for LiveKit agents
RUN apt-get update -qq && apt-get install --no-install-recommends -y \
    ca-certificates \
    python3 \
    python3-pip \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Enable yarn (comes pre-installed with Node.js)
RUN corepack enable

# ---- Dependencies Stage ----
FROM base AS deps
COPY package.json yarn.lock ./
RUN --mount=type=cache,id=yarn,target=/usr/local/share/.cache/yarn \
    yarn install --frozen-lockfile --production=false

# ---- Build Stage ----
FROM base AS build
COPY . .
COPY --from=deps /app/node_modules ./node_modules

# Build the TypeScript project
RUN yarn build

# Prune dev dependencies for production
RUN yarn install --frozen-lockfile --production=true --ignore-scripts && yarn cache clean

# ---- Production Stage ----
FROM base AS production

# Create non-root user for security
RUN groupadd --gid 1001 --system nodejs && \
    useradd --uid 1001 --system --gid nodejs --create-home --shell /bin/bash nodejs

# Copy package files
COPY package.json yarn.lock ./

# Install only production dependencies
RUN --mount=type=cache,id=yarn,target=/usr/local/share/.cache/yarn \
    yarn install --frozen-lockfile --production=true --ignore-scripts

# Copy built application and cleaned node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/node_modules ./node_modules

# Set ownership to nodejs user
RUN chown -R nodejs:nodejs /app

# Switch to non-root user
USER nodejs

# Environment variables
ENV NODE_ENV=production
ENV NODE_OPTIONS="--enable-source-maps"

# Health check for the agent
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD node -e "process.exit(0)" || exit 1

# LiveKit agents typically don't expose HTTP ports, but if yours does, uncomment:
# EXPOSE 8080

# Start the agent
CMD ["node", "./dist/agent.js"]