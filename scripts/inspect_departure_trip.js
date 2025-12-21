const fs = require('fs');
const path = require('path');

let API_KEY = process.env.PID_API_KEY;
if (!API_KEY) {
    try {
        const envPath = path.resolve(__dirname, '../server/.env');
        if (fs.existsSync(envPath)) {
            const data = fs.readFileSync(envPath, 'utf8');
            const match = data.match(/PID_API_KEY=(.+)/);
            if (match) API_KEY = match[1].trim();
        }
    } catch (e) { }
}

async function run() {
    // Fetch departures for a random stop (e.g. U694 - Muzeum, or just query general)
    // Actually, let's use a known stop ID if possible. 'U944' = 'I. P. Pavlova' maybe?
    // Let's just fetch *any* departure using the API without IDs (limit 1) if possible?
    // /pid/departureboards expects ids.
    // Let's use `U287` (Andel) or similar. Or `U480`

    // Better: GET /gtfs/stops limit 1, use that ID.

    const stops = ['U287', 'U139', 'U694', 'U322', 'U28', 'U944']; // Andel, Florenc, Muzeum, NamRep, ...

    for (const stopId of stops) {
        console.log(`Checking stop ${stopId}...`);
        try {
            const depUrl = `https://api.golemio.cz/v2/pid/departureboards?ids[]=${stopId}&limit=5`;
            const depRes = await fetch(depUrl, { headers: { 'x-access-token': API_KEY } });
            if (!depRes.ok) continue;

            const depData = await depRes.json();
            if (depData.departures && depData.departures.length > 0) {
                console.log(`FOUND Departures at ${stopId}!`);
                const trip = depData.departures[0].trip;
                console.log(JSON.stringify(trip, null, 2));
                break;
            }
        } catch (e) {
            console.error(e.message);
        }
    }
}

run();
