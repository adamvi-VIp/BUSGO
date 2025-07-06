#!/bin/bash

# HopGo Docker Deployment Script
# This script builds and runs the HopGo application in production mode

set -e

echo "🚌 Starting HopGo deployment..."

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo "❌ Docker is not installed. Please install Docker first."
    exit 1
fi

# Check if Docker Compose is installed
if ! command -v docker-compose &> /dev/null; then
    echo "❌ Docker Compose is not installed. Please install Docker Compose first."
    exit 1
fi

# Create .env file if it doesn't exist
if [ ! -f .env ]; then
    echo "📝 Creating .env file..."
    cat > .env << EOF
# Production Environment Variables
NODE_ENV=production
PORT=3001
TZ=Europe/Prague

# PID API Key (required for real-time data)
# Get your API key from: https://api.golemio.cz/
PID_API_KEY=your_api_key_here

# Optional: Custom domain
# DOMAIN=yourdomain.com
EOF
    echo "⚠️  Please edit .env file and add your PID API key!"
    echo "   Get your API key from: https://api.golemio.cz/"
    read -p "Press Enter after adding your API key..."
fi

# Stop existing containers
echo "🛑 Stopping existing containers..."
docker-compose down

# Build and start containers
echo "🔨 Building and starting containers..."
docker-compose up --build -d

# Wait for containers to be ready
echo "⏳ Waiting for containers to be ready..."
sleep 10

# Check container status
echo "📊 Container status:"
docker-compose ps

echo ""
echo "✅ HopGo is now running!"
echo ""
echo "🌐 Frontend: http://localhost"
echo "🔧 Backend: http://localhost:3001"
echo ""
echo "📝 Logs: docker-compose logs -f"
echo "🛑 Stop: docker-compose down"
echo ""
echo "⏰ Timezone: Europe/Prague (Czech Republic)"
echo "🚌 Real-time bus data from PID API" 