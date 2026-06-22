import assert from 'node:assert/strict';
import { snapVehicleToRoute, splitLineByProgress } from './routeSegments.js';

const geometry = {
  type: 'LineString',
  coordinates: [[0, 0], [10, 0], [20, 0]]
};
const pragueGeometry = {
  type: 'LineString',
  coordinates: [[14.5, 50], [14.51, 50]]
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
  snapVehicleToRoute(geometry, null, { source: 'live', coordinates: [4, 3] }).coordinates,
  [4, 3]
);

assert.deepEqual(
  snapVehicleToRoute(pragueGeometry, null, { source: 'live', coordinates: [14.505, 50.00004], bearing: 27 }),
  { source: 'live', coordinates: [14.505, 50], bearing: 27 }
);

assert.deepEqual(
  splitLineByProgress(pragueGeometry, [0, 100], { source: 'live', coordinates: [14.505, 50.00004], shapeDistTraveled: 100 }).past.coordinates,
  [[14.5, 50], [14.505, 50]]
);

assert.deepEqual(
  splitLineByProgress(pragueGeometry, [0, 100], { source: 'live', coordinates: [14.505, 50.001], shapeDistTraveled: 100 }).past.coordinates,
  [[14.5, 50], [14.505, 50]]
);

assert.deepEqual(
  splitLineByProgress(geometry, [0, 10, 20], null),
  { past: { type: 'LineString', coordinates: [] }, future: geometry }
);

assert.deepEqual(
  splitLineByProgress(geometry, [0, 10, 20], { source: 'live', isPlanned: true, coordinates: [4, 3] }),
  { past: { type: 'LineString', coordinates: [] }, future: geometry }
);

console.log('route segment self-check passed');
