import assert from 'node:assert/strict';

process.env.PID_API_KEY ||= 'self-check';

const { estimateTripVehiclePosition } = await import('./server.js');

const position = estimateTripVehiclePosition({
    geometry: { type: 'LineString', coordinates: [[0, 0], [10, 0], [20, 0]] },
    shapeDistances: [0, 10, 20],
    stops: [
        { stop_id: 'A', departure_time: '10:00:00', stop_sequence: 1, lat: 0, lon: 0, shapeDistTraveled: 0 },
        { stop_id: 'B', departure_time: '10:10:00', stop_sequence: 2, lat: 0, lon: 10, shapeDistTraveled: 10 },
        { stop_id: 'C', departure_time: '10:20:00', stop_sequence: 3, lat: 0, lon: 20, shapeDistTraveled: 20 }
    ]
}, {
    anchorStopId: 'B',
    anchorScheduledDeparture: '2026-01-01T10:10:00Z',
    delaySeconds: 120
}, Date.parse('2026-01-01T10:17:00Z'));

assert.equal(position.source, 'estimated');
assert.equal(position.isApproximate, true);
assert.equal(position.shapeDistTraveled, 15);
assert.deepEqual(position.coordinates, [15, 0]);
assert.equal(position.lastStopId, 'B');
assert.equal(position.nextStopId, 'C');

console.log('trip vehicle estimate self-check passed');
