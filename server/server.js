import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import axios from 'axios';
import dotenv from 'dotenv';
import { isEqual } from 'lodash-es';
import fs from 'fs/promises';

let tempFileCache = {};

const DEBUG_LOGS = false; // Set to true for verbose logs

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

// Add a new Map to track rate-limited stations and their backoff timers
const rateLimitedStations = new Map(); // key: stopId, value: { until: timestamp }

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

// Helper to get stop name from stopId
function getStopNameById(stopId) {
    const stop = processedStopsCache.find(stop => stop.gtfsId === stopId || (Array.isArray(stop.gtfsIds) && stop.gtfsIds.includes(stopId)));
    return stop ? stop.name : 'Unknown';
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
    const stopName = getStopNameById(stopId);
    console.log(`[API] Fetching departures from PID API for [${stopId} | ${stopName}]`);
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
        if (error.response && error.response.status === 429) {
            console.warn(`[API LIMIT] PID API rate limit (429) for [${stopId} | ${stopName}]`);
        }
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
                        lines: stop.lines || [],
                        mainTrafficType: stop.mainTrafficType || null
                    };
                });
            console.log(`[CACHE] Successfully cached and processed ${processedStopsCache.length} stops.`);
        } else {
            throw new Error("Invalid data structure received from stops URL.");
        }
    } catch (error) {
        if (error.response && error.response.status === 429) {
            console.warn(`[API LIMIT] PID API rate limit (429) for stops data`);
        }
        console.error('[CACHE] Failed to cache stops data:', error.message);
    }
}

// --- Real-time Polling Management ---
const activeTimers = new Map(); // key: stopId (shared across users)
const lastKnownData = new Map(); // key: stopId, value: { data: {...}, timestamp: number } (shared across users)
const usersMonitoringStop = new Map(); // key: stopId, value: Set of socketIds

const TEMP_CACHE_FILE = './server/station_cache.json';
const CACHE_MAX_AGE_MS = 8000; // 8 seconds (shorter than 10s polling interval)

// Helper: Load temp cache from file
async function loadTempCache() {
    try {
        const data = await fs.readFile(TEMP_CACHE_FILE, 'utf-8');
        return JSON.parse(data);
    } catch (e) {
        return {};
    }
}
// Helper: Save temp cache to file
async function saveTempCache(cache) {
    try {
        await fs.writeFile(TEMP_CACHE_FILE, JSON.stringify(cache, null, 2), 'utf-8');
    } catch (e) {
        console.error('[TEMP CACHE] Failed to write temp cache:', e.message);
    }
}

// Helper: Check if cached data is fresh
function isCacheFresh(timestamp) {
    return Date.now() - timestamp < CACHE_MAX_AGE_MS;
}

// Helper: Format cache age for logging
function formatCacheAge(timestamp) {
    const ageMs = Date.now() - timestamp;
    const ageSeconds = Math.round(ageMs / 1000);
    return `${ageSeconds}s`;
}

// On startup, load temp cache
(async () => {
    tempFileCache = await loadTempCache();
    // Populate in-memory cache for fast path
    for (const stopId in tempFileCache) {
        const entry = tempFileCache[stopId];
        if (entry && entry.data && entry.timestamp) {
            lastKnownData.set(stopId, { data: entry.data, timestamp: entry.timestamp });
        }
    }
    console.log(`[CACHE] Loaded ${Object.keys(tempFileCache).length} cached stations from temp file`);
})();

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
        if (!usersMonitoringStop.has(stopId)) {
            usersMonitoringStop.set(stopId, new Set());
        }
        usersMonitoringStop.get(stopId).add(socket.id);
        const stopName = getStopNameById(stopId);
        // --- TEMP FILE CACHE LOGIC ---
        let now = Date.now();
        let tempEntry = tempFileCache[stopId];
        if (tempEntry && now - tempEntry.timestamp < CACHE_MAX_AGE_MS) {
            // Serve from temp file if fresh
            lastKnownData.set(stopId, { data: tempEntry.data, timestamp: tempEntry.timestamp });
            if (activeTimers.has(stopId)) {
                console.log(`[TEMP CACHE] [${stopId} | ${stopName}] User ${socket.id} connected to already-polling station. Served fresh cached data from temp file (age: ${formatCacheAge(tempEntry.timestamp)})`);
                socket.emit('departureData', tempEntry.data);
            } else {
                console.log(`[TEMP CACHE] [${stopId} | ${stopName}] Served fresh cached data from temp file (age: ${formatCacheAge(tempEntry.timestamp)})`);
                socket.emit('departureData', tempEntry.data);
            }
            // If not polling, start polling for future updates
            if (!activeTimers.has(stopId)) {
                if (DEBUG_LOGS) console.log(`[TEMP CACHE] [${stopId} | ${stopName}] No polling active, starting polling for this station.`);
                const stopEntry = processedStopsCache.find(stop => stop.gtfsId === stopId || (Array.isArray(stop.gtfsIds) && stop.gtfsIds.includes(stopId)));
                const gtfsIds = stopEntry && Array.isArray(stopEntry.gtfsIds) && stopEntry.gtfsIds.length > 0
                    ? stopEntry.gtfsIds
                    : [stopId];
                const fetchData = async () => {
                    // If rate-limited, skip fetch until backoff expires
                    if (rateLimitedStations.has(stopId)) {
                        const { until } = rateLimitedStations.get(stopId);
                        if (Date.now() < until) {
                            console.log(`[POLL] [${stopId}] Skipping fetch due to rate limit until ${new Date(until).toISOString()}`);
                            return;
                        } else {
                            rateLimitedStations.delete(stopId);
                        }
                    }
                    try {
                        const allDepartures = await Promise.all(gtfsIds.map(id => fetchDeparturesFromPID(id)));
                        const mergedDepartures = allDepartures.reduce((acc, data) => {
                            if (Array.isArray(data.departures)) {
                                acc.push(...data.departures);
                            }
                            return acc;
                        }, []);
                        const dedupedDepartures = Array.from(new Map(mergedDepartures.map(dep => [dep.trip?.id + '-' + (dep.departure_timestamp?.predicted || dep.departure_timestamp?.scheduled), dep])).values());
                        dedupedDepartures.sort((a, b) => {
                            const timeA = a.departure_timestamp?.predicted || a.departure_timestamp?.scheduled || 0;
                            const timeB = b.departure_timestamp?.predicted || b.departure_timestamp?.scheduled || 0;
                            return timeA - timeB;
                        });
                        const mergedData = { departures: dedupedDepartures };
                        lastKnownData.set(stopId, mergedData);
                        tempFileCache[stopId] = { data: mergedData, timestamp: Date.now() };
                        await saveTempCache(tempFileCache);
                        // Send to all users monitoring this stop
                        const usersToNotify = usersMonitoringStop.get(stopId);
                        if (usersToNotify && usersToNotify.size > 0) {
                            console.log(`[POLL] [${stopId} | ${getStopNameById(stopId)}] New data fetched from PID API, cached to temp file, and emitted to ${usersToNotify.size} user(s)`);
                            usersToNotify.forEach(userSocketId => {
                                const userSocket = io.sockets.sockets.get(userSocketId);
                                if (userSocket) {
                                    userSocket.emit('departureData', mergedData);
                                }
                            });
                        }
                    } catch (error) {
                        // Handle 429 Too Many Requests
                        if (error.message && error.message.includes('429')) {
                            const backoffMs = 10000; // 10 seconds
                            const until = Date.now() + backoffMs;
                            rateLimitedStations.set(stopId, { until });
                            console.warn(`[API LIMIT] [POLL] PID API rate limit (429) for [${stopId} | ${getStopNameById(stopId)}]. Will retry after ${backoffMs / 1000}s.`);
                            // Do NOT send error to frontend, just keep lastKnownData
                            // Users will keep seeing the last data and loading spinner
                        } else {
                            // For other errors, log and send error to users
                            console.error(`[ERROR] Polling for [${stopId}] failed:`, error.message);
                            const usersToNotify = usersMonitoringStop.get(stopId);
                            if (usersToNotify && usersToNotify.size > 0) {
                                usersToNotify.forEach(userSocketId => {
                                    const userSocket = io.sockets.sockets.get(userSocketId);
                                    if (userSocket) {
                                        userSocket.emit('departureError', { stopId, error: 'Failed to fetch new departure data.' });
                                    }
                                });
                            }
                        }
                    }
                };
                fetchData();
                const intervalId = setInterval(fetchData, POLLING_INTERVAL);
                activeTimers.set(stopId, { intervalId });
            }
            return;
        }
        // If we have cached data in memory, send it immediately
        const cachedEntry = lastKnownData.get(stopId);
        if (cachedEntry) {
            if (isCacheFresh(cachedEntry.timestamp)) {
                console.log(`[CACHE] [${stopId} | ${stopName}] Serving fresh cached data (age: ${formatCacheAge(cachedEntry.timestamp)})`);
                socket.emit('departureData', cachedEntry.data);
            } else {
                console.log(`[CACHE] [${stopId} | ${stopName}] Cached data is stale (age: ${formatCacheAge(cachedEntry.timestamp)}), user will see loading while fetching fresh data`);
            }
        } else {
            console.log(`[POLL] [${stopId} | ${stopName}] No cached data available, user ${socket.id} will see loading`);
        }
        // If this is the first user for this stop, start polling
        if (!activeTimers.has(stopId)) {
            const stopEntry = processedStopsCache.find(stop => stop.gtfsId === stopId || (Array.isArray(stop.gtfsIds) && stop.gtfsIds.includes(stopId)));
            const gtfsIds = stopEntry && Array.isArray(stopEntry.gtfsIds) && stopEntry.gtfsIds.length > 0
                ? stopEntry.gtfsIds
                : [stopId];
            const fetchData = async () => {
                // If rate-limited, skip fetch until backoff expires
                if (rateLimitedStations.has(stopId)) {
                    const { until } = rateLimitedStations.get(stopId);
                    if (Date.now() < until) {
                        console.log(`[POLL] [${stopId}] Skipping fetch due to rate limit until ${new Date(until).toISOString()}`);
                        return;
                    } else {
                        rateLimitedStations.delete(stopId);
                    }
                }
                
                // Check if we have fresh cached data
                const cachedEntry = lastKnownData.get(stopId);
                if (cachedEntry && isCacheFresh(cachedEntry.timestamp)) {
                    console.log(`[CACHE] [${stopId} | ${getStopNameById(stopId)}] Using fresh cached data (age: ${formatCacheAge(cachedEntry.timestamp)})`);
                    // Send cached data to users
                    const usersToNotify = usersMonitoringStop.get(stopId);
                    if (usersToNotify && usersToNotify.size > 0) {
                        usersToNotify.forEach(userSocketId => {
                            const userSocket = io.sockets.sockets.get(userSocketId);
                            if (userSocket) {
                                userSocket.emit('departureData', cachedEntry.data);
                            }
                        });
                    }
                    return;
                }
                
                // Cache is stale or doesn't exist, fetch fresh data
                if (cachedEntry) {
                    console.log(`[CACHE] [${stopId} | ${getStopNameById(stopId)}] Cached data is stale (age: ${formatCacheAge(cachedEntry.timestamp)}), fetching fresh data`);
                } else {
                    console.log(`[CACHE] [${stopId} | ${getStopNameById(stopId)}] No cached data available, fetching fresh data`);
                }
                
                try {
                    const allDepartures = await Promise.all(gtfsIds.map(id => fetchDeparturesFromPID(id)));
                    const mergedDepartures = allDepartures.reduce((acc, data) => {
                        if (Array.isArray(data.departures)) {
                            acc.push(...data.departures);
                        }
                        return acc;
                    }, []);
                    const dedupedDepartures = Array.from(new Map(mergedDepartures.map(dep => [dep.trip?.id + '-' + (dep.departure_timestamp?.predicted || dep.departure_timestamp?.scheduled), dep])).values());
                    dedupedDepartures.sort((a, b) => {
                        const timeA = a.departure_timestamp?.predicted || a.departure_timestamp?.scheduled || 0;
                        const timeB = b.departure_timestamp?.predicted || b.departure_timestamp?.scheduled || 0;
                        return timeA - timeB;
                    });
                    const mergedData = { departures: dedupedDepartures };
                    const timestamp = Date.now();
                    
                    // Store with timestamp
                    lastKnownData.set(stopId, { data: mergedData, timestamp });
                    tempFileCache[stopId] = { data: mergedData, timestamp };
                    await saveTempCache(tempFileCache);
                    
                    console.log(`[POLL] [${stopId} | ${getStopNameById(stopId)}] Fresh data fetched from PID API and cached (timestamp: ${new Date(timestamp).toISOString()})`);
                    
                    // Send to all users monitoring this stop
                    const usersToNotify = usersMonitoringStop.get(stopId);
                    if (usersToNotify && usersToNotify.size > 0) {
                        console.log(`[POLL] [${stopId} | ${getStopNameById(stopId)}] Emitting fresh data to ${usersToNotify.size} user(s)`);
                        usersToNotify.forEach(userSocketId => {
                            const userSocket = io.sockets.sockets.get(userSocketId);
                            if (userSocket) {
                                userSocket.emit('departureData', mergedData);
                            }
                        });
                    }
                } catch (error) {
                    // Handle 429 Too Many Requests
                    if (error.message && error.message.includes('429')) {
                        const backoffMs = 10000; // 10 seconds
                        const until = Date.now() + backoffMs;
                        rateLimitedStations.set(stopId, { until });
                        console.warn(`[API LIMIT] [POLL] PID API rate limit (429) for [${stopId} | ${getStopNameById(stopId)}]. Will retry after ${backoffMs / 1000}s.`);
                        // Do NOT send error to frontend, just keep lastKnownData
                        // Users will keep seeing the last data and loading spinner
                    } else {
                        // For other errors, log and send error to users
                        console.error(`[ERROR] Polling for [${stopId}] failed:`, error.message);
                        const usersToNotify = usersMonitoringStop.get(stopId);
                        if (usersToNotify && usersToNotify.size > 0) {
                            usersToNotify.forEach(userSocketId => {
                                const userSocket = io.sockets.sockets.get(userSocketId);
                                if (userSocket) {
                                    userSocket.emit('departureError', { stopId, error: 'Failed to fetch new departure data.' });
                                }
                            });
                        }
                    }
                }
            };
            fetchData();
            const intervalId = setInterval(fetchData, POLLING_INTERVAL);
            activeTimers.set(stopId, { intervalId });
        }
        // If already polling, do nothing (data will be sent on next poll)
    });

    socket.on('stopDepartureMonitoring', (stopId) => {
        if (usersMonitoringStop.has(stopId) && usersMonitoringStop.get(stopId).has(socket.id)) {
            // Remove user from monitoring set
            usersMonitoringStop.get(stopId).delete(socket.id);
            
            // Count how many users are still monitoring this stop
            const stillMonitoring = usersMonitoringStop.get(stopId).size;
            
            if (stillMonitoring > 0) {
                const stopName = getStopNameById(stopId);
                if (DEBUG_LOGS) console.log(`[POLL] [${stopId} | ${stopName}] User ${socket.id} stopped monitoring. Still ${stillMonitoring} user(s) monitoring this stop.`);
            } else {
                const stopName = getStopNameById(stopId);
                console.log(`[POLL] [${stopId} | ${stopName}] No users are monitoring this stop now. Polling stopped and cache cleared.`);
                
                // Stop polling if no users are monitoring this stop
                if (activeTimers.has(stopId)) {
                    clearInterval(activeTimers.get(stopId).intervalId);
                    activeTimers.delete(stopId);
                    lastKnownData.delete(stopId);
                }
                
                // Clean up the monitoring set
                usersMonitoringStop.delete(stopId);
            }
        } else {
            const stopName = getStopNameById(stopId);
            if (DEBUG_LOGS) console.log(`[POLL] [${stopId} | ${stopName}] User ${socket.id} tried to stop monitoring but was not monitoring it.`);
        }
    });

    socket.on('disconnect', () => {
        console.log(`[INFO] User disconnected: ${socket.id}. Will stop sending data to this user. Total users now: ${io.engine.clientsCount}`);
        let stopsAffected = [];
        
        // Remove user from all monitoring sets
        for (const [stopId, userSet] of usersMonitoringStop.entries()) {
            if (userSet.has(socket.id)) {
                userSet.delete(socket.id);
                stopsAffected.push(stopId);
                
                // If no users are monitoring this stop, stop polling
                if (userSet.size === 0) {
                    const stopName = getStopNameById(stopId);
                    console.log(`[CLEANUP] User ${socket.id} disconnected and stopped monitoring stop [${stopId} | ${stopName}]. No users are monitoring this stop now.`);
                    
                    // Stop polling if no users are monitoring this stop
                    if (activeTimers.has(stopId)) {
                        clearInterval(activeTimers.get(stopId).intervalId);
                        activeTimers.delete(stopId);
                        lastKnownData.delete(stopId);
                    }
                    
                    // Clean up the monitoring set
                    usersMonitoringStop.delete(stopId);
                } else {
                    const stopName = getStopNameById(stopId);
                    console.log(`[CLEANUP] User ${socket.id} disconnected and stopped monitoring stop [${stopId} | ${stopName}]. Still ${userSet.size} user(s) monitoring this stop.`);
                }
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