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
    const variants = [
        '/gtfs/stop-times',
        '/gtfs/stoptimes',
        '/gtfs/stopTimes',
        '/gtfs/trips/stop-times',
        '/pid/stop-times',
        '/pid/stoptimes',
        '/public/gtfs/stop-times'
    ];

    // Also try docs to find the spec
    const docs = [
        'https://api.golemio.cz/v2/docs/openapi.json',
        'https://api.golemio.cz/docs/openapi.json',
        'https://api.golemio.cz/swagger/v2/swagger.json'
    ];

    console.log('--- Fuzzing Endpoints ---');
    for (const v of variants) {
        const url = `https://api.golemio.cz/v2${v}`;
        try {
            const res = await fetch(url, { headers: { 'x-access-token': API_KEY } });
            console.log(`${res.status} ${res.statusText}\t${v}`);
        } catch (e) { }
    }

    console.log('\n--- Checking Docs ---');
    for (const d of docs) {
        try {
            const res = await fetch(d);
            console.log(`${res.status} ${res.statusText}\t${d}`);
        } catch (e) { }
    }
}

run();
