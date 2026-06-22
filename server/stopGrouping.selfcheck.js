import assert from 'node:assert/strict';

process.env.PID_API_KEY ||= 'self-check';

const { groupStops } = await import('./server.js');

const stops = groupStops([
    {
        uniqueStopPointId: 'U2',
        gtfsId: 'U2',
        gtfsIds: ['U2'],
        name: 'Central',
        lat: 50,
        lon: 14,
        platform: '2',
        lines: [{ name: '2', direction: 'A' }],
        is_night: false
    },
    {
        uniqueStopPointId: 'U1',
        gtfsId: 'U1',
        gtfsIds: ['U1'],
        name: 'Central',
        lat: 50,
        lon: 14,
        platform: '1',
        lines: [{ name: '1', direction: 'B' }],
        is_night: false
    },
    {
        uniqueStopPointId: 'U3',
        gtfsId: 'U3',
        gtfsIds: ['U3'],
        name: 'Central',
        lat: 50.0001,
        lon: 14,
        platform: '3',
        lines: [{ name: '3', direction: 'C' }],
        is_night: false
    }
]);

assert.equal(stops.length, 2);
assert.equal(stops[0].gtfsId, 'U1');
assert.equal(stops[0].uniqueStopPointId, 'U1');
assert.deepEqual(stops[0].gtfsIds.sort(), ['U1', 'U2']);
assert.deepEqual(stops[0].lines.map(line => line.name).sort(), ['1', '2']);
assert.equal(stops[1].gtfsId, 'U3');

console.log('stop grouping self-check passed');
