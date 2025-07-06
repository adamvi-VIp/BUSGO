#!/bin/bash

# HopGo Docker Deployment Script
echo "🚌 Deploying HopGo to Docker..."

# Check if .env file exists
if [ ! -f .env ]; then
    echo "❌ Error: .env file not found!"
    echo "Please create a .env file with your PID_API_KEY:"
    echo "PID_API_KEY=your_api_key_here"
    exit 1
fi

# Load environment variables
source .env

# Check if PID_API_KEY is set
if [ -z "$PID_API_KEY" ]; then
    echo "❌ Error: PID_API_KEY not found in .env file!"
    echo "Please add your PID API key to the .env file:"
    echo "PID_API_KEY=your_api_key_here"
    exit 1
fi

echo "✅ Environment variables loaded"

# Build and start the containers
echo "🔨 Building and starting containers..."
docker-compose up --build -d

# Wait for the container to be ready
echo "⏳ Waiting for the application to start..."
sleep 10

# Check if the application is running
if curl -f http://localhost:3001 > /dev/null 2>&1; then
    echo "✅ HopGo is running successfully!"
    echo "🌐 Open your browser and go to: http://localhost:3001"
    echo ""
    echo "📊 Container status:"
    docker-compose ps
else
    echo "❌ Application failed to start. Check logs with:"
    echo "docker-compose logs"
    exit 1
fi 