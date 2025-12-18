const fs = require('fs');
const path = require('path');

try {
    const cachePath = path.join(__dirname, '../server/station_cache.json');
    const data = fs.readFileSync(cachePath, 'utf8');
    const json = JSON.parse(data || '{}');
    const keys = Object.keys(json);
    if (keys.length > 0) {
        console.log('First stop entry:', JSON.stringify(json[keys[0]], null, 2));
    } else {
        console.log('Cache is empty');
    }
} catch (e) {
    console.error('Error:', e.message);
}
