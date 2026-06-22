import assert from 'node:assert/strict';
import { snapVehicleToRoute, splitLineByProgress } from './routeSegments.js';

const geometry = {
  type: 'LineString',
  coordinates: [[0, 0], [10, 0], [20, 0]]
};

assert.deepEqual(
  splitLineByProgress(geometry, [0, 10, 20], { shapeDistTraveled: 15 }).future.coordinates,
  [[15, 0], [20, 0]]
);

assert.deepEqual(
  snapVehicleToRoute(geometry, [0, 10, 20], { shapeDistTraveled: 15 }).coordinates,
  [15, 0]
);

assert.deepEqual(
  splitLineByProgress(geometry, null, { coordinates: [4, 3] }).past.coordinates,
  [[0, 0], [4, 0]]
);

assert.deepEqual(
  snapVehicleToRoute(geometry, null, { coordinates: [4, 3] }).coordinates,
  [4, 0]
);

assert.deepEqual(
  splitLineByProgress(geometry, [0, 10, 20], null),
  { past: { type: 'LineString', coordinates: [] }, future: geometry }
);

console.log('route segment self-check passed');
