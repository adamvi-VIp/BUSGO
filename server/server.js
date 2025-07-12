import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import axios from 'axios';
import dotenv from 'dotenv';
import { isEqual } from 'lodash-es';

// Load .env file only when not in a production environment (like Koyeb)
if (process.env.NODE_ENV !== 'production') {
    dotenv.config();
}

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: "*", // Allow all origins
  },
});

// --- API Key Loading ---

// This function now cleanly gets the API key from Koyeb secrets (as an environment variable)
// or from your local .env file for development.
function getApiKey() {
    const apiKey = process.env.PID_API_KEY;
    if (apiKey) {
        console.log('[INFO] PID API Key loaded successfully.');
        return apiKey;
    }
    console.error('[FATAL] PID_API_KEY is not defined. Please set it in Koyeb secrets or in a local .env file.');
    // In a real production scenario, you might want to exit if the key is missing.
    // process.exit(1); 
    return null;
}

const API_KEY = getApiKey();
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
    // Gracefully handle if API_KEY is missing
    if (!API_KEY) {
        throw new Error("API key is missing, cannot fetch departures.");
    }
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
            console.warn(`[${stopId}] Received invalid or empty data structure from PID API.`);
            return { departures: [] };
        }
    } catch (error) {
        if (error.response) {
            console.error(`[${stopId}] PID API Error: ${error.response.status} ${error.response.statusText}`);
        } else {
            console.error(`[${stopId}] PID API Error: ${error.message}`);
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
                        gtfsIds: stop.gtfsIds,
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
            results = processedStopsCache
                .map(stop => ({
                    ...stop,
                    distance: getDistanceFromLatLonInKm(params.lat, params.lon, stop.lat, stop.lon)
                }))
                .filter(stop => stop.distance <= 3);
        }
        
        socket.emit('stopsData', { stops: results, source: params?.source || 'search' });
    });

    socket.on('requestDepartures', async (stopId) => {
        if (!stopId) {
            return console.error(`[ERROR] Received request for departures with a NULL stopId from socket ${socket.id}`);
        }
        
        const timerKey = `${socket.id}:${stopId}`;
        
        if (activeTimers.has(timerKey)) {
            return; // Already monitoring
        }
        
        console.log(`[POLL] User ${socket.id} requested departures for stop [${stopId}]`);
        
        const stopEntry = processedStopsCache.find(stop => stop.gtfsId === stopId || (Array.isArray(stop.gtfsIds) && stop.gtfsIds.includes(stopId)));
        const gtfsIds = stopEntry?.gtfsIds?.length > 0 ? stopEntry.gtfsIds : [stopId];

        const fetchData = async () => {
            try {
                const allDepartures = await Promise.all(gtfsIds.map(id => fetchDeparturesFromPID(id)));
                const mergedDepartures = allDepartures.flat().map(data => data.departures).flat();
                
                const dedupedDepartures = Array.from(new Map(mergedDepartures.map(dep => [dep.trip?.id + '-' + (dep.departure_timestamp?.predicted || dep.departure_timestamp?.scheduled), dep])).values());
                dedupedDepartures.sort((a, b) => (a.departure_timestamp?.predicted || a.departure_timestamp?.scheduled || 0) - (b.departure_timestamp?.predicted || b.departure_timestamp?.scheduled || 0));
                
                const mergedData = { departures: dedupedDepartures };

                if (!isEqual(mergedData, lastKnownData.get(timerKey))) {
                    socket.emit('departureData', mergedData);
                    lastKnownData.set(timerKey, mergedData);
                }
            } catch (error) {
                console.error(`[ERROR] Polling for [${stopId}] failed:`, error.message);
                socket.emit('departureError', { stopId, error: 'Failed to fetch new departure data.' });
                // Stop polling on error
                if (activeTimers.has(timerKey)) {
                    clearInterval(activeTimers.get(timerKey).intervalId);
                    activeTimers.delete(timerKey);
                    lastKnownData.delete(timerKey);
                }
            }
        };

        fetchData(); // Initial fetch
        const intervalId = setInterval(fetchData, POLLING_INTERVAL);
        activeTimers.set(timerKey, { socketId: socket.id, stopId, intervalId });
    });

    socket.on('stopDepartureMonitoring', (stopId) => {
        const timerKey = `${socket.id}:${stopId}`;
        if (activeTimers.has(timerKey)) {
            clearInterval(activeTimers.get(timerKey).intervalId);
            activeTimers.delete(timerKey);
            lastKnownData.delete(timerKey);
            console.log(`[POLL] User ${socket.id} stopped monitoring stop [${stopId}].`);
        }
    });

    socket.on('disconnect', () => {
        console.log(`[INFO] User disconnected: ${socket.id}. Cleaning up their timers.`);
        for (const [timerKey, timer] of activeTimers.entries()) {
            if (timer.socketId === socket.id) {
                clearInterval(timer.intervalId);
                activeTimers.delete(timerKey);
                lastKnownData.delete(timerKey);
            }
        }
    });
});

// --- Server Initialization ---
const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, '0.0.0.0', () => {
    console.log('\n===================================================');
    console.log('|       🚌 PID Departures Backend Server          |');
    console.log('===================================================');
    console.log(`| > Status:          Running                     |`);
    console.log(`| > Listening on:    http://localhost:${PORT}      |`);
    console.log(`| > PID API Key:     ${API_KEY ? 'Loaded Successfully' : 'NOT FOUND!'}         |`);
    console.log('===================================================\n');
    
    cacheStopsData();
    setInterval(cacheStopsData, 24 * 60 * 60 * 1000); // Re-cache once a day
});