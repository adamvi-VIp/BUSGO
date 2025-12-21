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

async function run() {
    // 1. Fetch the trip that we know exists
    const tripId = '377_2113_250719';
    const url = `https://api.golemio.cz/v2/gtfs/trips/${tripId}`;

    // Also try listing with filter
    const urlList = `https://api.golemio.cz/v2/gtfs/trips?tripIds=${tripId}`;

    try {
        console.log(`Fetching specific trip: ${url}`);
        const res = await fetch(url, { headers: { 'x-access-token': API_KEY } });
        console.log(`Status /trips/{id}: ${res.status}`);
        if (res.ok) {
            console.log(JSON.stringify(await res.json(), null, 2));
        }

        console.log(`Fetching trip list filter: ${urlList}`);
        const res2 = await fetch(urlList, { headers: { 'x-access-token': API_KEY } });
        console.log(`Status /trips?tripIds: ${res2.status}`);
        if (res2.ok) {
            const json = await res2.json();
            if (json.length > 0) {
                console.log(JSON.stringify(json[0], null, 2));
            } else {
                console.log('Empty list');
            }
        }

    } catch (e) {
        console.error(e);
    }
}

run();
