@echo off
echo 🚌 Starting HopGo Application...

REM Check if we're in production mode
if "%NODE_ENV%"=="production" (
    echo 📦 Production mode - serving built frontend with backend
    
    REM Check if public directory exists and has files
    if exist "/app/public" (
        echo ✅ Frontend files found in /app/public
        dir /app/public
    ) else (
        echo ❌ Frontend files not found in /app/public
        echo Contents of /app:
        dir /app
    )
    
    REM Start the backend server (which also serves frontend)
    echo 🚀 Starting backend server...
    node server/server.js
) else (
    echo 🔧 Development mode - starting both frontend and backend
    
    REM In development, you might want to start both separately
    REM For now, just start the backend
    node server/server.js
) 