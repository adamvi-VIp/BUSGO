# HopGo Docker Deployment Guide

This guide will help you deploy the HopGo bus departure app using Docker in production mode.

## Prerequisites

1. **Docker & Docker Compose** installed on your system
2. **PID API Key** from [Golemio](https://api.golemio.cz/)
3. **Git** (to clone the repository)

## Quick Deployment

### 1. Clone the Repository
```bash
git clone <your-repo-url>
cd BUSGO
```

### 2. Create Environment File
Create a `.env` file in the root directory:
```bash
PID_API_KEY=your_api_key_here
```

### 3. Deploy with Docker Compose

**On Windows:**
```bash
deploy.bat
```

**On Linux/Mac:**
```bash
./deploy.sh
```

**Manual deployment:**
```bash
docker-compose up --build -d
```

### 4. Access the Application
Open your browser and go to: `http://localhost:3001`

## Manual Deployment Steps

If you prefer to deploy manually:

### 1. Build the Docker Image
```bash
docker build -t hopgo .
```

### 2. Run the Container
```bash
docker run -d \
  --name hopgo \
  -p 3001:3001 \
  -e NODE_ENV=production \
  -e PID_API_KEY=your_api_key_here \
  hopgo
```

## Production Configuration

### Environment Variables
- `NODE_ENV=production` - Runs in production mode
- `PORT=3001` - Server port (default: 3001)
- `PID_API_KEY` - Your Golemio API key (required)
- `TZ=Europe/Prague` - Czech timezone for accurate local time

### Docker Compose Configuration
The `docker-compose.yml` includes:
- **Health checks** - Monitors application health
- **Auto-restart** - Restarts on failure
- **Port mapping** - Maps container port 3001 to host port 3001
- **Environment variables** - Passes configuration to the container

## Monitoring & Logs

### View Logs
```bash
docker-compose logs -f
```

### Check Container Status
```bash
docker-compose ps
```

### Health Check
```bash
curl http://localhost:3001
```

## Troubleshooting

### Common Issues

1. **API Key Missing**
   - Ensure your `.env` file contains `PID_API_KEY=your_key`
   - Restart the container after adding the key

2. **Port Already in Use**
   - Change the port in `docker-compose.yml`:
   ```yaml
   ports:
     - "3002:3001"  # Use port 3002 instead
   ```

3. **Build Failures**
   - Clear Docker cache: `docker system prune -a`
   - Rebuild: `docker-compose build --no-cache`

4. **Application Not Starting**
   - Check logs: `docker-compose logs`
   - Verify API key is correct
   - Ensure port 3001 is available

5. **Timezone Issues**
   - Verify timezone: `docker exec hopgo date`
   - Should show Czech time (CET/CEST)
   - Check environment: `docker exec hopgo env | grep TZ`

### Performance Optimization

For production deployments, consider:

1. **Reverse Proxy** (Nginx/Traefik)
2. **Load Balancer** for high traffic
3. **SSL/TLS** certificates
4. **Database** for caching (Redis)
5. **Monitoring** (Prometheus/Grafana)

## Security Considerations

1. **API Key Security**
   - Never commit API keys to version control
   - Use Docker secrets for sensitive data
   - Rotate API keys regularly

2. **Network Security**
   - Use HTTPS in production
   - Configure firewall rules
   - Limit container network access

3. **Container Security**
   - Run as non-root user (already configured)
   - Keep base images updated
   - Scan for vulnerabilities

## Scaling

To scale the application:

```bash
# Scale to multiple instances
docker-compose up --scale hopgo=3 -d

# Use with load balancer
docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

## Updates

To update the application:

```bash
# Pull latest changes
git pull

# Rebuild and restart
docker-compose up --build -d
```

## Support

For issues or questions:
1. Check the logs: `docker-compose logs`
2. Verify configuration
3. Test API connectivity
4. Review this deployment guide 