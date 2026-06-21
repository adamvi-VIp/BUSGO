import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import axios from 'axios';
import dotenv from 'dotenv';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

// --- Configuration & Constants ---
const DEBUG_LOGS = false;
const SERVER_DIR = path.dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = path.join(SERVER_DIR, 'cache');
const STATIONS_FILE = path.join(CACHE_DIR, 'stations.json');
const DEPARTURES_CACHE_FILE = path.join(CACHE_DIR, 'departures.json');
const LINES_FILE = path.join(CACHE_DIR, 'lines.json');

const STOPS_JSON_URL = 'https://data.pid.cz/stops/json/stops.json';
const GOLEMIO_API_BASE = 'https://api.golemio.cz/v2';
const GOLEMIO_DEPARTURES_URL = `${GOLEMIO_API_BASE}/pid/departureboards`;
const GOLEMIO_GTFS_TRIPS_URL = `${GOLEMIO_API_BASE}/gtfs/trips`;
const GOLEMIO_GTFS_SHAPES_URL = `${GOLEMIO_API_BASE}/gtfs/shapes`;
const GOLEMIO_GTFS_STOPS_URL = `${GOLEMIO_API_BASE}/gtfs/stops`;
const GOLEMIO_VEHICLE_POSITIONS_URL = `${GOLEMIO_API_BASE}/vehiclepositions`;

const POLLING_INTERVAL = 10000; // 10 seconds
const DEPARTURE_CACHE_MAX_AGE_MS = 8000; // 8 seconds
const TRIP_PATH_CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours
const VEHICLE_POSITIONS_CACHE_MAX_AGE_MS = 3000; // 3 seconds

// --- State Variables ---
let processedStopsCache = [];
let tempDepartureCache = {}; // In-memory mirror of departures.json
const tripPathCache = new Map(); // key: tripId, value: { timestamp, data }
const shapeCache = new Map(); // key: shapeId, value: { timestamp, data }
let lineFeaturesCache = null;
let metroLinesCache = null;
let vehiclePositionsCache = { timestamp: 0, data: null };

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

function formatTime(date) {
    return date.toTimeString().split(' ')[0];
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
                // Find potential existing group:
                // 1. SHARED GTFS ID + VERY STRICT PROXIMITY (1m)
                // 2. Proximity (50m) + Name Match (Secondary)
                let group = groupedStops.find(g => {
                    const dist = getDistanceFromLatLonInKm(stop.lat, stop.lon, g.lat, g.lon);

                    // Check for shared GTFS IDs intersection
                    const sharedId = stop.gtfsIds.some(id => g.gtfsIds.includes(id));

                    // User Request: "1m" threshold for shared ID merge 
                    // This filters only exact API duplicates, preserving platforms that are distinct
                    if (sharedId && dist < 0.001) return true;

                    // STRICT MODE: If both have IDs but failed the strict merge above, 
                    // assume they are distinct platforms (e.g. "Platform A" vs "Platform B" of same station).
                    // Do NOT fall back to loose name/distance matching.
                    if (stop.gtfsIds.length > 0 && g.gtfsIds.length > 0) return false;

                    // Fallback to spatial naming check (only for stops WITHOUT rich IDs)
                    if (dist >= THRESHOLD_KM) return false;

                    // Name matching check
                    const n1 = stop.name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
                    const n2 = g.name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

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

                    // Merge is_night
                    group.is_night = group.is_night && stop.is_night;

                    // Keep platform if missing
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

async function initCaches() {
    await ensureCacheDir();

    // 1. Load Stations
    const cachedStations = await loadJsonFile(STATIONS_FILE);
    if (cachedStations) {
        processedStopsCache = cachedStations;
    } else {
        await refreshStationsCache();
    }

    // 2. Load Departures (Persistent)
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
}


// --- API Fetching ---

function filterNextDeparturesOnly(departures) {
    if (!Array.isArray(departures) || departures.length === 0) return [];

    const now = Date.now();
    const PAST_THRESHOLD_MS = 60000; // 1 minute buffer

    // Helper to parse timestamps robustly (copied logic from client)
    const parseTimestamp = (ts) => {
        if (!ts) return null;
        if (typeof ts === 'string') {
            const parsed = new Date(ts);
            if (!isNaN(parsed.getTime())) return parsed.getTime();
            // Try parsing as number string
            const n = parseInt(ts, 10);
            if (!isNaN(n)) return n < 1000000000000 ? n * 1000 : n;
            return null;
        }
        if (typeof ts === 'number') {
            return ts < 1000000000000 ? ts * 1000 : ts;
        }
        return null; // Object or other
    };

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

        // 1. Filter and Sort
        const validDepartures = lineDepartures.filter(d => {
            const rawTime = d.departure_timestamp?.predicted || d.departure_timestamp?.scheduled;
            const timeMs = parseTimestamp(rawTime);
            if (!timeMs) return false;

            // Filter out if it's older than 1 minute ago
            // Use > -60000 (meaning: difference is greater than -1min, so it's NOT older than 1min)
            return (timeMs - now) > -PAST_THRESHOLD_MS;
        });

        validDepartures.sort((a, b) => {
            const timeA = parseTimestamp(a.departure_timestamp?.predicted || a.departure_timestamp?.scheduled || 0) || 0;
            const timeB = parseTimestamp(b.departure_timestamp?.predicted || b.departure_timestamp?.scheduled || 0) || 0;
            return timeA - timeB;
        });

        // 2. Take top 6
        nextDepartures.push(...validDepartures.slice(0, 6));
    });

    // Final sort of the combined list
    nextDepartures.sort((a, b) => {
        const timeA = parseTimestamp(a.departure_timestamp?.predicted || a.departure_timestamp?.scheduled || 0) || 0;
        const timeB = parseTimestamp(b.departure_timestamp?.predicted || b.departure_timestamp?.scheduled || 0) || 0;
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

function getGolemioHeaders() {
    return { 'x-access-token': API_KEY, 'Content-Type': 'application/json' };
}

function getFreshCache(cache, key) {
    const entry = cache.get(key);
    if (!entry) return null;
    if (Date.now() - entry.timestamp < TRIP_PATH_CACHE_MAX_AGE_MS) return entry.data;
    cache.delete(key);
    return null;
}

function setFreshCache(cache, key, data) {
    cache.set(key, { timestamp: Date.now(), data });
    return data;
}

function normalizeHexColor(color) {
    return color ? `#${String(color).replace(/^#/, '')}` : null;
}

function findCachedStop(stopId) {
    const normalized = String(stopId);
    return processedStopsCache.find(stop =>
        String(stop.gtfsId) === normalized ||
        String(stop.uniqueStopPointId) === normalized ||
        (Array.isArray(stop.gtfsIds) && stop.gtfsIds.map(String).includes(normalized))
    );
}

function toFiniteNumber(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
}

export function shapeFeaturesToPath(shapeData) {
    const features = Array.isArray(shapeData?.features) ? shapeData.features : [];
    const points = features
        .map(feature => {
            const coords = feature?.geometry?.coordinates || [];
            const lon = toFiniteNumber(coords[0]);
            const lat = toFiniteNumber(coords[1]);
            if (lon === null || lat === null) return null;
            return {
                sequence: toFiniteNumber(feature?.properties?.shape_pt_sequence) ?? 0,
                coordinates: [lon, lat],
                distance: toFiniteNumber(feature?.properties?.shape_dist_traveled)
            };
        })
        .filter(Boolean)
        .sort((a, b) => a.sequence - b.sequence);

    return {
        geometry: { type: 'LineString', coordinates: points.map(point => point.coordinates) },
        shapeDistances: points.map(point => point.distance)
    };
}

export function shapeFeaturesToLineString(shapeData) {
    return shapeFeaturesToPath(shapeData).geometry;
}

async function fetchShapeGeometry(shapeId) {
    const cached = getFreshCache(shapeCache, shapeId);
    if (cached) return cached;

    const url = `${GOLEMIO_GTFS_SHAPES_URL}/${encodeURIComponent(shapeId)}`;
    const response = await axios.get(url, {
        headers: getGolemioHeaders(),
        timeout: 8000
    });

    const path = shapeFeaturesToPath(response.data);
    if (path.geometry.coordinates.length === 0) {
        throw new Error(`No shape geometry found for ${shapeId}`);
    }
    return setFreshCache(shapeCache, shapeId, path);
}

async function loadLineFeatures() {
    if (lineFeaturesCache) return lineFeaturesCache;
    try {
        const raw = await fs.readFile(LINES_FILE, 'utf8');
        const data = JSON.parse(raw);
        lineFeaturesCache = Array.isArray(data?.features) ? data.features : [];
    } catch (error) {
        console.error(`[CACHE] Failed to load lines.json: ${error.message}`);
        lineFeaturesCache = [];
    }
    return lineFeaturesCache;
}

async function findRouteMeta(routeId) {
    const features = await loadLineFeatures();
    const route = features.find(feature => String(feature?.properties?.route_id || '') === String(routeId || ''));
    return {
        routeColor: normalizeHexColor(route?.properties?.route_color),
        routeShortName: route?.properties?.route_short_name || null
    };
}

async function getMetroLines() {
    if (metroLinesCache) return metroLinesCache;
    const features = await loadLineFeatures();
    metroLinesCache = {
        type: 'FeatureCollection',
        features: features
            .filter(feature => String(feature?.properties?.route_type) === '1')
            .map(feature => ({
                type: 'Feature',
                geometry: feature.geometry,
                properties: {
                    route_id: feature.properties.route_id,
                    route_short_name: feature.properties.route_short_name,
                    route_color: normalizeHexColor(feature.properties.route_color)
                }
            }))
    };
    return metroLinesCache;
}

async function fetchStopFeatures(stopIds) {
    const uniqueIds = Array.from(new Set(stopIds.filter(Boolean).map(String)));
    if (uniqueIds.length === 0) return new Map();

    const query = uniqueIds.map(id => `ids[]=${encodeURIComponent(id)}`).join('&');
    try {
        const response = await axios.get(`${GOLEMIO_GTFS_STOPS_URL}?${query}`, {
            headers: getGolemioHeaders(),
            timeout: 8000
        });
        const features = Array.isArray(response.data?.features) ? response.data.features : [];
        return new Map(features
            .map(feature => [String(feature?.properties?.stop_id || ''), feature])
            .filter(([id]) => id)
        );
    } catch (error) {
        console.error(`[API] Fetch GTFS stops failed: ${error.response ? error.response.status : error.message}`);
        return new Map();
    }
}

export function collectFulfilledDepartures(results) {
    return results.reduce((acc, result) => {
        if (result.status === 'fulfilled' && Array.isArray(result.value?.departures)) {
            acc.push(...result.value.departures);
        }
        return acc;
    }, []);
}

function buildTripStop(stopTime, apiStopFeatures) {
    const stopId = stopTime?.stop_id ? String(stopTime.stop_id) : null;
    if (!stopId) return null;

    const cachedStop = findCachedStop(stopId);
    const apiStop = apiStopFeatures.get(stopId);
    const apiProps = apiStop?.properties || {};
    const apiCoords = apiStop?.geometry?.coordinates || [];
    const lon = cachedStop ? toFiniteNumber(cachedStop.lon) : toFiniteNumber(apiCoords[0]);
    const lat = cachedStop ? toFiniteNumber(cachedStop.lat) : toFiniteNumber(apiCoords[1]);

    if (lon === null || lat === null) return null;

    return {
        stop_id: stopId,
        uniqueStopPointId: cachedStop?.uniqueStopPointId || stopId,
        gtfsId: cachedStop?.gtfsId || stopId,
        gtfsIds: Array.isArray(cachedStop?.gtfsIds) && cachedStop.gtfsIds.length ? cachedStop.gtfsIds : [stopId],
        stop_name: cachedStop?.name || apiProps.stop_name || stopTime.stop_name || stopId,
        arrival_time: stopTime.arrival_time,
        departure_time: stopTime.departure_time,
        stop_sequence: toFiniteNumber(stopTime.stop_sequence) ?? 0,
        lat,
        lon,
        platform: cachedStop?.platform || apiProps.platform_code || null,
        zone: cachedStop?.zone || apiProps.zone_id || null,
        lines: Array.isArray(cachedStop?.lines) ? cachedStop.lines : [],
        mainTrafficType: cachedStop?.mainTrafficType || null,
        is_night: cachedStop?.is_night || false
    };
}

export async function fetchTripPath(tripId) {
    if (!API_KEY) throw new Error("API key is missing");

    const normalizedTripId = String(tripId);
    const cached = getFreshCache(tripPathCache, normalizedTripId);
    if (cached) return cached;

    const url = `${GOLEMIO_GTFS_TRIPS_URL}/${encodeURIComponent(normalizedTripId)}?includeStopTimes=true`;
    const response = await axios.get(url, {
        headers: getGolemioHeaders(),
        timeout: 8000
    });

    const trip = response.data || {};
    const stopTimes = Array.isArray(trip.stop_times)
        ? [...trip.stop_times].sort((a, b) => (toFiniteNumber(a.stop_sequence) ?? 0) - (toFiniteNumber(b.stop_sequence) ?? 0))
        : [];

    if (!trip.shape_id) throw new Error(`No shape_id found for trip ${normalizedTripId}`);
    if (stopTimes.length === 0) throw new Error(`No stop times found for trip ${normalizedTripId}`);

    const missingStopIds = stopTimes
        .map(stopTime => stopTime.stop_id)
        .filter(stopId => stopId && !findCachedStop(stopId));
    const apiStopFeatures = await fetchStopFeatures(missingStopIds);
    const stops = stopTimes
        .map(stopTime => buildTripStop(stopTime, apiStopFeatures))
        .filter(Boolean);

    if (stops.length === 0) throw new Error(`No resolvable stops found for trip ${normalizedTripId}`);

    const shapePath = await fetchShapeGeometry(trip.shape_id);
    const routeMeta = await findRouteMeta(trip.route_id);
    const data = {
        tripId: trip.trip_id || normalizedTripId,
        routeId: trip.route_id || null,
        routeColor: routeMeta.routeColor,
        routeShortName: routeMeta.routeShortName,
        shapeId: trip.shape_id,
        stops,
        geometry: shapePath.geometry,
        shapeDistances: shapePath.shapeDistances,
        source: 'golemio-gtfs'
    };
    return setFreshCache(tripPathCache, normalizedTripId, data);
}

function resolveTripIdContext(tripData) {
    if (typeof tripData === 'object' && tripData !== null) {
        const tripId = tripData.gtfs_trip_id || tripData.id;
        return {
            tripId,
            clientTripId: tripData.id || tripId
        };
    }
    return { tripId: tripData, clientTripId: tripData };
}

async function fetchVehiclePositions() {
    if (Date.now() - vehiclePositionsCache.timestamp < VEHICLE_POSITIONS_CACHE_MAX_AGE_MS && vehiclePositionsCache.data) {
        return vehiclePositionsCache.data;
    }

    const response = await axios.get(`${GOLEMIO_VEHICLE_POSITIONS_URL}?limit=5000`, {
        headers: getGolemioHeaders(),
        timeout: 6000
    });

    const features = Array.isArray(response.data?.features) ? response.data.features : [];
    vehiclePositionsCache = { timestamp: Date.now(), data: features };
    return features;
}

async function fetchTripVehiclePosition(tripId) {
    if (!tripId) return null;
    const features = await fetchVehiclePositions();
    const feature = features.find(item => String(item?.properties?.trip?.gtfs?.trip_id || '') === String(tripId));
    if (!feature) return null;

    const coordinates = feature?.geometry?.coordinates || [];
    const lon = toFiniteNumber(coordinates[0]);
    const lat = toFiniteNumber(coordinates[1]);
    if (lon === null || lat === null) return null;

    const lastPosition = feature.properties?.last_position || {};
    return {
        coordinates: [lon, lat],
        bearing: toFiniteNumber(lastPosition.bearing),
        shapeDistTraveled: toFiniteNumber(lastPosition.shape_dist_traveled),
        lastStopId: lastPosition.last_stop?.id || null,
        lastStopSequence: toFiniteNumber(lastPosition.last_stop?.sequence),
        nextStopId: lastPosition.next_stop?.id || null,
        nextStopSequence: toFiniteNumber(lastPosition.next_stop?.sequence),
        originTimestamp: lastPosition.origin_timestamp || null,
        tracking: lastPosition.tracking === true
    };
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
                socket.emit('departureData', { ...cached.data, stopId });
            } else if (cached) {
                // Serve stale cache while loading
                console.log(`[SOCKET] Serving stale cache for ${stopId} while refreshing`);
                socket.emit('departureData', { ...cached.data, stopId });
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
        const { tripId, clientTripId } = resolveTripIdContext(tripData);
        try {
            if (typeof tripData === 'object' && tripData !== null && DEBUG_LOGS) console.log(`[DEBUG] Trip Object Keys: ${Object.keys(tripData).join(', ')}`);

            if (!tripId) return;

            const path = await fetchTripPath(tripId);

            socket.emit('tripPathData', { ...path, tripId: clientTripId });
        } catch (err) {
            console.error('[SOCKET] Error in getTripPath:', err);
            socket.emit('tripPathError', { tripId: clientTripId || 'unknown', error: err.message || 'Internal server error fetching trip path.' });
        }
    });

    socket.on('getTripVehiclePosition', async (tripData) => {
        const { tripId, clientTripId } = resolveTripIdContext(tripData);
        try {
            const position = await fetchTripVehiclePosition(tripId);
            socket.emit('tripVehiclePositionData', { tripId: clientTripId, position });
        } catch (err) {
            console.error('[SOCKET] Error in getTripVehiclePosition:', err);
            socket.emit('tripVehiclePositionError', { tripId: clientTripId, error: err.message || 'Internal server error fetching vehicle position.' });
        }
    });

    socket.on('getMetroLines', async () => {
        try {
            socket.emit('metroLinesData', await getMetroLines());
        } catch (err) {
            console.error('[SOCKET] Error in getMetroLines:', err);
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
    const stopEntry = findCachedStop(stopId);
    const gtfsIds = stopEntry?.gtfsIds || [stopId];

    const fetchData = async () => {
        // Rate limit check
        if (rateLimitedStations.has(stopId)) {
            if (Date.now() < rateLimitedStations.get(stopId).until) return;
            rateLimitedStations.delete(stopId);
        }

        try {
            const results = await Promise.allSettled(gtfsIds.map(id => fetchDeparturesFromPID(id)));
            const failures = results.filter(result => result.status === 'rejected');
            if (failures.length > 0) {
                console.warn(`[POLL] ${stopId}: ${failures.length}/${gtfsIds.length} departure fetches failed.`);
                if (failures.some(result => String(result.reason?.message || '').includes('429'))) {
                    rateLimitedStations.set(stopId, { until: Date.now() + 10000 });
                }
            }

            const mergedDepartures = collectFulfilledDepartures(results);

            // Deduplicate and sort
            const deduped = Array.from(new Map(mergedDepartures.map(dep =>
                [dep.trip?.id + '-' + (dep.departure_timestamp?.predicted || dep.departure_timestamp?.scheduled), dep]
            )).values());

            deduped.sort((a, b) => {
                const timeA = a.departure_timestamp?.predicted || a.departure_timestamp?.scheduled || 0;
                const timeB = b.departure_timestamp?.predicted || b.departure_timestamp?.scheduled || 0;
                return timeA - timeB;
            });

            const newData = { stopId, departures: deduped };
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
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
    server.listen(PORT, '0.0.0.0', () => {
        initCaches();
        updateStatusUI();
    });
}
