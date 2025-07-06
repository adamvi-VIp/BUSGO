#!/bin/bash

echo "🚌 Starting HopGo Application..."

# Check if we're in production mode
if [ "$NODE_ENV" = "production" ]; then
    echo "📦 Production mode - serving built frontend with backend"
    
    # Check if public directory exists and has files
    if [ -d "/app/public" ] && [ "$(ls -A /app/public)" ]; then
        echo "✅ Frontend files found in /app/public"
        ls -la /app/public/
    else
        echo "❌ Frontend files not found in /app/public"
        echo "Contents of /app:"
        ls -la /app/
    fi
    
    # Start the backend server (which also serves frontend)
    echo "🚀 Starting backend server..."
    exec node server/server.js
else
    echo "🔧 Development mode - starting both frontend and backend"
    
    # In development, you might want to start both separately
    # For now, just start the backend
    exec node server/server.js
fi 