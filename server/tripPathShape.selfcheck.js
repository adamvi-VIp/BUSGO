import assert from 'node:assert/strict';

process.env.PID_API_KEY ||= 'self-check';

const { shapeFeaturesToLineString, shapeFeaturesToPath } = await import('./server.js');

const geometry = shapeFeaturesToLineString({
    features: [
        { geometry: { type: 'Point', coordinates: [14.3, 50.3] }, properties: { shape_pt_sequence: 3 } },
        { geometry: { type: 'Point', coordinates: [14.1, 50.1] }, properties: { shape_pt_sequence: 1 } },
        { geometry: { type: 'Point', coordinates: [14.2, 50.2] }, properties: { shape_pt_sequence: 2 } }
    ]
});

assert.deepEqual(geometry, {
    type: 'LineString',
    coordinates: [
        [14.1, 50.1],
        [14.2, 50.2],
        [14.3, 50.3]
    ]
});

assert.deepEqual(shapeFeaturesToPath({
    features: [
        { geometry: { type: 'Point', coordinates: [14.3, 50.3] }, properties: { shape_pt_sequence: 3, shape_dist_traveled: 3 } },
        { geometry: { type: 'Point', coordinates: [14.1, 50.1] }, properties: { shape_pt_sequence: 1, shape_dist_traveled: 1 } },
        { geometry: { type: 'Point', coordinates: [14.2, 50.2] }, properties: { shape_pt_sequence: 2, shape_dist_traveled: 2 } }
    ]
}).shapeDistances, [1, 2, 3]);

console.log('trip path shape self-check passed');
