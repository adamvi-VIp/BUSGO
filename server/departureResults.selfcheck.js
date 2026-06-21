import assert from 'node:assert/strict';
import { collectFulfilledDepartures } from './server.js';

assert.deepEqual(
    collectFulfilledDepartures([
        { status: 'fulfilled', value: { departures: [{ id: 1 }] } },
        { status: 'rejected', reason: new Error('bad stop') },
        { status: 'fulfilled', value: { departures: [{ id: 2 }] } }
    ]),
    [{ id: 1 }, { id: 2 }]
);

assert.deepEqual(
    collectFulfilledDepartures([{ status: 'rejected', reason: new Error('api down') }]),
    []
);

console.log('departure results self-check passed');
