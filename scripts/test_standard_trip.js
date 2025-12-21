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
    const tripId = '194_82_250611';
    const url = `https://api.golemio.cz/v2/gtfs/trips/${tripId}`;

    console.log(`Testing GTFS Trip Detail: ${url}`);

    try {
        const res = await fetch(url, { headers: { 'x-access-token': API_KEY } });
        console.log(`Status: ${res.status} ${res.statusText}`);
        const data = await res.json();

        if (res.ok) {
            console.log('SUCCESS!');
            console.log('Keys:', Object.keys(data));
            // Check for stop_times or similar
            const stKeys = Object.keys(data).filter(k => k.includes('stop'));
            console.log('Related keys:', stKeys);
            if (data.stop_times) {
                console.log('stop_times count:', data.stop_times.length);
                if (data.stop_times.length > 0) {
                    console.log('First stop time keys:', Object.keys(data.stop_times[0]));
                    console.log('Stop ID:', data.stop_times[0].stop_id);
                }
            }
        } else {
            console.log('Error:', JSON.stringify(data, null, 2));
        }
    } catch (e) {
        console.error(e);
    }
}

run();
