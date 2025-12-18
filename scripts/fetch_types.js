const https = require('https');

const url = 'https://data.pid.cz/stops/json/stops.json';

https.get(url, (res) => {
    let data = '';

    res.on('data', (chunk) => {
        data += chunk;
    });

    res.on('end', () => {
        try {
            const json = JSON.parse(data);
            const types = {};

            if (json.stopGroups) {
                json.stopGroups.forEach(group => {
                    group.stops.forEach(stop => {
                        const t = stop.mainTrafficType || 'null';
                        types[t] = (types[t] || 0) + 1;
                    });
                });
            }

            console.log(JSON.stringify(types, null, 2));
        } catch (e) {
            console.error(e.message);
        }
    });

}).on('error', (err) => {
    console.error('Error: ' + err.message);
});
