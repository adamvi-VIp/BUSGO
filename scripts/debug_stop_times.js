const fs = require('fs');
const path = require('path');

// Load API Key
let API_KEY = process.env.PID_API_KEY;
if (!API_KEY) {
    try {
        const envPath = path.resolve(__dirname, '../server/.env');
        if (fs.existsSync(envPath)) {
            const data = fs.readFileSync(envPath, 'utf8');
            const match = data.match(/PID_API_KEY=(.+)/);
            if (match) API_KEY = match[1].trim();
        }
    } catch (e) { }
}

if (!API_KEY) {
    console.error('No API KEY found');
    process.exit(1);
}

const TRIP_ID = '377_2113_250719';
const API_BASE = 'https://api.golemio.cz/v2';
const HEADERS = { 'x-access-token': API_KEY, 'Content-Type': 'application/json' };

async function run() {
    console.log('--- 1. Testing Random Valid Trip from /gtfs/trips ---');
    let validTripId = null;
    try {
        const tripsRes = await fetch(`${API_BASE}/gtfs/trips?limit=1`, { headers: HEADERS });
        if (tripsRes.ok) {
            const trips = await tripsRes.json();
            if (trips.length > 0) {
                validTripId = trips[0].trip_id;
                console.log(`Fetched valid GTFS Trip ID: ${validTripId}`);
            }
        } else {
            console.log(`Failed to fetch /gtfs/trips: ${tripsRes.status}`);
        }
    } catch (e) { console.log('Error fetching trips:', e.message); }

    const idsToTest = [validTripId, TRIP_ID].filter(Boolean);

    for (const testId of idsToTest) {
        console.log(`\n--- Testing ID: ${testId} ---`);
        const endpoints = [
            `/gtfs/stop-times?tripId=${testId}`,
            `/gtfs/stop-times/${testId}`,
            `/gtfs/trips/${testId}/stop-times`,
            `/gtfs/stop-times?trip_id=${testId}`
        ];

        for (const path of endpoints) {
            const url = `${API_BASE}${path}`;
            try {
                const res = await fetch(url, { headers: HEADERS });
                console.log(`${res.status} ${res.statusText}\t${path}`);
                if (res.ok) {
                    const data = await res.json();
                    const count = Array.isArray(data) ? data.length : 'obj';
                    console.log(`   -> SUCCESS! Count: ${count}`);
                }
            } catch (e) {
                console.log(`ERR  ${e.message}\t${path}`);
            }
        }
    }
}

run();
