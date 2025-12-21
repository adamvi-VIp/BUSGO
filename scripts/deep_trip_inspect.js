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
    try {
        const url = 'https://api.golemio.cz/v2/gtfs/trips?limit=1';
        console.log(`Fetching: ${url}`);
        const res = await fetch(url, { headers: { 'x-access-token': API_KEY } });
        if (res.ok) {
            const data = await res.json();
            console.log('--- Full Trip Object ---');
            console.log(JSON.stringify(data[0], null, 2));
        } else {
            console.log(`Failed: ${res.status}`);
        }
    } catch (e) { console.error(e); }
}

run();
