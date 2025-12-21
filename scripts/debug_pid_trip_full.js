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
    // 1. Try the valid ID
    const tripId = '377_2113_250719';
    const url = `https://api.golemio.cz/v2/pid/trips/${tripId}`;
    console.log(`Fetching: ${url}`);

    try {
        const res = await fetch(url, { headers: { 'x-access-token': API_KEY } });
        console.log(`Status: ${res.status}`);
        if (res.ok) {
            const json = await res.json();
            console.log(JSON.stringify(json, null, 2));
        }
    } catch (e) { console.error(e); }
}

run();
