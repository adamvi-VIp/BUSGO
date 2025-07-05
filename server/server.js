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

// --- API Fetching Logic ---

function filterNextDeparturesOnly(departures) {
    if (!Array.isArray(departures) || departures.length === 0) {
        return [];
    }
    
    // Group departures by line number (route short_name)
    const departuresByLine = {};
    
    departures.forEach(departure => {
        const route = departure.route;
        const lineNumber = route?.short_name || 'Unknown';
        
        if (!departuresByLine[lineNumber]) {
            departuresByLine[lineNumber] = [];
        }
        departuresByLine[lineNumber].push(departure);
    });
    
    // For each line, keep only the next departure (earliest one)
    const nextDepartures = [];
    
    Object.keys(departuresByLine).forEach(lineNumber => {
        const lineDepartures = departuresByLine[lineNumber];
        
        // Sort by departure time (earliest first)
        lineDepartures.sort((a, b) => {
            const timeA = a.departure_timestamp || a.arrival?.departure_timestamp || 0;
            const timeB = b.departure_timestamp || b.arrival?.departure_timestamp || 0;
            return timeA - timeB;
        });
        
        // Take only the first (earliest) departure for this line
        if (lineDepartures.length > 0) {
            nextDepartures.push(lineDepartures[0]);
        }
    });
    
    // Sort all next departures by departure time
    nextDepartures.sort((a, b) => {
        const timeA = a.departure_timestamp || a.arrival?.departure_timestamp || 0;
        const timeB = b.departure_timestamp || b.arrival?.departure_timestamp || 0;
        return timeA - timeB;
    });
    
    return nextDepartures;
}

async function fetchDeparturesFromPID(stopId) {
    const url = `https://api.golemio.cz/v2/pid/departureboards?ids[]=${stopId}&limit=30&minutesAfter=180`;
            console.log(`[${stopId}] Fetching from URL: ${url}`);
        console.log(`[${stopId}] API Key present: ${!!API_KEY}`);
        console.log(`[${stopId}] API Key (first 10 chars): ${API_KEY ? API_KEY.substring(0, 10) + '...' : 'NOT SET'}`);
        try {
            const response = await axios.get(url, {
                headers: { 
                    'x-access-token': API_KEY,
                    'Content-Type': 'application/json'
                },
                timeout: 5000
            });

        console.log(`[${stopId}] Full API response:`, JSON.stringify(response.data, null, 2));
        
        if (response.data && Array.isArray(response.data.departures)) {
            // Debug: Log the first departure to see the structure
            if (response.data.departures.length > 0) {
                console.log(`[${stopId}] Sample departure structure:`, JSON.stringify(response.data.departures[0], null, 2));
            }
            
            // Filter to show only the next departure for each unique line number
            const filteredDepartures = filterNextDeparturesOnly(response.data.departures);
            console.log(`[${stopId}] Filtered ${response.data.departures.length} departures to ${filteredDepartures.length} unique lines`);
            
            return { ...response.data, departures: filteredDepartures };
        } else if (response.data && response.data.data && Array.isArray(response.data.data.departures)) {
            // Alternative response structure
            console.log(`[${stopId}] Using alternative response structure`);
            const filteredDepartures = filterNextDeparturesOnly(response.data.data.departures);
            console.log(`[${stopId}] Filtered ${response.data.data.departures.length} departures to ${filteredDepartures.length} unique lines`);
            
            return { ...response.data.data, departures: filteredDepartures };
        } else {
            console.warn(`[${stopId}] Received invalid or empty data structure from PID API. Response:`, response.data);
            return { departures: [] };
        }
    } catch (error) {
        if (error.response) {
            console.error(`[${stopId}] PID API Error: ${error.response.status} ${error.response.statusText}`);
            console.error(`[${stopId}] Error response:`, error.response.data);
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
            
            // **BUG FIX:** Filter out invalid stops and create a truly unique ID for each stop point.
            processedStopsCache = allStops
                .filter(stop => stop.gtfsIds && stop.gtfsIds[0]) // Ensure a valid GTFS ID exists
                .map((stop, index) => {
                    const gtfsId = stop.gtfsIds[0];
                    return {
                        // A guaranteed unique ID for React keys - always use index to ensure uniqueness.
                        uniqueStopPointId: `${gtfsId}-${index}`, 
                        
                        // The actual ID for making API calls.
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
            throw new Error("Invalid data structure received from stops URL. Expected an object with a 'stopGroups' array.");
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
                    distance: Math.sqrt(Math.pow(stop.lat - params.lat, 2) + Math.pow(stop.lon - params.lon, 2))
                }))
                .sort((a, b) => a.distance - b.distance)
                .slice(0, 50);
        }
        
        socket.emit('stopsData', results);
    });

    socket.on('requestDepartures', async (stopId) => {
        // **BUG FIX:** Add a guard to prevent requests with null/undefined IDs.
        if (!stopId) {
            return console.error(`[ERROR] Received request for departures with a NULL stopId from socket ${socket.id}`);
        }
        
        console.log(`[POLL] User ${socket.id} requested departures for stop [${stopId}]`);
        if (activeTimers.has(stopId)) clearInterval(activeTimers.get(stopId));

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
                clearInterval(activeTimers.get(stopId));
                activeTimers.delete(stopId);
            }
        };

        fetchData();
        const intervalId = setInterval(fetchData, POLLING_INTERVAL);
        activeTimers.set(stopId, intervalId);
    });

    socket.on('stopDepartureMonitoring', (stopId) => {
        if (activeTimers.has(stopId)) {
            console.log(`[POLL] User ${socket.id} stopped monitoring stop [${stopId}]`);
            clearInterval(activeTimers.get(stopId));
            activeTimers.delete(stopId);
            lastKnownData.delete(stopId);
        }
    });

    socket.on('disconnect', () => {
        console.log(`[INFO] User disconnected: ${socket.id}`);
    });
});

// --- Server Initialization ---
const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => {
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
    console.log(`|  > Listening on:    http://localhost:${PORT}      |`);
    console.log(`|  > PID API Key:     ${apiKeyStatus.padEnd(26)}|`);
    console.log(`|  > Polling Speed:   ${(POLLING_INTERVAL / 1000).toString().padEnd(2)} seconds                 |`);
    console.log(emptyLine);
    console.log(border + '\n');

    cacheStopsData();
    setInterval(cacheStopsData, 24 * 60 * 60 * 1000); // Re-cache once a day
});
