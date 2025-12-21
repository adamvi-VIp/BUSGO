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
    // 1. Find Route ID for "194" (Client-side filter)
    try {
        console.log('Fetching Routes (no filter)...');
        const routeRes = await fetch('https://api.golemio.cz/v2/gtfs/routes?limit=1000', {
            headers: { 'x-access-token': API_KEY }
        });

        let routeId = null;
        if (routeRes.ok) {
            const routes = await routeRes.json();
            const route194 = routes.find(r => r.route_short_name === "194");
            if (route194) {
                routeId = route194.route_id;
                console.log(`Route 194 -> ID: ${routeId}`);
            } else {
                console.log('Route 194 not found in list.');
            }
        } else {
            console.log(`Routes fetch failed: ${routeRes.status}`);
        }

        if (!routeId) return;

        // 2. Fetch Trips for this Route
        // Try route_id (snake_case)
        const tripsUrl = `https://api.golemio.cz/v2/gtfs/trips?route_id=${routeId}&limit=1000`;
        console.log(`Fetching Trips: ${tripsUrl}`);
        const tripsRes = await fetch(tripsUrl, { headers: { 'x-access-token': API_KEY } });

        if (tripsRes.ok) {
            const trips = await tripsRes.json();
            console.log(`Fetched ${trips.length} trips.`);

            // Search for our known PID Trip ID: 194_82_250611
            const targetIds = ['194_82_250611', '194_37_250611', '194_17_250611'];

            const match = trips.find(t => targetIds.some(target => t.trip_id === target));
            if (match) {
                console.log(`FOUND MATCH! ID: ${match.trip_id}`);
                console.log(JSON.stringify(match, null, 2));
            } else {
                console.log('No exact match found for target IDs.');
                // Debug: Print first 5 IDs
                console.log('First 5 IDs found:', trips.slice(0, 5).map(t => t.trip_id));
            }
        } else {
            console.log(`Trips fetch failed: ${tripsRes.status}`);
        }

    } catch (e) {
        console.error(e);
    }
}

run();
