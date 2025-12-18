const fs = require('fs');
const path = 'server/station_cache.json';
try {
    const json = JSON.parse(fs.readFileSync(path, 'utf8'));
    const vals = Array.isArray(json) ? json : Object.values(json);
    console.log(JSON.stringify(vals.slice(0, 3), null, 2));
} catch (e) { console.error(e); }
