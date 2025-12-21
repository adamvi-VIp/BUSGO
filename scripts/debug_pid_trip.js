const fs = require('fs');
const path = require('path');

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

const TRIP_ID = '377_2113_250719';
const API_BASE = 'https://api.golemio.cz/v2';
const HEADERS = { 'x-access-token': API_KEY, 'Content-Type': 'application/json' };

async function run() {
    console.log(`Testing PID Trip Endpoint for ID: ${TRIP_ID}`);

    // 1. Try /pid/trips/{id}
    const url = `${API_BASE}/pid/trips/${TRIP_ID}`;
    try {
        const res = await fetch(url, { headers: HEADERS });
        console.log(`${res.status} ${res.statusText}\t${url}`);
        if (res.ok) {
            const data = await res.json();
            console.log('--- PID Trip Data ---');
            console.log(JSON.stringify(data, null, 2).slice(0, 500)); // Print first 500 chars

            if (data.gtfs_trip_id) {
                console.log(`FOUND GTFS TRIP ID: ${data.gtfs_trip_id}`);
            }
        }
    } catch (e) {
        console.log(`ERR ${e.message}`);
    }
}

run();
