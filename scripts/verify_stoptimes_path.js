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
    const url = `https://api.golemio.cz/v2/gtfs/stoptimes/${tripId}`;

    console.log(`Testing discovered path parameter endpoint: ${url}`);

    try {
        const res = await fetch(url, { headers: { 'x-access-token': API_KEY } });
        console.log(`Status: ${res.status} ${res.statusText}`);
        if (res.ok) {
            const data = await res.json();
            console.log(`SUCCESS! Received ${data.length} stop times.`);
            if (data.length > 0) {
                console.log('Sample Stop Time:', JSON.stringify(data[0], null, 2));
            }
        } else {
            const txt = await res.text();
            console.log(txt);
        }
    } catch (e) {
        console.error(e);
    }
}

run();
