const fs = require('fs');
const path = require('path');

// Mock getDistanceFromLatLonInKm
function deg2rad(deg) { return deg * (Math.PI / 180); }
function getDistanceFromLatLonInKm(lat1, lon1, lat2, lon2) {
    var R = 6371;
    var dLat = deg2rad(lat2 - lat1);
    var dLon = deg2rad(lon2 - lon1);
    var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

const STATIONS_FILE = path.resolve(__dirname, '../server/cache/stations.json');

async function run() {
    console.log('Loading stations cache...');
    const stations = JSON.parse(fs.readFileSync(STATIONS_FILE, 'utf8'));
    console.log(`Loaded ${stations.length} stations.`);

    const tripId = '194_82_250611';
    let API_KEY = process.env.PID_API_KEY;
    if (!API_KEY) {
        const envData = fs.readFileSync(path.resolve(__dirname, '../server/.env'), 'utf8');
        API_KEY = envData.match(/PID_API_KEY=(.+)/)[1].replace(/['"]/g, '').trim();
    }

    const url = `https://api.golemio.cz/v2/public/gtfs/trips/${tripId}?scopes=stop_times`;
    console.log(`Fetching trip: ${url}`);

    const res = await fetch(url, { headers: { 'x-access-token': API_KEY } });
    const data = await res.json();

    if (data.stop_times && data.stop_times.features) {
        const features = data.stop_times.features;
        console.log(`Trip has ${features.length} stops.`);

        const resolved = features.map(f => {
            const lon = f.geometry.coordinates[0];
            const lat = f.geometry.coordinates[1];
            let closest = null;
            let minDist = 0.05;

            for (const s of stations) {
                const d = getDistanceFromLatLonInKm(lat, lon, s.lat, s.lon);
                if (d < minDist) {
                    minDist = d;
                    closest = s;
                }
            }

            return {
                name: f.properties.stop_name,
                seq: f.properties.stop_sequence,
                resolvedId: closest ? closest.gtfsId : 'MISSING',
                dist: closest ? minDist.toFixed(4) + 'km' : 'N/A'
            };
        });

        resolved.forEach(r => {
            console.log(`[${r.seq}] ${r.name.padEnd(30)} -> ${r.resolvedId} (${r.dist})`);
        });
    }
}

run();
