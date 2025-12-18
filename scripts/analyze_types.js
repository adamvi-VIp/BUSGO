const fs = require('fs');
const path = 'server/station_cache.json';

try {
    const data = fs.readFileSync(path, 'utf8');
    // It might be an object with keys or an array? Let's check.
    // The file is likely a map of ID -> Station Data, or an array.
    // Let's try to parse it.
    const json = JSON.parse(data);

    const types = {};

    // Helper to process a station
    const count = (s) => {
        const t = s.mainTrafficType || 'unknown';
        types[t] = (types[t] || 0) + 1;
    };

    if (Array.isArray(json)) {
        json.forEach(count);
    } else if (typeof json === 'object') {
        Object.values(json).forEach(count);
    }

    console.log(JSON.stringify(types, null, 2));

} catch (e) {
    console.error(e.message);
    // If too big to parse all at once, we might fail, but let's try.
}
