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
    // 99_961_251231 is a valid ID from our deep inspection
    const tripId = '99_961_251231';

    const variants = [
        `https://api.golemio.cz/v2/gtfs/stoptimes?trip_id=${tripId}`,
        `https://api.golemio.cz/v2/gtfs/stoptimes?tripId=${tripId}`,
        `https://api.golemio.cz/v2/gtfs/stoptimes/${tripId}`,
        `https://api.golemio.cz/v2/gtfs/trips/${tripId}/stoptimes`
    ];

    console.log(`--- Testing Final Variants for ID: ${tripId} ---`);
    for (const url of variants) {
        try {
            const res = await fetch(url, { headers: { 'x-access-token': API_KEY } });
            console.log(`${res.status} ${res.statusText}\t${url}`);
        } catch (e) { }
    }
}

run();
