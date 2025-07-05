const axios = require('axios');
const { Server } = require('socket.io');
const http = require('http');
const express = require('express');
const cors = require('cors');

// Load environment variables
require('dotenv').config();

// --- Configuration ---
const CONFIG = {
    STOPS_JSON_URL: 'https://data.pid.cz/stops/json/stops.json',
    DEPARTURES_API_URL: 'https://api.golemio.cz/v2/public/departureboards',
    VEHICLES_API_URL: 'https://api.golemio.cz/v2/vehiclepositions',
    API_KEY: process.env.GOLEMIO_API_KEY,
    CACHE_REFRESH_INTERVAL: 24 * 60 * 60 * 1000, // 24 hours
    PORT: process.env.PORT || 3001,
    DEPARTURE_BATCH_DELAY: 100 // ms to wait for batching requests
};

// --- In-Memory Caches ---
let stopsCache = [];
let departureRequestQueue = new Map();
let batchTimeout = null;

// Metrics tracking
let trackedStops = new Set();
let trackedVehicles = new Set();

// Vehicle activity tracking
const vehicleLastSeen = new Map(); // tripId -> timestamp
const VEHICLE_INACTIVE_THRESHOLD = 2 * 60 * 1000; // 2 minutes

// --- Express & Socket.IO Setup ---
const app = express();
const server = http.createServer(app);
app.use(cors({
    origin: process.env.NODE_ENV === 'development' ? ['http://localhost:5173'] : process.env.FRONTEND_URL || true,
    methods: ['GET', 'POST']
}));
const io = new Server(server, {
    cors: {
        origin: process.env.NODE_ENV === 'development' ? ['http://localhost:5173'] : process.env.FRONTEND_URL || true,
        methods: ['GET', 'POST']
    }
});

// --- Helper Functions ---

/**
 * Calculates the distance between two GPS coordinates in kilometers using the Haversine formula.
 */
function getDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Radius of the Earth in km
    const dLat = (lat2 - lat1) * (Math.PI / 180);
    const dLon = (lon2 - lon1) * (Math.PI / 180);
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

/**
 * Downloads the stops.json file, processes it, and populates the in-memory cache.
 */
async function fetchAndCacheStops() {
    console.log('Attempting to download and cache stops data...');
    try {
        const response = await axios.get(CONFIG.STOPS_JSON_URL);
        const rawData = response.data;
        
        const flattenedStops = [];
        if (rawData && rawData.stopGroups) {
            rawData.stopGroups.forEach(group => {
                group.stops.forEach(stop => {
                    // Use gtfsIds[0] as the stop ID if available, otherwise fall back to constructed ID
                    const golemioStopId = stop.gtfsIds && stop.gtfsIds.length > 0 ? stop.gtfsIds[0] : `U${group.node}Z${stop.platform || '1'}`;
                    flattenedStops.push({
                        id: golemioStopId,
                        name: group.name,
                        platform: stop.platform,
                        lat: stop.lat,
                        lon: stop.lon,
                        wheelchairAccess: stop.wheelchair_boarding,
                        zone: stop.zone,
                        lines: stop.lines || [] // Include lines array for each stop
                    });
                });
            });
        }
        
        stopsCache = flattenedStops;
        console.log(`Successfully cached ${stopsCache.length} stops.`);
    } catch (error) {
        console.error('Failed to download or process stops data:', error.message);
    }
}

/**
 * Processes the batched departure requests.
 */
async function processDepartureQueue() {
    if (departureRequestQueue.size === 0) return;

    const queueCopy = new Map(departureRequestQueue);
    departureRequestQueue.clear();

    // console.log(`[DEBUG] Processing batched departure requests for ${queueCopy.size} stops.`);

    // Build stopIds as an array of JSON strings, each with a single group
    const stopIds = [];
    const stopIdMapping = {};
    let index = 0;
    for (const [stopId, sockets] of queueCopy.entries()) {
        stopIds.push(JSON.stringify({ [index]: [stopId] }));
        stopIdMapping[index] = { stopId, sockets };
        index++;
    }

    const requestConfig = {
        headers: { 'X-Access-Token': CONFIG.API_KEY },
        params: {
            stopIds,
            limit: 20
        }
    };

    // Debug logging for outgoing request
    // console.log('Requesting departures with stopIds:', stopIds);
    // console.log('Request config:', JSON.stringify(requestConfig, null, 2));
    
    try {
        const response = await axios.get(CONFIG.DEPARTURES_API_URL, requestConfig);
        const departureGroups = response.data;

        // Dispatch results back to the correct sockets
        departureGroups.forEach((departures, i) => {
            const { stopId, sockets } = stopIdMapping[i];
            const dataToSend = { departures: departures || [] };
            // Track tripIds for vehicle status
            if (departures && Array.isArray(departures)) {
                departures.forEach(dep => {
                    if (dep.trip && dep.trip.trip_id) {
                        vehicleLastSeen.set(dep.trip.trip_id, Date.now());
                    }
                });
            }
            sockets.forEach(socketId => {
                const socket = io.sockets.sockets.get(socketId);
                if (socket) {
                    socket.emit('departureData', dataToSend);
                }
            });
        });

    } catch (error) {
        console.error(`Error fetching batched departures:`, error.message);
        if (error.response) {
            console.error('[ERROR] Golemio Response Data:', JSON.stringify(error.response.data, null, 2));
        }
        // Notify all requesting clients of the failure
        for (const { stopId, sockets } of Object.values(stopIdMapping)) {
            sockets.forEach(socketId => {
                const socket = io.sockets.sockets.get(socketId);
                if (socket) {
                    socket.emit('departureError', { stopId, error: 'Failed to fetch departures.' });
                }
            });
        }
    }
}

// Helper function to remove spaces and diacritics from text
const normalizeText = (text) => {
    if (!text) return '';
    return text
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/\s+/g, '')
        .toLowerCase();
};

// --- Socket.IO Connection Logic ---
io.on('connection', (socket) => {
    console.log(`User connected. Total users: ${io.engine.clientsCount}`);

    socket.on('disconnect', () => {
        console.log(`User disconnected. Total users: ${io.engine.clientsCount}`);
        // Optional: remove socket from any pending departure requests
        for(const [stopId, sockets] of departureRequestQueue.entries()){
            if(sockets.has(socket.id)){
                sockets.delete(socket.id);
                if(sockets.size === 0){
                    departureRequestQueue.delete(stopId);
                }
            }
        }
    });

    socket.on('searchStops', (data) => {
        const { query, lat, lon } = data;

        if (query) {
            const normalizedQuery = normalizeText(query);
            const results = stopsCache
                .filter(stop => normalizeText(stop.name).includes(normalizedQuery))
                .slice(0, 150);
            socket.emit('stopsData', results);

        } else if (lat && lon) {
            const results = stopsCache
                .map(stop => ({
                    ...stop,
                    distance: getDistance(lat, lon, stop.lat, stop.lon)
                }))
                .filter(stop => stop.distance <= 2)
                .sort((a, b) => a.distance - b.distance)
                .slice(0, 50);
            socket.emit('stopsData', results);
        }
    });

    socket.on('requestDepartures', (stopId) => {
        if (stopId) {
            trackedStops.add(stopId);
        }
        if (!CONFIG.API_KEY) {
            return socket.emit('departureError', { stopId, error: "API key not configured for real-time data." });
        }

        // Add request to the queue
        if (!departureRequestQueue.has(stopId)) {
            departureRequestQueue.set(stopId, new Set());
        }
        departureRequestQueue.get(stopId).add(socket.id);

        // Clear existing timeout and set a new one
        if (batchTimeout) clearTimeout(batchTimeout);
        batchTimeout = setTimeout(processDepartureQueue, CONFIG.DEPARTURE_BATCH_DELAY);
    });

    socket.on('requestVehiclePosition', async (tripId) => {
        if (tripId) {
            trackedVehicles.add(tripId);
        }
        if (!CONFIG.API_KEY) {
            return socket.emit('vehiclePositionError', { tripId, error: "API key not configured for real-time data." });
        }
        try {
            const response = await axios.get(`${CONFIG.VEHICLES_API_URL}/${tripId}`, {
                headers: { 'X-Access-Token': CONFIG.API_KEY }
            });
            socket.emit('vehiclePositionData', response.data);
        } catch (error) {
            if (error.response && error.response.status !== 404) {
                console.error(`Error fetching vehicle position for trip ${tripId}:`, error.message);
            }
            socket.emit('vehiclePositionError', { tripId, error: 'Failed to fetch vehicle position.' });
        }
    });
});

// --- Server Initialization ---
server.listen(CONFIG.PORT, () => {
    console.log(`Server listening on port ${CONFIG.PORT}`);
    fetchAndCacheStops();
    setInterval(fetchAndCacheStops, CONFIG.CACHE_REFRESH_INTERVAL);
});

// At the bottom of server.js
const logServerMetrics = () => {
    console.log(`\n---------------------------------------\n[METRICS @ ${new Date().toLocaleTimeString()}]\n  - Connected Users: ${io.engine.clientsCount}\n  - Active Stops Being Refreshed: ${trackedStops.size}\n  - Active Vehicles Being Tracked: ${trackedVehicles.size}\n---------------------------------------\n    `);
};
setInterval(logServerMetrics, 60000);

// --- Periodic Vehicle Status Refresh ---
async function refreshVehicleStatuses() {
    if (!CONFIG.API_KEY) return;
    const now = Date.now();
    // Only keep tripIds seen in the last 10 minutes
    for (const [tripId, lastSeen] of vehicleLastSeen.entries()) {
        if (now - lastSeen > 10 * 60 * 1000) {
            vehicleLastSeen.delete(tripId);
        }
    }
    // Gather all tripIds from trackedVehicles (populated by requestVehiclePosition) and from recent departures
    const allTripIds = Array.from(new Set([
        ...trackedVehicles,
        ...Array.from(vehicleLastSeen.keys())
    ]));
    if (allTripIds.length === 0) return;
    // Fetch vehicle positions in parallel (batching could be added if needed)
    const activeTripIds = new Set();
    await Promise.all(allTripIds.map(async (tripId) => {
        try {
            const response = await axios.get(`${CONFIG.VEHICLES_API_URL}/${tripId}`, {
                headers: { 'X-Access-Token': CONFIG.API_KEY }
            });
            if (response.data && response.data.properties && response.data.properties.last_update) {
                vehicleLastSeen.set(tripId, now);
                activeTripIds.add(tripId);
            }
        } catch (error) {
            // If 404, vehicle is not active; ignore
        }
    }));
    // Determine inactive tripIds
    const inactiveTripIds = allTripIds.filter(tripId => {
        const lastSeen = vehicleLastSeen.get(tripId);
        return !lastSeen || (now - lastSeen > VEHICLE_INACTIVE_THRESHOLD);
    });
    // Broadcast to all clients
    io.emit('vehicleStatusUpdate', {
        active: Array.from(activeTripIds),
        inactive: inactiveTripIds
    });
}
setInterval(refreshVehicleStatuses, 30000); // every 30 seconds
