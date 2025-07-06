#!/bin/bash

# BusGo Docker Deployment Script
# This script builds and runs the BusGo application in production mode

set -e

echo "🚌 Starting BusGo deployment..."

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

# Check if .env file exists
if [ ! -f .env ]; then
    echo "⚠️  .env file not found. Creating from template..."
    cat > .env << EOF
NODE_ENV=production
PORT=3001
TZ=Europe/Prague
PID_API_KEY=your_api_key_here
EOF
    echo "📝 Please edit .env file and add your PID API key from https://api.golemio.cz/"
    echo "   Then run this script again."
    exit 1
fi

# Check if PID_API_KEY is set
if ! grep -q "PID_API_KEY=" .env || grep -q "PID_API_KEY=your_api_key_here" .env; then
    echo "❌ PID_API_KEY not set in .env file."
    echo "   Please add your PID API key from https://api.golemio.cz/"
    exit 1
fi

echo "🔧 Building and starting containers..."

# Stop existing containers
docker-compose down

# Build and start containers
docker-compose up --build -d

# Wait for containers to be ready
echo "⏳ Waiting for services to start..."
sleep 10

# Check if containers are running
if docker-compose ps | grep -q "Up"; then
    echo "✅ BusGo is now running!"
    echo "🌐 Frontend: http://localhost"
    echo "🔧 Backend: http://localhost:3001"
    echo ""
    echo "📊 View logs: docker-compose logs -f"
    echo "🛑 Stop services: docker-compose down"
else
    echo "❌ Failed to start containers. Check logs:"
    docker-compose logs
    exit 1
fi 