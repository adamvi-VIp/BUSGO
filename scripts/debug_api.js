const fs = require('fs');
const path = require('path');

function loadEnv() {
    try {
        const envPath = path.resolve(__dirname, '../server/.env');
        if (fs.existsSync(envPath)) {
            const data = fs.readFileSync(envPath, 'utf8');
            data.split('\n').forEach(line => {
                const [key, value] = line.split('=');
                if (key && value) {
                    process.env[key.trim()] = value.trim();
                }
            });
        }
    } catch (e) {
        console.error('Failed to load .env:', e.message);
    }
}

loadEnv();

async function test() {
    const API_KEY = process.env.PID_API_KEY;
    if (!API_KEY) {
        console.error('No API KEY found in process.env');
        return;
    }

    const headers = { 'x-access-token': API_KEY, 'Content-Type': 'application/json' };

    console.log('Fetching trips...');
    try {
        // We need a valid trip ID. Let's try to get one from departures or trips list.
        // /gtfs/trips can be heavy, let's limit 1
        const response = await fetch('https://api.golemio.cz/v2/gtfs/trips?limit=1', { headers });
        console.log('/gtfs/trips status:', response.status);
        if (response.ok) {
            const data = await response.json();
            if (data.length > 0) {
                const tripId = data[0].trip_id;
                console.log('Got tripId:', tripId);
                await testStopTimes(tripId, headers);
            } else {
                console.log('No trips found.');
            }
        } else {
            console.log('Trip fetch failed:', response.statusText);
        }
    } catch (e) {
        console.log('/gtfs/trips failed:', e.message);
    }
}

async function testStopTimes(tripId, headers) {
    const endpoints = [
        `https://api.golemio.cz/v2/gtfs/stop-times?tripId=${tripId}`,
        `https://api.golemio.cz/v2/gtfs/stop-times/${tripId}`,
        `https://api.golemio.cz/v2/gtfs/trips/${tripId}/stop-times`,
        `https://api.golemio.cz/v2/pid/trips/${tripId}/stop-times`
    ];

    for (const url of endpoints) {
        try {
            console.log(`Testing ${url}...`);
            const res = await fetch(url, { headers });
            console.log(`${url} -> ${res.status} ${res.statusText}`);
            if (res.ok) {
                const json = await res.json();
                console.log('Data sample:', JSON.stringify(json).slice(0, 100));
            }
        } catch (e) {
            console.log(`FAILED: ${url} -> ${e.message}`);
        }
    }
}

test();
