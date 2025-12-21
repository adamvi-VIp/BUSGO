const fs = require('fs');
const path = require('path');

let API_KEY = process.env.PID_API_KEY;
if (!API_KEY) {
    try {
        const envPath = path.resolve(__dirname, '../server/.env');
        if (fs.existsSync(envPath)) {
            const data = fs.readFileSync(envPath, 'utf8');
            // robust parse
            const lines = data.split('\n');
            for (const line of lines) {
                const trimmed = line.trim();
                if (trimmed.startsWith('#') || !trimmed.includes('=')) continue;
                const [key, ...vals] = trimmed.split('=');
                if (key.trim() === 'PID_API_KEY') {
                    let val = vals.join('=').trim();
                    val = val.replace(/^["'](.*)["']$/, '$1'); // remove quotes
                    API_KEY = val;
                    break;
                }
            }
        }
    } catch (e) { console.error('Env load error:', e.message); }
}

if (API_KEY) {
    console.log(`Loaded API KEY: ${API_KEY.substring(0, 5)}...`);
} else {
    console.error('FAILED TO LOAD API KEY');
    process.exit(1);
}

async function run() {
    try {
        // Fetch departures near Muzeum (Prague) to ensure results
        // lat=50.0755, lon=14.4378
        const url = 'https://api.golemio.cz/v2/pid/departureboards?lat=50.0755&long=14.4378&limit=5&minutesAfter=200';
        console.log(`Fetching: ${url}`);
        const res = await fetch(url, { headers: { 'x-access-token': API_KEY } });
        console.log(`Status: ${res.status} ${res.statusText}`);

        if (res.ok) {
            const data = await res.json();
            if (data.departures && data.departures.length > 0) {
                console.log('--- Departure Found ---');
                const trip = data.departures[0].trip;
                console.log(JSON.stringify(trip, null, 2));
            } else {
                console.log('No departures returned?');
            }
        } else {
            const txt = await res.text();
            console.log(txt);
        }
    } catch (e) {
        console.error(e.message);
    }
}

run();
