import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import { build, loadConfigFromFile, loadEnv } from '../busgo/node_modules/vite/dist/node/index.js';
import { getBasemapStyle } from '../busgo/src/utils/basemap.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const configFile = path.join(root, 'busgo/vite.config.js');
for (const key of [undefined, '', '   ']) {
  const style = getBasemapStyle(key);
  assert.deepEqual(style.sources.basemap.tiles, ['https://tile.openstreetmap.org/{z}/{x}/{y}.png']);
  assert.equal(style.sources.basemap.maxzoom, 19, 'Higher zooms must reuse available OSM tiles');
  assert.ok(!style.sources.basemap.attribution.includes('CARTO'));
}
const keyed = getBasemapStyle(' test&key=123 ');
assert.ok(keyed.sources.basemap.tiles[0].endsWith('?key=test%26key%3D123'));
assert.ok(keyed.sources.basemap.attribution.includes('CARTO'));

const listeners = {};
runInNewContext(await readFile(path.join(root, 'busgo/public/service-worker.js'), 'utf8'), {
  URL,
  self: { location: new URL('https://busgo.example/'), addEventListener: (name, handler) => { listeners[name] = handler; } }
});
for (const url of ['https://tile.openstreetmap.org/19/283168/177411.png', 'https://basemaps.cartocdn.com/dark_all/16/35396/22176.png?key=test']) {
  listeners.fetch({ request: { url }, respondWith: () => assert.fail('External tiles must bypass the service-worker asset cache') });
}
const { config } = await loadConfigFromFile({ command: 'build', mode: 'production' }, configFile);
assert.equal(path.resolve(config.envDir), path.resolve(root), 'Vite must read the root .env');
assert.ok(!Object.hasOwn(loadEnv('production', root), 'PID_API_KEY'), 'PID key must stay private');

// Build with fake credentials and inspect the actual files shipped to browsers.
const outDir = await mkdtemp(path.join(tmpdir(), 'busgo-public-check-'));
const originalMapKey = process.env.VITE_CARTO_API_KEY;
const originalPidKey = process.env.PID_API_KEY;
const originalCwd = process.cwd();
process.env.VITE_CARTO_API_KEY = 'busgo-public-map-check';
process.env.PID_API_KEY = 'busgo-private-pid-check';
try {
  // Match npm --prefix busgo run build so Tailwind resolves its content paths.
  process.chdir(path.join(root, 'busgo'));
  await build({ root: path.join(root, 'busgo'), configFile, logLevel: 'warn', build: { outDir, emptyOutDir: true } });
  const assets = await readdir(path.join(outDir, 'assets'));
  const scripts = await Promise.all(assets.filter(name => name.endsWith('.js')).map(name => readFile(path.join(outDir, 'assets', name), 'utf8')));
  const bundle = scripts.join('\n');
  assert.ok(bundle.includes('busgo-public-map-check'), 'Map key must reach the browser');
  assert.ok(!bundle.includes('busgo-private-pid-check'), 'PID key must never reach the browser');
  assert.ok(bundle.includes('basemaps.cartocdn.com/dark_all/'), 'CARTO tiles must remain configured');
  assert.ok(bundle.includes('tile.openstreetmap.org/'), 'Keyless map fallback must be included');
  assert.ok(!bundle.includes('{r}.png'), 'MapLibre does not expand the Leaflet retina placeholder');
  assert.ok(bundle.includes('OpenStreetMap contributors'), 'Map attribution must be included');
  console.log('Public configuration check passed: keyless/keyed maps, zoom limit, tile cache bypass, and private-key exclusion.');
} finally {
  process.chdir(originalCwd);
  if (originalMapKey === undefined) delete process.env.VITE_CARTO_API_KEY;
  else process.env.VITE_CARTO_API_KEY = originalMapKey;
  if (originalPidKey === undefined) delete process.env.PID_API_KEY;
  else process.env.PID_API_KEY = originalPidKey;
  assert.ok(path.resolve(outDir).startsWith(path.resolve(tmpdir()) + path.sep + 'busgo-public-check-'));
  await rm(outDir, { recursive: true, force: true });
}
