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

// This function gets the API key from Koyeb secrets (as environment variables)
// or from your local .env file for development.
function getApiKey() {
    const apiKey = process.env.PID_API_KEY;
    if (apiKey) {
        console.log('[INFO] PID API Key loaded successfully from environment variable.');
        return apiKey;
    }
    
    // Debug information for Koyeb deployment
    console.log('[DEBUG] Environment check:');
    console.log('[DEBUG] NODE_ENV:', process.env.NODE_ENV);
    console.log('[DEBUG] Total environment variables:', Object.keys(process.env).length);
    console.log('[DEBUG] Available env vars with "PID":', Object.keys(process.env).filter(key => key.includes('PID')));
    console.log('[DEBUG] Available env vars with "API":', Object.keys(process.env).filter(key => key.includes('API')));
    console.log('[DEBUG] Available env vars with "KEY":', Object.keys(process.env).filter(key => key.includes('KEY')));
    
    console.error('[FATAL] PID_API_KEY is not defined. Please set it in Koyeb secrets or in a local .env file.');
    console.error('[FATAL] For Koyeb: Create a secret named "PID_API_KEY" and attach it to your service.');
    console.error('[FATAL] For local dev: Add PID_API_KEY=your_key_here to your .env file.');
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
        
        const timerKey = `${socket.id}:${stopId}`;
        
        // Check if already monitoring this stop
        if (activeTimers.has(timerKey)) {
            // Count how many users are monitoring this stop
            const usersMonitoringThisStop = Array.from(activeTimers.keys()).filter(key => key.endsWith(`:${stopId}`)).length;
            console.log(`[POLL] User ${socket.id} already monitoring stop [${stopId}], sending current data immediately (${usersMonitoringThisStop} total users monitoring this stop)`);
            // Send current data immediately even if already monitoring
            const currentData = lastKnownData.get(timerKey);
            if (currentData) {
                socket.emit('departureData', currentData);
            }
            return;
        }
        
        console.log(`[POLL] User ${socket.id} requested departures for stop [${stopId}]`);
        
        // Count how many users are monitoring this stop
        const usersMonitoringThisStop = Array.from(activeTimers.keys()).filter(key => key.endsWith(`:${stopId}`)).length;
        console.log(`[POLL] Currently ${usersMonitoringThisStop} user(s) monitoring stop [${stopId}]`);
        
        // --- NEW LOGIC: Find all gtfsIds for this stop ---
        const stopEntry = processedStopsCache.find(stop => stop.gtfsId === stopId || (Array.isArray(stop.gtfsIds) && stop.gtfsIds.includes(stopId)));
        const gtfsIds = stopEntry && Array.isArray(stopEntry.gtfsIds) && stopEntry.gtfsIds.length > 0
            ? stopEntry.gtfsIds
            : [stopId];

        const fetchData = async () => {
            try {
                // Fetch departures for all gtfsIds in parallel
                const allDepartures = await Promise.all(gtfsIds.map(id => fetchDeparturesFromPID(id)));
                // Merge departures arrays
                const mergedDepartures = allDepartures.reduce((acc, data) => {
                    if (Array.isArray(data.departures)) {
                        acc.push(...data.departures);
                    }
                    return acc;
                }, []);
                // Optionally deduplicate by trip id or departure time
                const dedupedDepartures = Array.from(new Map(mergedDepartures.map(dep => [dep.trip?.id + '-' + (dep.departure_timestamp?.predicted || dep.departure_timestamp?.scheduled), dep])).values());
                // Sort by soonest
                dedupedDepartures.sort((a, b) => {
                    const timeA = a.departure_timestamp?.predicted || a.departure_timestamp?.scheduled || 0;
                    const timeB = b.departure_timestamp?.predicted || b.departure_timestamp?.scheduled || 0;
                    return timeA - timeB;
                });
                const mergedData = { departures: dedupedDepartures };
                
                // Always emit on first fetch, then only if data changed
                const isFirstFetch = !lastKnownData.has(timerKey);
                if (isFirstFetch || (!isEqual(mergedData, lastKnownData.get(timerKey)) && activeTimers.has(timerKey))) {
                    // Count how many users are monitoring this stop
                    const usersMonitoringThisStop = Array.from(activeTimers.keys()).filter(key => key.endsWith(`:${stopId}`)).length;
                    console.log(`[POLL] ${isFirstFetch ? 'Initial' : 'Updated'} data for [${stopId}]. Emitting to user ${socket.id} (${usersMonitoringThisStop} total users monitoring this stop)`);
                    socket.emit('departureData', mergedData);
                    lastKnownData.set(timerKey, mergedData);
                }
            } catch (error) {
                console.error(`[ERROR] Polling for [${stopId}] failed:`, error.message);
                socket.emit('departureError', { stopId, error: 'Failed to fetch new departure data.' });
                if (activeTimers.has(timerKey)) {
                    clearInterval(activeTimers.get(timerKey).intervalId);
                    activeTimers.delete(timerKey);
                    lastKnownData.delete(timerKey);
                }
            }
        };

        fetchData();
        const intervalId = setInterval(fetchData, POLLING_INTERVAL);
        activeTimers.set(timerKey, { socketId: socket.id, stopId, intervalId });
    });

    socket.on('stopDepartureMonitoring', (stopId) => {
        const timerKey = `${socket.id}:${stopId}`;
        if (activeTimers.has(timerKey)) {
            const timer = activeTimers.get(timerKey);
            clearInterval(timer.intervalId);
            activeTimers.delete(timerKey);
            lastKnownData.delete(timerKey);
            // Count how many users are still monitoring this stop
            const stillMonitoring = Array.from(activeTimers.keys()).filter(key => key.endsWith(`:${stopId}`)).length;
            if (stillMonitoring > 0) {
                console.log(`[POLL] User ${socket.id} stopped monitoring stop [${stopId}]. Still ${stillMonitoring} user(s) monitoring this stop.`);
            } else {
                console.log(`[POLL] User ${socket.id} stopped monitoring stop [${stopId}]. No users are monitoring this stop now.`);
            }
        } else {
            console.log(`[POLL] User ${socket.id} tried to stop monitoring stop [${stopId}] but was not monitoring it.`);
        }
    });

    socket.on('disconnect', () => {
        console.log(`[INFO] User disconnected: ${socket.id}. Will stop sending data to this user. Total users now: ${io.engine.clientsCount}`);
        let stopsAffected = [];
        for (const [timerKey, timer] of Array.from(activeTimers.entries())) {
            if (timer.socketId === socket.id) {
                clearInterval(timer.intervalId);
                activeTimers.delete(timerKey);
                lastKnownData.delete(timerKey);
                stopsAffected.push(timer.stopId);
            }
        }
        
        // Log summary of affected stops
        if (stopsAffected.length > 0) {
            const uniqueStops = [...new Set(stopsAffected)];
            uniqueStops.forEach(stopId => {
                const stillMonitoring = Array.from(activeTimers.keys()).filter(key => key.endsWith(`:${stopId}`)).length;
                if (stillMonitoring > 0) {
                    console.log(`[CLEANUP] User ${socket.id} disconnected and stopped monitoring stop [${stopId}]. Still ${stillMonitoring} user(s) monitoring this stop.`);
                } else {
                    console.log(`[CLEANUP] User ${socket.id} disconnected and stopped monitoring stop [${stopId}]. No users are monitoring this stop now.`);
                }
            });
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
httpServer.listen(PORT, '0.0.0.0', () => {
    console.log('\n===================================================');
    console.log('|       🚌 PID Departures Backend Server          |');
    console.log('===================================================');
    console.log(`| > Status:          Running                     |`);
    console.log(`| > Listening on:    http://localhost:${PORT}      |`);
    console.log(`| > PID API Key:     ${API_KEY ? 'Loaded Successfully' : 'NOT FOUND!'}         |`);
    console.log(`| > Polling Speed:   ${(POLLING_INTERVAL / 1000)} seconds                  |`);
    console.log('===================================================\n');
    
    cacheStopsData();
    setInterval(cacheStopsData, 24 * 60 * 60 * 1000); // Re-cache once a day
});