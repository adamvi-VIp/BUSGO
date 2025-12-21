import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import axios from 'axios';
import dotenv from 'dotenv';
import fs from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';

// --- Configuration & Constants ---
const DEBUG_LOGS = false;
const CACHE_DIR = './server/cache';
const STATIONS_FILE = path.join(CACHE_DIR, 'stations.json');
const LINES_FILE = path.join(CACHE_DIR, 'lines.json');
const DEPARTURES_CACHE_FILE = path.join(CACHE_DIR, 'departures.json');

const STOPS_JSON_URL = 'https://data.pid.cz/stops/json/stops.json';
const LINES_JSON_URL = 'https://data.pid.cz/geodata/Linky_WGS84.json';
const GOLEMIO_API_BASE = 'https://api.golemio.cz/v2';
const GOLEMIO_DEPARTURES_URL = `${GOLEMIO_API_BASE}/pid/departureboards`;
const GOLEMIO_STOP_TIMES_URL = 'https://api.golemio.cz/v2/gtfs/stoptimes';

const POLLING_INTERVAL = 10000; // 10 seconds
const DEPARTURE_CACHE_MAX_AGE_MS = 8000; // 8 seconds

// --- State Variables ---
let processedStopsCache = [];
let processedLinesCache = [];
let tempDepartureCache = {}; // In-memory mirror of departures.json

// Real-time polling state
const activeTimers = new Map(); // key: stopId
const lastKnownData = new Map(); // key: stopId, value: { data: {...}, timestamp: number }
const usersMonitoringStop = new Map(); // key: stopId, value: Set<socketId>
const rateLimitedStations = new Map(); // key: stopId, value: { until: timestamp }

// --- Environment Setup ---
if (process.env.NODE_ENV !== 'production') {
    dotenv.config();
}

const app = express();
const server = createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*", // Allow all origins for dev
        methods: ["GET", "POST"]
    },
});

// --- CRASH PREVENTION ---
process.on('uncaughtException', (err) => {
    console.error('[CRITICAL] Uncaught Exception:', err);
    // Keep server running
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('[CRITICAL] Unhandled Rejection at:', promise, 'reason:', reason);
    // Keep server running
});

const PORT = process.env.PORT || 3001;

// --- API Key ---
function getApiKey() {
    const apiKey = process.env.PID_API_KEY;
    if (apiKey) return apiKey;
    console.error('[FATAL] PID_API_KEY is missing!');
    return null;
}
const API_KEY = getApiKey();

// --- Helper Functions ---
function deg2rad(deg) { return deg * (Math.PI / 180); }

function getDistanceFromLatLonInKm(lat1, lon1, lat2, lon2) {
    var R = 6371; // Radius in km
    var dLat = deg2rad(lat2 - lat1);
    var dLon = deg2rad(lon2 - lon1);
    var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

function getStopNameById(stopId) {
    const stop = processedStopsCache.find(stop => stop.gtfsId === stopId || (Array.isArray(stop.gtfsIds) && stop.gtfsIds.includes(stopId)));
    return stop ? stop.name : 'Unknown';
}

function formatTime(date) {
    return date.toTimeString().split(' ')[0];
}

// --- Spatial Filtering ---
function filterGeometry(geometry, stops) {
    if (!geometry || !stops || stops.length === 0) return geometry;
    if (geometry.type !== 'MultiLineString' && geometry.type !== 'LineString') return geometry;

    const segments = geometry.type === 'LineString' ? [geometry.coordinates] : geometry.coordinates;
    const stopMatchingThresholdKm = 0.25; // 250m for stop-to-segment mapping
    const connectivityThresholdKm = 0.3;  // 300m to bridge data gaps (initial graph)
    const tightConnectionThresholdKm = 0.02; // 20m for "physical touch" weight boost

    // 1. Map each stop to one or more potential segment indices
    const stopSegments = stops.map(stop => {
        const matches = [];
        let minDist = Infinity;
        let bestIdx = -1;

        segments.forEach((line, idx) => {
            let localMin = Infinity;
            line.forEach(p => {
                const d = getDistanceFromLatLonInKm(stop.lat, stop.lon, p[1], p[0]);
                if (d < localMin) localMin = d;
            });

            if (localMin < stopMatchingThresholdKm) {
                matches.push({ idx, dist: localMin });
            }
            if (localMin < minDist) {
                minDist = localMin;
                bestIdx = idx;
            }
        });

        // Refinement: If we have very close matches (< 50m), prefer them exclusively
        // This prevents shortcuts (e.g. 150m away) from being used as start/end points if the 
        // real segment is right there (0-20m away).
        const tightMatches = matches.filter(m => m.dist < 0.05);
        if (tightMatches.length > 0) {
            return tightMatches.map(m => m.idx);
        }

        if (matches.length === 0 && bestIdx !== -1) {
            matches.push({ idx: bestIdx, dist: minDist });
        }
        return matches.map(m => m.idx);
    });

    // 2. Build connectivity graph with weights
    // weight 1: physically touching or nearly touching
    // weight 10-100: bridging a gap (penalty to avoid "skipping" real turns if a shortcut exists)
    const adj = Array.from({ length: segments.length }, () => []);
    for (let i = 0; i < segments.length; i++) {
        for (let j = i + 1; j < segments.length; j++) {
            const segA = segments[i];
            const segB = segments[j];
            const endA = [segA[0], segA[segA.length - 1]];
            const endB = [segB[0], segB[segB.length - 1]];

            let minGap = Infinity;

            // Check endpoint distances
            endA.forEach(pA => {
                endB.forEach(pB => {
                    const d = getDistanceFromLatLonInKm(pA[1], pA[0], pB[1], pB[0]);
                    if (d < minGap) minGap = d;
                });
            });

            // Resilient T-junction check
            if (minGap > tightConnectionThresholdKm) {
                endA.forEach(pA => {
                    segB.forEach(pB => {
                        const d = getDistanceFromLatLonInKm(pA[1], pA[0], pB[1], pB[0]);
                        if (d < minGap) minGap = d;
                    });
                });
                endB.forEach(pB => {
                    segA.forEach(pA => {
                        const d = getDistanceFromLatLonInKm(pB[1], pB[0], pA[1], pA[0]);
                        if (d < minGap) minGap = d;
                    });
                });
            }

            if (minGap < connectivityThresholdKm) {
                // Weight logic: 1 for touching, scaling up for gaps
                const weight = minGap < tightConnectionThresholdKm ? 1 : Math.ceil(minGap * 500);
                adj[i].push({ to: j, weight });
                adj[j].push({ to: i, weight });
            }
        }
    }

    const keepIndices = new Set();

    // 3. Dijkstra-style Pathfinding
    for (let i = 0; i < stopSegments.length - 1; i++) {
        const starts = stopSegments[i];
        const ends = stopSegments[i + 1];
        if (starts.length === 0 || ends.length === 0) continue;

        // BFS simulation with weight tracking (Dijkstra)
        const queue = starts.map(s => ({ node: s, weight: 0, path: [s] }));
        const visited = new Map(); // node -> min weight to reach
        starts.forEach(s => visited.set(s, 0));

        let bestPath = null;
        let minWeightFound = Infinity;

        while (queue.length > 0) {
            // Priority: smallest total weight first
            queue.sort((a, b) => a.weight - b.weight);
            const { node, weight, path } = queue.shift();

            if (weight > minWeightFound) continue;

            if (ends.includes(node)) {
                if (weight < minWeightFound) {
                    minWeightFound = weight;
                    bestPath = path;
                }
                continue;
            }

            if (path.length > 100) continue;

            for (const edge of adj[node]) {
                const newWeight = weight + edge.weight;
                if (!visited.has(edge.to) || visited.get(edge.to) > newWeight) {
                    visited.set(edge.to, newWeight);
                    queue.push({ node: edge.to, weight: newWeight, path: [...path, edge.to] });
                }
            }
        }

        if (bestPath) {
            bestPath.forEach(idx => keepIndices.add(idx));
        } else {
            // Fallback: More generous spatial buffer if pathfinding fails
            const stopA = stops[i];
            const stopB = stops[i + 1];
            const centerLat = (stopA.lat + stopB.lat) / 2;
            const centerLon = (stopA.lon + stopB.lon) / 2;
            const distBetweenStops = getDistanceFromLatLonInKm(stopA.lat, stopA.lon, stopB.lat, stopB.lon);
            const radius = distBetweenStops / 2 + 0.5; // 500m buffer

            segments.forEach((line, idx) => {
                const isNear = line.some(p => getDistanceFromLatLonInKm(centerLat, centerLon, p[1], p[0]) < radius);
                if (isNear) keepIndices.add(idx);
            });
        }
    }

    // Always keep segments near the first and last stops
    if (stopSegments.length > 0) {
        stopSegments[0].forEach(idx => keepIndices.add(idx));
        stopSegments[stopSegments.length - 1].forEach(idx => keepIndices.add(idx));
    }

    // Safety: If we filtered everything (shouldn't happen), return original
    if (keepIndices.size === 0) return geometry;

    return {
        type: 'MultiLineString',
        coordinates: segments.filter((_, idx) => keepIndices.has(idx))
    };
}

// --- Terminal UI ---
function printStatus() {
    console.clear();
    console.log('\n===================================================');
    console.log('|       🚌 PID Departures Backend Server          |');
    console.log('===================================================');
    console.log(`| [SERVER]  Status:        ONLINE                |`);
    console.log(`|           Port:          ${process.env.PORT || 3001}                  |`);
    console.log(`|           PID API Key:   ${API_KEY ? 'YES' : 'NO'}                   |`);
    console.log('---------------------------------------------------');
    console.log(`| [CLIENTS] Connected:     ${io.engine.clientsCount}                     |`);
    console.log('---------------------------------------------------');

    // Stations Cache Status
    const stationsCount = processedStopsCache.length;
    console.log(`| [CACHE]   Stations:      ${stationsCount.toString().padEnd(6)} (24h refresh)   |`);

    // Lines Cache Status
    const linesCount = processedLinesCache.features ? processedLinesCache.features.length : 0;
    console.log(`| [CACHE]   Lines:         ${linesCount.toString().padEnd(6)} (24h refresh)   |`);

    // Departures Cache Status
    const departuresCount = Object.keys(tempDepartureCache).length;
    console.log(`| [CACHE]   Departures:    ${departuresCount.toString().padEnd(6)} (Active)        |`);

    // Polling Status
    const activePolls = activeTimers.size;
    console.log(`| [POLL]    Active Timers: ${activePolls.toString().padEnd(6)}                |`);
    console.log('===================================================');

    if (DEBUG_LOGS) {
        console.log('\n--- Real-time Logs ---');
    }
}

// Log wrapper to preserve UI if not debugging, or just log
function log(message) {
    if (DEBUG_LOGS) {
        console.log(`[${formatTime(new Date())}] ${message}`);
    } else {
        // In non-debug mode, we repaint the status continuously only on significant events or interval
        // But for standard logs, we might want to just printStatus() updates.
        // For simplicity, let's keep printStatus on interval or major events, and ignore spammy logs.
    }
}

// Important events always trigger a repaint
function updateStatusUI() {
    if (!DEBUG_LOGS) printStatus();
}


// --- File Caching Logic ---

async function ensureCacheDir() {
    try {
        await fs.access(CACHE_DIR);
    } catch {
        await fs.mkdir(CACHE_DIR, { recursive: true });
    }
}

async function loadJsonFile(filePath, defaultValue = null) {
    try {
        const data = await fs.readFile(filePath, 'utf-8');
        return JSON.parse(data);
    } catch (e) {
        return defaultValue;
    }
}

async function saveJsonFile(filePath, data) {
    try {
        await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
    } catch (e) {
        console.error(`[Meta] Failed to write cache file ${filePath}: ${e.message}`);
    }
}

// --- Specific Cachers ---

async function refreshStationsCache() {
    try {
        if (DEBUG_LOGS) console.log(`[CACHE] Downloading stations...`);
        const response = await axios.get(STOPS_JSON_URL);
        if (response.data && Array.isArray(response.data.stopGroups)) {
            const allStops = response.data.stopGroups.flatMap(group =>
                group.stops.map(stop => ({
                    ...stop,
                    groupName: group.name,
                }))
            );
            const rawStops = allStops
                .filter(stop => stop.gtfsIds && stop.gtfsIds[0])
                .map((stop) => {
                    const gtfsId = stop.gtfsIds[0];
                    return {
                        uniqueStopPointId: gtfsId, // Stable ID: use directly
                        gtfsId: gtfsId,
                        gtfsIds: stop.gtfsIds,
                        name: stop.groupName,
                        lat: stop.lat,
                        lon: stop.lon,
                        zone: stop.zone,
                        wheelchairAccess: stop.wheelchairAccess,
                        platform: stop.platform || null,
                        lines: stop.lines || [],
                        mainTrafficType: (() => {
                            // Professional refinement of traffic type
                            if (stop.mainTrafficType === 'metro' || stop.type === 'metro') {
                                const lines = stop.lines || [];
                                if (lines.some(l => l.name === 'A')) return 'metroA';
                                if (lines.some(l => l.name === 'B')) return 'metroB';
                                if (lines.some(l => l.name === 'C')) return 'metroC';
                                return 'metroA'; // Fallback
                            }
                            return stop.mainTrafficType || stop.type || 'bus';
                        })(),
                        is_night: (() => {
                            const lines = stop.lines || [];
                            if (lines.length === 0) return stop.is_night || false;

                            // Check if ALL lines are night lines
                            const allNight = lines.every(line => {
                                if (line.isNight === true) return true;
                                if (line.isNight === false) return false;

                                // Fallback heuristic if isNight not present
                                const name = line.name || '';
                                const type = line.type || '';
                                const n = parseInt(name, 10);
                                if (isNaN(n)) return false;

                                if (type === 'tram') {
                                    return n >= 90 && n <= 99;
                                }
                                if (type === 'bus') {
                                    return n >= 900 && n <= 999;
                                }
                                return false;
                            });

                            return allNight;
                        })()
                    };
                });

            // --- PROXIMITY GROUPING (±0.01m) ---
            const groupedStops = [];
            const THRESHOLD_KM = 0.05; // 50 meters (increased from 0.01m to deduplicate physical locations)

            for (const stop of rawStops) {
                // Find potential existing group within threshold AND with same/similar name
                let group = groupedStops.find(g => {
                    const dist = getDistanceFromLatLonInKm(stop.lat, stop.lon, g.lat, g.lon);
                    if (dist >= THRESHOLD_KM) return false;

                    // Name matching check: normalized comparison
                    const n1 = stop.name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
                    const n2 = g.name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

                    // If names are reasonably similar or one contains the other, they belong together
                    return n1.includes(n2) || n2.includes(n1);
                });

                if (group) {
                    // Merge into existing group
                    // Merge GTFS IDs
                    group.gtfsIds = Array.from(new Set([...group.gtfsIds, ...stop.gtfsIds]));

                    // Merge lines (unique by line name/direction)
                    const lineMap = new Map();
                    [...group.lines, ...stop.lines].forEach(l => {
                        const key = `${l.name}-${l.direction}-${l.direction2}`;
                        if (!lineMap.has(key)) lineMap.set(key, l);
                    });
                    group.lines = Array.from(lineMap.values());

                    // Merge is_night (if any part is not night, the whole isn't necessarily night, 
                    // but usually these are same physical location so they should match. 
                    // We'll use AND logic: if both are night, stay night.)
                    group.is_night = group.is_night && stop.is_night;

                    // If one has platform and other doesn't, keep the platform. 
                    // If both have different platforms, we could join them, but usually 
                    // these are just duplicate entries for the same physical pole.
                    if (!group.platform && stop.platform) group.platform = stop.platform;
                } else {
                    // Start new group
                    groupedStops.push({ ...stop });
                }
            }

            processedStopsCache = groupedStops;
            await saveJsonFile(STATIONS_FILE, processedStopsCache);
            updateStatusUI();
        }
    } catch (error) {
        console.error('[CACHE] Failed to refresh stations:', error.message);
    }
}

async function refreshLinesCache() {
    try {
        if (DEBUG_LOGS) console.log(`[CACHE] Downloading lines...`);
        const response = await axios.get(LINES_JSON_URL);
        if (response.data) {
            processedLinesCache = response.data;
            await saveJsonFile(LINES_FILE, processedLinesCache);
            updateStatusUI();
        }
    } catch (error) {
        console.error('[CACHE] Failed to refresh lines:', error.message);
    }
}

async function initCaches() {
    await ensureCacheDir();

    // 1. Load Stations
    const cachedStations = await loadJsonFile(STATIONS_FILE);
    if (cachedStations) {
        processedStopsCache = cachedStations;
    } else {
        await refreshStationsCache();
    }

    // 2. Load Lines
    const cachedLines = await loadJsonFile(LINES_FILE);
    if (cachedLines) {
        processedLinesCache = cachedLines;
    } else {
        await refreshLinesCache();
    }

    // 3. Load Departures (Persistent)
    tempDepartureCache = await loadJsonFile(DEPARTURES_CACHE_FILE, {});
    // Hydrate in-memory lastKnownData from disk cache
    for (const stopId in tempDepartureCache) {
        const entry = tempDepartureCache[stopId];
        if (entry && entry.data && entry.timestamp) {
            lastKnownData.set(stopId, { data: entry.data, timestamp: entry.timestamp });
        }
    }

    updateStatusUI();

    // Schedule 24h updates
    setInterval(refreshStationsCache, 24 * 60 * 60 * 1000);
    setInterval(refreshLinesCache, 24 * 60 * 60 * 1000);
}


// --- API Fetching ---

function filterNextDeparturesOnly(departures) {
    if (!Array.isArray(departures) || departures.length === 0) return [];
    const departuresByLine = {};
    departures.forEach(departure => {
        const route = departure.route;
        const lineNumber = route?.short_name || 'Unknown';
        if (!departuresByLine[lineNumber]) departuresByLine[lineNumber] = [];
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
        nextDepartures.push(...lineDepartures.slice(0, 6));
    });
    nextDepartures.sort((a, b) => {
        const timeA = a.departure_timestamp?.predicted || a.departure_timestamp?.scheduled || 0;
        const timeB = b.departure_timestamp?.predicted || b.departure_timestamp?.scheduled || 0;
        return timeA - timeB;
    });
    return nextDepartures;
}

async function fetchDeparturesFromPID(stopId) {
    if (!API_KEY) throw new Error("API key is missing");
    const url = `${GOLEMIO_DEPARTURES_URL}?ids[]=${stopId}&limit=120&minutesAfter=180`;
    try {
        const response = await axios.get(url, {
            headers: { 'x-access-token': API_KEY, 'Content-Type': 'application/json' },
            timeout: 5000
        });
        if (response.data && Array.isArray(response.data.departures)) {
            const filteredDepartures = filterNextDeparturesOnly(response.data.departures);
            return { ...response.data, departures: filteredDepartures };
        }
        return { departures: [] };
    } catch (error) {
        if (error.response?.status === 429) {
            throw new Error(`429 Rate Limit`);
        }
        throw new Error(`Fetch failed: ${error.message}`);
    }
}

async function fetchTripStops(tripId) {
    if (!API_KEY) throw new Error("API key is missing");

    // Use Public GTFS Static Lookup (v2) which reliably returns stop sequences for live trips
    const url = `https://api.golemio.cz/v2/public/gtfs/trips/${tripId}?scopes=stop_times`;

    try {
        if (DEBUG_LOGS) console.log(`[API] Fetching trip stops (Public Lookup): ${url}`);
        const response = await axios.get(url, {
            headers: { 'x-access-token': API_KEY, 'Content-Type': 'application/json' },
            timeout: 8000
        });

        // The response is a FeatureCollection if scoped with stop_times
        if (response.data && response.data.stop_times && Array.isArray(response.data.stop_times.features)) {
            const features = response.data.stop_times.features;
            if (DEBUG_LOGS) console.log(`[API] Found ${features.length} features for trip ${tripId}`);

            // Map features to the expected stop format, resolving stop_id via coordinates if missing
            const resolvedStops = features.map(feature => {
                const props = feature.properties || {};
                const coords = feature.geometry?.coordinates || []; // [lon, lat]

                let stopId = props.stop_id;
                let resolvedUniqueId = null;
                let resolvedStation = null;

                // 1. Try to find the station in our cache that contains this GTFS ID
                if (stopId) {
                    resolvedStation = processedStopsCache.find(s =>
                        s.gtfsId === stopId || (Array.isArray(s.gtfsIds) && s.gtfsIds.includes(stopId))
                    );
                    if (resolvedStation) resolvedUniqueId = resolvedStation.uniqueStopPointId;
                }

                // 2. Fallback: match by coordinates if ID not found or missing
                if (!resolvedUniqueId && coords.length === 2) {
                    const lon = coords[0];
                    const lat = coords[1];
                    let closest = null;
                    let minDist = 0.1; // 100m threshold (increased for better stability)

                    for (const station of processedStopsCache) {
                        const dist = getDistanceFromLatLonInKm(lat, lon, station.lat, station.lon);
                        if (dist < minDist) {
                            minDist = dist;
                            closest = station;
                        }
                    }

                    if (closest) {
                        resolvedStation = closest;
                        resolvedUniqueId = closest.uniqueStopPointId;
                    }
                }

                return {
                    stop_id: String(resolvedUniqueId || stopId || `lat:${coords[1]}:lon:${coords[0]}`), // Fallback & Force String
                    stop_name: props.stop_name,
                    arrival_time: props.arrival_time,
                    departure_time: props.departure_time,
                    stop_sequence: props.stop_sequence,
                    lat: coords[1],
                    lon: coords[0],
                    mainTrafficType: resolvedStation?.mainTrafficType || null,
                    is_night: resolvedStation?.is_night || false
                };
            });

            // Sort by sequence to ensure connectivity logic works
            resolvedStops.sort((a, b) => (a.stop_sequence || 0) - (b.stop_sequence || 0));

            return resolvedStops;
        }

        // Fallback for empty or different structure
        return [];
    } catch (error) {
        console.error(`[API] Fetch trip stops failed for ${url}: ${error.response ? error.response.status : error.message}`);
        return [];
    }
}

// --- Socket Logic ---

io.on('connection', (socket) => {
    updateStatusUI();

    socket.on('searchStops', async (params) => {
        if (!processedStopsCache.length) {
            return socket.emit('stopsError', { error: 'Stop data initializing...' });
        }

        let results = [];
        if (params?.query) {
            const query = params.query.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
            results = processedStopsCache.filter(stop =>
                stop.name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").includes(query)
            ).slice(0, 100);
        } else {
            // Geographic search
            const lat = params?.lat || 50.0874654; // Default Prague
            const lon = params?.lon || 14.4212535;
            results = processedStopsCache
                .map(stop => ({
                    ...stop,
                    distance: getDistanceFromLatLonInKm(lat, lon, stop.lat, stop.lon)
                }))
                .filter(stop => stop.distance <= 3);

            // Optimization: If map movement, we might assume user wants everything nearby
        }
        socket.emit('stopsData', {
            stops: results,
            source: params?.source // Pass back source for frontend handling
        });
    });

    const clearMonitoringForSocket = (socketId) => {
        usersMonitoringStop.forEach((users, stopId) => {
            if (users.has(socketId)) {
                users.delete(socketId);
                if (users.size === 0) {
                    stopPolling(stopId);
                    usersMonitoringStop.delete(stopId);
                }
            }
        });
    };

    socket.on('requestDepartures', async (stopId) => {
        try {
            console.log(`[SOCKET] Received requestDepartures for stopId: ${stopId}`);
            if (!stopId) {
                console.warn('[SOCKET] Request missing stopId');
                return;
            }

            // One user, one timer: Clear any existing monitoring for this socket before starting new
            clearMonitoringForSocket(socket.id);

            // Track user
            if (!usersMonitoringStop.has(stopId)) usersMonitoringStop.set(stopId, new Set());
            usersMonitoringStop.get(stopId).add(socket.id);

            // Serve Cache Immediately?
            const now = Date.now();
            const cached = tempDepartureCache[stopId];

            if (cached && (now - cached.timestamp < DEPARTURE_CACHE_MAX_AGE_MS)) {
                // Allow 8s freshness
                console.log(`[SOCKET] Serving fresh cache for ${stopId}`);
                socket.emit('departureData', cached.data);
            } else if (cached) {
                // Serve stale cache while loading
                console.log(`[SOCKET] Serving stale cache for ${stopId} while refreshing`);
                socket.emit('departureData', cached.data);
            } else {
                console.log(`[SOCKET] No cache for ${stopId}, waiting for poll...`);
            }

            // Start polling if not active
            if (!activeTimers.has(stopId)) {
                startPolling(stopId);
            }
            updateStatusUI();
        } catch (err) {
            console.error('[SOCKET] Error in requestDepartures:', err);
            socket.emit('departureError', { stopId, error: 'Internal server error processing departures.' });
        }
    });

    socket.on('stopDepartureMonitoring', (stopId) => {
        if (usersMonitoringStop.has(stopId)) {
            usersMonitoringStop.get(stopId).delete(socket.id);
            if (usersMonitoringStop.get(stopId).size === 0) {
                stopPolling(stopId);
                usersMonitoringStop.delete(stopId);
            }
        }
        updateStatusUI();
    });

    socket.on('disconnect', () => {
        clearMonitoringForSocket(socket.id);
        updateStatusUI();
    });


    socket.on('getTripPath', async (tripData) => {
        try {
            let tripId = tripData;

            // Support receiving full trip object to find correct GTFS ID
            if (typeof tripData === 'object' && tripData !== null) {
                if (DEBUG_LOGS) console.log(`[DEBUG] Trip Object Keys: ${Object.keys(tripData).join(', ')}`);

                // Try to find a GTFS-specific ID field
                if (tripData.gtfs_trip_id) {
                    tripId = tripData.gtfs_trip_id;
                    if (DEBUG_LOGS) console.log(`[API] Using GTFS Trip ID: ${tripId} (instead of ${tripData.id})`);
                } else if (tripData.start_timestamp) {
                    tripId = tripData.id;
                } else {
                    tripId = tripData.id;
                }
            }

            if (!tripId) return;

            const stops = await fetchTripStops(tripId);
            if (!stops || stops.length === 0) {
                const clientTripId = (typeof tripData === 'object' && tripData.id) ? tripData.id : tripId;
                socket.emit('tripPathError', { tripId: clientTripId, error: 'No trip path data found.' });
                return;
            }

            // Derive Route ID and find geometry (e.g. 377_... -> L377)
            let geometry = null;
            try {
                const rawLine = tripId.split('_')[0];
                const routeId = `L${rawLine}`;

                if (processedLinesCache && Array.isArray(processedLinesCache.features)) {
                    // Find ALL features for this route (variants might be in separate features)
                    const matchingFeatures = processedLinesCache.features.filter(f => {
                        const props = f.properties || {};
                        const rid = (props.route_id || props.ROUTE_ID || '').toString().toUpperCase();
                        const rsn = (props.route_short_name || props.V_LINKA || '').toString();
                        return rid === routeId || rsn === rawLine;
                    });

                    if (matchingFeatures.length > 0) {
                        if (DEBUG_LOGS) console.log(`[API] Found ${matchingFeatures.length} geometry features for linka ${rawLine}`);

                        // Collect all segments from all matching features
                        let allSegments = [];
                        matchingFeatures.forEach(f => {
                            if (f.geometry.type === 'LineString') {
                                allSegments.push(f.geometry.coordinates);
                            } else if (f.geometry.type === 'MultiLineString') {
                                allSegments.push(...f.geometry.coordinates);
                            }
                        });

                        geometry = {
                            type: 'MultiLineString',
                            coordinates: allSegments
                        };
                    }
                }
            } catch (e) {
                console.error('[API] Error deriving route geometry:', e);
            }

            // Apply spatial filter to keep only relevant segments
            if (geometry && stops && stops.length > 0) {
                geometry = filterGeometry(geometry, stops);
            }

            // Return correct ID context for client
            const clientTripId = (typeof tripData === 'object' && tripData.id) ? tripData.id : tripId;

            socket.emit('tripPathData', { tripId: clientTripId, stops, geometry });
        } catch (err) {
            console.error('[SOCKET] Error in getTripPath:', err);
            const clientTripId = (typeof tripData === 'object' && tripData.id) ? tripData.id : 'unknown';
            socket.emit('tripPathError', { tripId: clientTripId, error: 'Internal server error fetching trip path.' });
        }
    });
});

// --- Polling Logic ---

function stopPolling(stopId) {
    if (activeTimers.has(stopId)) {
        clearInterval(activeTimers.get(stopId).intervalId);
        activeTimers.delete(stopId);
    }
}

function startPolling(stopId) {
    // Identity resolution
    const stopEntry = processedStopsCache.find(stop => stop.gtfsId === stopId);
    const gtfsIds = stopEntry?.gtfsIds || [stopId];

    const fetchData = async () => {
        // Rate limit check
        if (rateLimitedStations.has(stopId)) {
            if (Date.now() < rateLimitedStations.get(stopId).until) return;
            rateLimitedStations.delete(stopId);
        }

        try {
            const allDepartures = await Promise.all(gtfsIds.map(id => fetchDeparturesFromPID(id)));
            const mergedDepartures = allDepartures.reduce((acc, d) => {
                if (Array.isArray(d.departures)) acc.push(...d.departures);
                return acc;
            }, []);

            // Deduplicate and sort
            const deduped = Array.from(new Map(mergedDepartures.map(dep =>
                [dep.trip?.id + '-' + (dep.departure_timestamp?.predicted || dep.departure_timestamp?.scheduled), dep]
            )).values());

            deduped.sort((a, b) => {
                const timeA = a.departure_timestamp?.predicted || a.departure_timestamp?.scheduled || 0;
                const timeB = b.departure_timestamp?.predicted || b.departure_timestamp?.scheduled || 0;
                return timeA - timeB;
            });

            const newData = { departures: deduped };
            const timestamp = Date.now();

            // Update caches
            lastKnownData.set(stopId, { data: newData, timestamp });
            tempDepartureCache[stopId] = { data: newData, timestamp };

            // Persist async (fire and forget)
            saveJsonFile(DEPARTURES_CACHE_FILE, tempDepartureCache);

            // Notify users
            const users = usersMonitoringStop.get(stopId);
            if (users) {
                users.forEach(sid => {
                    const s = io.sockets.sockets.get(sid);
                    if (s) s.emit('departureData', newData);
                });
            }

        } catch (error) {
            if (error.message.includes('429')) {
                const until = Date.now() + 10000;
                rateLimitedStations.set(stopId, { until });
                log(`[429] Rate limit for ${stopId}, pausing.`);
            } else {
                log(`[ERR] Fetch failed for ${stopId}: ${error.message}`);
            }
        }
    };

    fetchData(); // Immediate
    const intervalId = setInterval(fetchData, POLLING_INTERVAL);
    activeTimers.set(stopId, { intervalId });
}

// --- Start Server ---
// --- Start Server ---
server.listen(PORT, '0.0.0.0', () => {
    initCaches();
    updateStatusUI();
});
