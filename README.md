# 🚌 HopGo - Real-time Bus Departures

A modern, real-time bus departure application for Prague, Czech Republic. Built with React, Node.js, and Socket.IO.

## 🌟 Features

- **Real-time departures** from PID API
- **Interactive map** with Leaflet
- **Location-based search** for nearby stations
- **Map movement tracking** - automatically fetches stops for new areas
- **Modern UI** with dark theme and smooth animations
- **Mobile-responsive** design
- **Prague timezone** support
- **Air conditioning indicators**
- **Delay tracking** with color coding

## 🚀 Quick Deployment

### Prerequisites

- Docker
- Docker Compose
- PID API Key (get from https://api.golemio.cz/)

### 1. Clone and Setup

```bash
git clone <your-repo-url>
cd BUSGO
```

### 2. Configure Environment

Edit the `.env` file and add your PID API key:

```env
NODE_ENV=production
PORT=3001
TZ=Europe/Prague
PID_API_KEY=your_api_key_here
```

### 3. Deploy

```bash
# Make deploy script executable
chmod +x deploy.sh

# Run deployment
./deploy.sh
```

Or manually:

```bash
docker-compose up --build -d
```

### 4. Access the Application

- **Frontend**: http://localhost
- **Backend**: http://localhost:3001

## 🐳 Docker Architecture

```
┌─────────────────┐    ┌─────────────────┐
│   Frontend      │    │    Backend      │
│   (Nginx)       │◄──►│   (Node.js)     │
│   Port: 80      │    │   Port: 3001    │
└─────────────────┘    └─────────────────┘
         │                       │
         │                       │
         ▼                       ▼
   ┌─────────────────────────────────────┐
   │         Busgo Network              │
   └─────────────────────────────────────┘
```

## 📁 Project Structure

```
BUSGO/
├── busgo/                 # Frontend (React + Vite)
│   ├── src/
│   │   ├── components/    # React components
│   │   ├── assets/        # Icons and images
│   │   └── App.jsx        # Main app component
│   └── package.json
├── server/                # Backend (Node.js + Socket.IO)
│   ├── server.js          # Main server file
│   └── package.json
├── Dockerfile.frontend    # Frontend Docker image
├── Dockerfile.backend     # Backend Docker image
├── docker-compose.yml     # Multi-container setup
├── nginx.conf            # Nginx configuration
└── deploy.sh             # Deployment script
```

## 🔧 Development

### Frontend Development

```bash
cd busgo
npm install
npm run dev
```

### Backend Development

```bash
cd server
npm install
npm start
```

## 🌍 Production Features

- **Timezone**: Europe/Prague (Czech Republic)
- **Gzip compression** for faster loading
- **Static asset caching** (1 year)
- **WebSocket proxy** for real-time updates
- **Automatic restarts** on failure
- **Health checks** and logging

## 📊 API Integration

- **PID API**: Real-time bus departures
- **Socket.IO**: Real-time communication
- **Leaflet**: Interactive maps
- **Vite**: Fast development and building

## 🛠️ Management Commands

```bash
# View logs
docker-compose logs -f

# Stop services
docker-compose down

# Restart services
docker-compose restart

# Update and rebuild
docker-compose up --build -d

# View container status
docker-compose ps
```

## 🔒 Security

- **Environment variables** for sensitive data
- **Nginx proxy** for API requests
- **CORS configuration** for development
- **Input validation** on backend

## 📱 Mobile Support

- **Responsive design** for all screen sizes
- **Touch-friendly** interface
- **Progressive Web App** features
- **Offline capability** (basic)

## 🎨 UI Features

- **Dark theme** with glass effects
- **Smooth animations** and transitions
- **Loading states** and error handling
- **Accessibility** features
- **Modern icons** and visual feedback

## 🚌 Bus Data Features

- **Real-time departures** with delays
- **Platform information** for each stop
- **Route numbers** and destinations
- **Air conditioning** indicators
- **Wheelchair accessibility** info
- **Zone information**

## 📈 Performance

- **Code splitting** for faster loading
- **Image optimization** and compression
- **Efficient caching** strategies
- **Minimal bundle size**
- **Fast API responses**

## 🔄 Updates

The application automatically:
- **Refreshes stops** when map is moved
- **Updates departures** in real-time
- **Handles connection** drops gracefully
- **Caches data** for better performance

## 📞 Support

For issues or questions:
1. Check the logs: `docker-compose logs -f`
2. Verify API key in `.env` file
3. Ensure Docker and Docker Compose are installed
4. Check network connectivity

## 📄 License

This project is licensed under the MIT License. 