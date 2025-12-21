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
    // 1. Fuzz OpenAPI Spec
    const specUrls = [
        'https://api.golemio.cz/v2/openapi.json',
        'https://api.golemio.cz/v2/docs/openapi.json',
        'https://api.golemio.cz/v2/public-openapi.json',
        'https://api.golemio.cz/v2/swagger.json',
        'https://api.golemio.cz/v2/docs/public-openapi/openapi.json'
    ];

    console.log('--- Checking Spec URLs ---');
    for (const url of specUrls) {
        try {
            const res = await fetch(url);
            console.log(`${res.status} ${res.statusText}\t${url}`);
        } catch (e) { }
    }

    // 2. Test v1 variant for stoptimes
    const tripId = '99_961_251231';
    const v1Url = `https://api.golemio.cz/v1/gtfs/stoptimes?trip_id=${tripId}`;
    console.log(`\n--- Testing v1: ${v1Url} ---`);
    try {
        const res = await fetch(v1Url, { headers: { 'x-access-token': API_KEY } });
        console.log(`${res.status} ${res.statusText}`);
        if (res.ok) console.log('SUCCESS! v1 worked.');
    } catch (e) { }
}

run();
