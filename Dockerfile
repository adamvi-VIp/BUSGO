# Main Dockerfile - Builds the frontend by default
# This is for build systems that expect a single Dockerfile

FROM node:18-alpine AS builder

# Set timezone to Prague
ENV TZ=Europe/Prague
RUN ln -snf /usr/share/zoneinfo/$TZ /etc/localtime && echo $TZ > /etc/timezone

WORKDIR /app

# Copy package files
COPY busgo/package*.json ./

# Install dependencies (including dev dependencies needed for build)
RUN npm ci

# Copy source code
COPY busgo/ .

# Public browser key only; never pass PID_API_KEY as a build argument.
ARG VITE_CARTO_API_KEY

# Build the app
RUN npm run build

# Production stage
FROM nginx:alpine

# Set timezone to Prague
ENV TZ=Europe/Prague
RUN ln -snf /usr/share/zoneinfo/$TZ /etc/localtime && echo $TZ > /etc/timezone

# Copy built app from builder stage
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy standalone nginx configuration (no backend dependency)
COPY nginx.standalone.conf /etc/nginx/nginx.conf

# Expose port 80
EXPOSE 80

CMD ["nginx", "-g", "daemon off;"] 