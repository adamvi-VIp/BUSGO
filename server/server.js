import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import axios from 'axios';
import dotenv from 'dotenv';
import { isEqual } from 'lodash-es';

dotenv.config();

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: "*", // Allow all origins for development
  },
});

const API_KEY = process.env.PID_API_KEY;
const STOPS_JSON_URL = 'https://data.pid.cz/stops/json/stops.json';
const POLLING_INTERVAL = 10000; // 10 seconds

let processedStopsCache = [];

// --- Helper Functions ---

function deg2rad(deg) {
  return deg * (Math.PI/180)
}

function getDistanceFromLatLonInKm(lat1, lon1, lat2, lon2) {
    var R = 6371; // Radius of the earth in km
    var dLat = deg2rad(lat2-lat1);
    var dLon = deg2rad(lon2-lon1);
    var a =
        Math.sin(dLat/2) * Math.sin(dLat/2) +
        Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
        Math.sin(dLon/2) * Math.sin(dLon/2)
    ;
    var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    var d = R * c; // Distance in km
    return d;
}

// --- API Fetching Logic ---

function filterNextDeparturesOnly(departures) {
    if (!Array.isArray(departures) || departures.length === 0) {
        return [];
    }
    
    const departuresByLine = {};
    
    departures.forEach(departure => {
        const route = departure.route;
        const lineNumber = route?.short_name || 'Unknown';
        
        if (!departuresByLine[lineNumber]) {
            departuresByLine[lineNumber] = [];
        }
        departuresByLine[lineNumber].push(departure);
    });
    
    const nextDepartures = [];
    
    Object.keys(departuresByLine).forEach(lineNumber => {
        const lineDepartures = departuresByLine[lineNumber];
        
        lineDepartures.sort((a, b) => {
            const timeA = a.departure_timestamp?.predicted || a.departure_timestamp?.scheduled || 0;
            const timeB = b.departure_timestamp?.predicted || b.departure_timestamp?.scheduled || 0;
            return timeA - timeB;
        });
        
        // Push the next 3 departures for this line
        nextDepartures.push(...lineDepartures.slice(0, 3));
    });
    
    nextDepartures.sort((a, b) => {
        const timeA = a.departure_timestamp?.predicted || a.departure_timestamp?.scheduled || 0;
        const timeB = b.departure_timestamp?.predicted || b.departure_timestamp?.scheduled || 0;
        return timeA - timeB;
    });
    
    return nextDepartures;
}

async function fetchDeparturesFromPID(stopId) {
    const url = `https://api.golemio.cz/v2/pid/departureboards?ids[]=${stopId}&limit=30&minutesAfter=180`;
    try {
        const response = await axios.get(url, {
            headers: {
                'x-access-token': API_KEY,
                'Content-Type': 'application/json'
            },
            timeout: 5000
        });

        if (response.data && Array.isArray(response.data.departures)) {
            const filteredDepartures = filterNextDeparturesOnly(response.data.departures);
            return { ...response.data, departures: filteredDepartures };
        } else {
            console.warn(`[${stopId}] Received invalid or empty data structure from PID API. Response:`, response.data);
            return { departures: [] };
        }
    } catch (error) {
        if (error.response) {
            console.error(`[${stopId}] PID API Error: ${error.response.status} ${error.response.statusText}`);
        } else if (error.request) {
            console.error(`[${stopId}] PID API No Response:`, error.message);
        } else {
            console.error(`[${stopId}] PID API Request Setup Error:`, error.message);
        }
        throw new Error(`Failed to fetch departures for stop ${stopId}.`);
    }
}

async function cacheStopsData() {
    try {
        console.log(`[CACHE] Attempting to download and process stops data...`);
        const response = await axios.get(STOPS_JSON_URL);
        
        if (response.data && Array.isArray(response.data.stopGroups)) {
            const allStops = response.data.stopGroups.flatMap(group =>
                group.stops.map(stop => ({
                    ...stop,
                    groupName: group.name,
                }))
            );
            
            processedStopsCache = allStops
                .filter(stop => stop.gtfsIds && stop.gtfsIds[0])
                .map((stop, index) => {
                    const gtfsId = stop.gtfsIds[0];
                    return {
                        uniqueStopPointId: `${gtfsId}-${index}`,
                        gtfsId: gtfsId,
                        name: stop.groupName,
                        lat: stop.lat,
                        lon: stop.lon,
                        zone: stop.zone,
                        wheelchairAccess: stop.wheelchairAccess,
                        platform: stop.platform || null,
                        lines: stop.lines || []
                    };
                });

            console.log(`[CACHE] Successfully cached and processed ${processedStopsCache.length} stops.`);
        } else {
            throw new Error("Invalid data structure received from stops URL.");
        }

    } catch (error) {
        console.error('[CACHE] Failed to cache stops data:', error.message);
    }
}

// --- Real-time Polling Management ---
const activeTimers = new Map();
const lastKnownData = new Map();

// --- Socket.IO Connection Handling ---
io.on('connection', (socket) => {
    console.log(`[INFO] User connected: ${socket.id}. Total users: ${io.engine.clientsCount}`);

    socket.on('searchStops', async (params) => {
        if (!processedStopsCache || processedStopsCache.length === 0) {
            return socket.emit('stopsError', { error: 'Stop data is not ready. Please try again in a moment.' });
        }

        let results = [];
        if (params && params.query) {
            const query = params.query.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
            results = processedStopsCache.filter(stop =>
                stop.name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").includes(query)
            ).slice(0, 100);
        } else if (params && params.lat && params.lon) {
            const isMapMovement = params.source === 'map-movement';
            
            let nearbyStops = processedStopsCache
                .map(stop => ({
                    ...stop,
                    distance: getDistanceFromLatLonInKm(params.lat, params.lon, stop.lat, stop.lon)
                }))
                .filter(stop => stop.distance <= 3);

            if (isMapMovement) {
                // For map movements, send all stops within the radius, no 50-item limit.
                results = nearbyStops;
            } else {
                // For initial load and manual refresh, send all stops within the radius (no limit).
                results = nearbyStops;
            }
        } else {
            // No query or coordinates: use default location (Prague center)
            const DEFAULT_LAT = 50.0874654;
            const DEFAULT_LON = 14.4212535;
            let nearbyStops = processedStopsCache
                .map(stop => ({
                    ...stop,
                    distance: getDistanceFromLatLonInKm(DEFAULT_LAT, DEFAULT_LON, stop.lat, stop.lon)
                }))
                .filter(stop => stop.distance <= 3);
            results = nearbyStops;
            console.log(`[DEFAULT] Using Prague center. Found ${results.length} stops within 3km for ${socket.id}.`);
        }
        
        if (params && params.source === 'map-movement') {
            console.log(`[MAP-MOVE] Sending ${results.length} stops for map update to ${socket.id}.`);
            socket.emit('stopsData', { stops: results, source: 'map-movement' });
        } else {
            console.log(`[STOPS] Sending ${results.length} stops for main list update to ${socket.id}.`);
            socket.emit('stopsData', results);
        }
    });

    socket.on('requestDepartures', async (stopId) => {
        if (!stopId) {
            return console.error(`[ERROR] Received request for departures with a NULL stopId from socket ${socket.id}`);
        }
        
        console.log(`[POLL] User ${socket.id} requested departures for stop [${stopId}]`);
        
        if (activeTimers.has(stopId)) {
            const existingTimer = activeTimers.get(stopId);
            clearInterval(existingTimer.intervalId);
        }

        const fetchData = async () => {
            try {
                const newData = await fetchDeparturesFromPID(stopId);
                if (!isEqual(newData, lastKnownData.get(stopId))) {
                    console.log(`[POLL] Data for [${stopId}] changed. Emitting to client ${socket.id}.`);
                    socket.emit('departureData', newData);
                    lastKnownData.set(stopId, newData);
                }
            } catch (error) {
                console.error(`[ERROR] Polling for [${stopId}] failed:`, error.message);
                socket.emit('departureError', { stopId, error: 'Failed to fetch new departure data.' });
                if (activeTimers.has(stopId)) {
                    clearInterval(activeTimers.get(stopId).intervalId);
                    activeTimers.delete(stopId);
                }
            }
        };

        fetchData();
        const intervalId = setInterval(fetchData, POLLING_INTERVAL);
        activeTimers.set(stopId, { socketId: socket.id, intervalId });
    });

    socket.on('stopDepartureMonitoring', (stopId) => {
        if (activeTimers.has(stopId)) {
            const timer = activeTimers.get(stopId);
            if (timer.socketId === socket.id) {
                console.log(`[POLL] User ${socket.id} stopped monitoring stop [${stopId}]`);
                clearInterval(timer.intervalId);
                activeTimers.delete(stopId);
                lastKnownData.delete(stopId);
            }
        }
    });

    socket.on('disconnect', () => {
        console.log(`[INFO] User disconnected: ${socket.id}. Will stop sending data to this user. Total users now: ${io.engine.clientsCount}`);
        for (const [stopId, timer] of activeTimers.entries()) {
            if (timer.socketId === socket.id) {
                console.log(`[CLEANUP] Clearing timer for stop ${stopId} due to disconnect from socket ${socket.id}`);
                clearInterval(timer.intervalId);
                activeTimers.delete(stopId);
                lastKnownData.delete(stopId);
            }
        }
    });
});

// Optionally, handle ws proxy socket error globally
process.on('uncaughtException', (err) => {
    if (err.message && err.message.includes('ECONNRESET')) {
        console.log('[INFO] User disconnected (ECONNRESET). Will stop sending data to this user.');
        console.log(`[INFO] Total users now: ${io.engine.clientsCount}`);
    } else {
        console.error(err);
    }
});

// --- Server Initialization ---
const PORT = process.env.PORT || 3001;
const HOST = '0.0.0.0';
httpServer.listen(PORT, HOST, () => {
    const border = '===================================================';
    const emptyLine = `|                                                 |`;
    const apiKeyStatus = API_KEY ? 'Loaded Successfully' : 'NOT FOUND - .env file missing or invalid?';
    
    console.log('\n' + border);
    console.log(emptyLine);
    console.log(`|       🚌 PID Departures Backend Server          |`);
    console.log(emptyLine);
    console.log(border);
    console.log(`|                                                 |`);
    console.log(`|  > Status:          Running                     |`);
    console.log(`|  > Listening on:    http://0.0.0.0:${PORT}      |`);
    console.log(`|  > PID API Key:     ${apiKeyStatus.padEnd(26)}|`);
    console.log(`|  > Polling Speed:   ${(POLLING_INTERVAL / 1000).toString().padEnd(2)} seconds                 |`);
    console.log(emptyLine);
    console.log(border + '\n');

    cacheStopsData();
    setInterval(cacheStopsData, 24 * 60 * 60 * 1000); // Re-cache once a day
});