# Multi-stage build for production
FROM node:18-alpine AS base

# Install timezone data for Czech timezone support
RUN apk add --no-cache tzdata

# Install dependencies only when needed
FROM base AS deps
# Check https://github.com/nodejs/docker-node/tree/b4117f9333da4138b03a546ec926ef50a31506c3#nodealpine to understand why libc6-compat might be needed.
RUN apk add --no-cache libc6-compat
WORKDIR /app

# Copy package files
COPY busgo/package*.json ./
COPY server/package*.json ./server/

# Install frontend dependencies (including dev dependencies for build)
RUN npm ci --ignore-scripts

# Install backend dependencies
WORKDIR /app/server
RUN npm ci --only=production --ignore-scripts

# Rebuild the source code only when needed
FROM base AS builder
WORKDIR /app

# Copy dependencies
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/server/node_modules ./server/node_modules

# Copy source code
COPY busgo/ ./busgo/
COPY server/ ./server/

# Build the frontend
WORKDIR /app/busgo
RUN npm run build

# Production image, copy all the files and run the app
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3001
ENV TZ=Europe/Prague

# Create a non-root user
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy built frontend
COPY --from=builder --chown=nextjs:nodejs /app/busgo/dist ./public

# Copy backend
COPY --from=builder --chown=nextjs:nodejs /app/server ./server
COPY --from=builder --chown=nextjs:nodejs /app/server/node_modules ./server/node_modules

# Copy environment file if it exists
COPY .env* ./server/

# Switch to non-root user
USER nextjs

# Expose port
EXPOSE 3001

# Start the backend server
CMD ["node", "server/server.js"] 