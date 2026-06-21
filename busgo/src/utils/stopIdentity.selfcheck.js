import assert from 'node:assert/strict';
import { getStopPrimaryId, stopHasLines, stopMatchesId } from './stopIdentity.js';

const stop = {
  gtfsId: 'U123Z1',
  uniqueStopPointId: 'platform-a',
  gtfsIds: ['U123Z1', 'U123Z2']
};

assert.equal(stopMatchesId(stop, 'U123Z1'), true);
assert.equal(stopMatchesId(stop, 'platform-a'), true);
assert.equal(stopMatchesId(stop, 'U123Z2'), true);
assert.equal(stopMatchesId(stop, 'stale-stop'), false);
assert.equal(stopMatchesId(null, 'U123Z1'), false);
assert.equal(getStopPrimaryId(stop), 'U123Z1');
assert.equal(getStopPrimaryId({ uniqueStopPointId: 42 }), '42');
assert.equal(stopHasLines({ lines: [{ name: '1' }] }), true);
assert.equal(stopHasLines({ lines: [] }), false);

console.log('stop identity self-check passed');
