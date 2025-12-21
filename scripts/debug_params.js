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
                if (trimmed.startsWith('#') || !trimmed.includes('=')) continue;
                const [key, ...vals] = trimmed.split('=');
                if (key.trim() === 'PID_API_KEY') {
                    let val = vals.join('=').trim();
                    val = val.replace(/^["'](.*)["']$/, '$1');
                    API_KEY = val;
                    break;
                }
            }
        }
    } catch (e) { }
}

async function run() {
    const tripId = '377_2113_250719';
    const stopId = 'U694'; // Muzeum

    // Test variants with trip_id (underscore)
    const variants = [
        `https://api.golemio.cz/v2/gtfs/stop-times?trip_id=${tripId}`,
        `https://api.golemio.cz/v2/gtfs/stoptimes?trip_id=${tripId}`,
        `https://api.golemio.cz/v2/gtfs/stoptimes?stop_id=${stopId}`,
        `https://api.golemio.cz/v2/gtfs/stop-times?stop_id=${stopId}`
    ];

    console.log('--- Testing Parameters (trip_id and stop_id) ---');
    for (const url of variants) {
        try {
            const res = await fetch(url, { headers: { 'x-access-token': API_KEY } });
            console.log(`${res.status} ${res.statusText}\t${url}`);
        } catch (e) {
            console.log(`Error: ${e.message}\t${url}`);
        }
    }
}

run();
