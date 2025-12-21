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
    console.log('--- 1. Testing Root /v2 ---');
    try {
        const root = await fetch('https://api.golemio.cz/v2', { headers: { 'x-access-token': API_KEY } });
        console.log(`Root /v2: ${root.status}`);
        if (root.ok) {
            console.log(await root.text()); // inspect for links
        }
    } catch (e) { }

    console.log('\n--- 2. Testing Variants ---');
    const variants = [
        'https://api.golemio.cz/v1/gtfs/stop-times',
        'https://api.golemio.cz/v2/pid/gtfs/stop-times',
        'https://api.golemio.cz/v2/gtfs/stops-times'
    ];

    for (const url of variants) {
        try {
            const res = await fetch(url, { headers: { 'x-access-token': API_KEY } });
            console.log(`${res.status} ${res.statusText}\t${url}`);
        } catch (e) { }
    }
}

run();
