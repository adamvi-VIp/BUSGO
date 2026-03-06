# 🚌 BusGo - Real-time Bus Departures

A modern, real-time bus departure application for Prague, Czech Republic. Built with React, Node.js, and Socket.IO.

## 🌟 Features

- **Real-time departures** from PID API
- **Interactive map** with Leaflet
- **Location-based search** for nearby stations
- **Map movement tracking** - automatically fetches stops for new areas
- **Modern UI** with dark theme and smooth animations
- **Haptic feedback** on button clicks (with iOS support)
- **Mobile-responsive** design
- **Prague timezone** support
- **Air conditioning indicators**
- **Delay tracking** with color coding

## 📖 Related Guides
- [PWA Update & Versioning Guide](./PWA_UPDATE_GUIDE.md) — How standalone app updates work.

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

Copy the example environment file and add your PID API key:

```bash
cp env.example .env
```

Then edit the `.env` file:

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

## 🏗️ Build System Deployment

For automated build systems (like Railway, Render, etc.):

```bash
# The main Dockerfile builds the frontend
docker build -t busgo-frontend .

# For backend-only deployment
docker build -f Dockerfile.backend -t busgo-backend .
```

### Environment Variables for Build Systems:

Set these environment variables in your build system:
- `PID_API_KEY`: Your PID API key from https://api.golemio.cz/
- `NODE_ENV`: production
- `TZ`: Europe/Prague

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

- **Real-time departures** with live updates
- **Delay tracking** with color-coded indicators
- **Air conditioning** status for each vehicle
- **Wheelchair accessibility** information
- **Route information** and direction
- **Platform numbers** for easy identification
- **Time-based filtering** and sorting
- **Search functionality** across all stops
- **Favorites system** for quick access
- **Offline data** caching for reliability

## 🔄 Real-time Updates

- **WebSocket connections** for instant updates
- **Automatic reconnection** on network issues
- **Connection status** indicators
- **Error handling** with user feedback
- **Performance optimization** for smooth UX

## 📍 Location Services

- **GPS integration** for nearby stops
- **Map-based navigation** with Leaflet
- **Automatic location updates** as you move
- **Manual location input** support
- **Location permission** handling
- **Fallback locations** for offline use

## 🎯 User Experience

- **Intuitive interface** with clear navigation
- **Fast loading times** with optimized assets
- **Smooth animations** and transitions
- **Accessibility compliance** for all users
- **Mobile-first design** for on-the-go use
- **Dark theme** for reduced eye strain
- **Responsive layout** for all devices

## 🚀 Performance

- **Optimized bundle** with Vite
- **Code splitting** for faster loading
- **Lazy loading** of components
- **Efficient state management** with React
- **Minimal re-renders** for smooth UX
- **Caching strategies** for API responses
- **Compression** for faster downloads

## 🔧 Technical Stack

### Frontend
- **React 18** with modern hooks
- **Vite** for fast development and building
- **Tailwind CSS** for styling
- **Leaflet** for interactive maps
- **Socket.IO Client** for real-time updates
- **Axios** for HTTP requests

### Backend
- **Node.js** with Express
- **Socket.IO** for real-time communication
- **CORS** for cross-origin requests
- **Environment variables** for configuration
- **Error handling** and logging

### Infrastructure
- **Docker** for containerization
- **Nginx** for reverse proxy
- **Docker Compose** for orchestration
- **Health checks** and monitoring
- **Automatic restarts** on failure

## 📈 Monitoring and Logs

- **Real-time logs** with Docker Compose
- **Error tracking** and reporting
- **Performance monitoring** for API calls
- **Connection status** indicators
- **User feedback** collection
- **Analytics integration** ready

## 🔄 Deployment Options

### Docker Compose (Recommended)
```bash
docker-compose up --build -d
```

### Standalone Docker
```bash
# Frontend
docker build -t busgo-frontend .
docker run -p 80:80 busgo-frontend

# Backend
docker build -f Dockerfile.backend -t busgo-backend .
docker run -p 3001:3001 busgo-backend
```

### Manual Deployment
```bash
# Frontend
cd busgo
npm install
npm run build

# Backend
cd server
npm install
npm start
```

## 🎉 Getting Started

1. **Clone the repository**
2. **Set up environment variables**
3. **Install dependencies**
4. **Start development servers**
5. **Access the application**

The BusGo application is now ready to provide real-time bus departure information for Prague's public transportation system! 