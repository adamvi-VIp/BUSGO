@echo off
REM HopGo Docker Deployment Script for Windows
echo 🚌 Deploying HopGo to Docker...

REM Check if .env file exists
if not exist .env (
    echo ❌ Error: .env file not found!
    echo Please create a .env file with your PID_API_KEY:
    echo PID_API_KEY=your_api_key_here
    pause
    exit /b 1
)

echo ✅ Environment file found

REM Build and start the containers
echo 🔨 Building and starting containers...
docker-compose up --build -d

REM Wait for the container to be ready
echo ⏳ Waiting for the application to start...
timeout /t 10 /nobreak > nul

REM Check if the application is running
curl -f http://localhost:3001 > nul 2>&1
if %errorlevel% equ 0 (
    echo ✅ HopGo is running successfully!
    echo 🌐 Open your browser and go to: http://localhost:3001
    echo.
    echo 📊 Container status:
    docker-compose ps
) else (
    echo ❌ Application failed to start. Check logs with:
    echo docker-compose logs
    pause
    exit /b 1
)

pause 