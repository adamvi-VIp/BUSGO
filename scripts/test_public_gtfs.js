const fs = require('fs');
const path = require('path');

let API_KEY = process.env.PID_API_KEY;
if (!API_KEY) {
    try {
        const envPath = path.resolve(__dirname, '../server/.env');
        if (fs.existsSync(envPath)) {
            const data = fs.readFileSync(envPath, 'utf8');
            const lines = data.split('\n');
            for (const line of lines) {
                const trimmed = line.trim();
                const match = trimmed.match(/^PID_API_KEY=(.+)/);
                if (match) { API_KEY = match[1].replace(/['"]/g, '').trim(); break; }
            }
        }
    } catch (e) { }
}

async function run() {
    const tripId = '194_82_250611';
    // The user suggested /v2/public/gtfs/trips/{gtfsTripId}
    // Documentation says scopes=stop_times can be used
    const url = `https://api.golemio.cz/v2/public/gtfs/trips/${tripId}?scopes=stop_times`;

    console.log(`Testing Public GTFS Lookup: ${url}`);

    try {
        const res = await fetch(url, { headers: { 'x-access-token': API_KEY } });
        console.log(`Status: ${res.status} ${res.statusText}`);
        const data = await res.json();

        if (res.ok) {
            console.log('SUCCESS!');
            console.log('Top level keys:', Object.keys(data));
            if (data.stop_times) {
                console.log('stop_times type:', typeof data.stop_times);
                console.log('stop_times keys:', Object.keys(data.stop_times));
                if (data.stop_times.features) {
                    console.log('Features count:', data.stop_times.features.length);
                    if (data.stop_times.features.length > 0) {
                        const first = data.stop_times.features[0];
                        console.log('Feature properties keys:', Object.keys(first.properties).sort());
                        console.log('Stop ID in properties?', 'stop_id' in first.properties);
                        console.log('Stop ID value:', first.properties.stop_id);
                        if (first.properties.stop_id === undefined) {
                            console.log('FULL first feature:', JSON.stringify(first, null, 2));
                        }
                    }
                }
            }
        } else {
            console.log('Error Response:', JSON.stringify(data, null, 2));
        }
    } catch (e) {
        console.error(e);
    }
}

run();
