import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '..');

const assetFiles = {
  bus: 'busgo/src/assets/bus-icon.png',
  tram: 'busgo/src/assets/tram-icon.png',
  metroB: 'busgo/src/assets/metroB-icon.png',
  metroC: 'busgo/src/assets/metroC-icon.png',
  train: 'busgo/src/assets/train-icon.png',
  trolleybus: 'busgo/src/assets/trolleybus-icon.png',
  vehicle: 'busgo/src/assets/Bus_from_top.png',
  selectedStation: 'busgo/src/assets/busstationbox.png'
};

const assets = {};
for (const [name, relativePath] of Object.entries(assetFiles)) {
  const data = await fs.readFile(path.join(root, relativePath));
  assets[name] = `data:image/png;base64,${data.toString('base64')}`;
}

const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Onest:wght@100..900&display=swap" rel="stylesheet">
  <link href="https://unpkg.com/maplibre-gl@5.9.0/dist/maplibre-gl.css" rel="stylesheet" />
  <style>
    html, body { margin: 0; background: #000; }
    #hero { position: relative; width: 1200px; height: 420px; overflow: hidden; background: #000; }
    #map { position: absolute; inset: 0; }
    #shade {
      position: absolute; inset: 0; pointer-events: none;
      background: radial-gradient(ellipse at center, rgba(0,0,0,.05) 0%, rgba(0,0,0,.04) 38%, rgba(0,0,0,.20) 100%);
    }
    #wordmark {
      position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
      font-family: 'Onest', Inter, Arial, sans-serif; font-size: 138px; font-weight: 900;
      letter-spacing: -5px; color: #2563eb; -webkit-text-stroke: 4px #fff;
      paint-order: stroke fill; text-shadow: 0 5px 18px rgba(0,0,0,.82); user-select: none;
    }
    .maplibregl-canvas { outline: none; }
  </style>
</head>
<body>
  <div id="hero">
    <div id="map"></div>
    <div id="shade"></div>
    <div id="wordmark">BusGo</div>
  </div>
  <script src="https://unpkg.com/maplibre-gl@5.9.0/dist/maplibre-gl.js"></script>
  <script>
    const ASSETS = ${JSON.stringify(assets)};

    // Same raster basemap configuration used by BusGo's MapGL.jsx.
    const style = {
      version: 8,
      glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
      sources: {
        'carto-dark': {
          type: 'raster',
          tiles: [
            'https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
            'https://b.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
            'https://c.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
            'https://d.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
          ],
          tileSize: 256,
          attribution: ''
        }
      },
      layers: [{
        id: 'carto-dark-layer',
        type: 'raster',
        source: 'carto-dark',
        paint: {
          'raster-brightness-min': 0.05,
          'raster-brightness-max': 1.0,
          'raster-contrast': -0.08,
          'raster-saturation': -0.15,
          'raster-opacity': 0.98
        }
      }]
    };

    // Central Prague around Florenc / Namesti Republiky / Hlavni nadrazi.
    const map = new maplibregl.Map({
      container: 'map',
      style,
      center: [14.4355, 50.0882],
      zoom: 15.45,
      attributionControl: false,
      interactive: false,
      preserveDrawingBuffer: true
    });

    const loadImage = (name, src, width = 48, height = 48) => new Promise(resolve => {
      const img = new Image(width, height);
      img.crossOrigin = 'anonymous';
      img.src = src;
      img.onload = () => { if (!map.hasImage(name)) map.addImage(name, img); resolve(); };
      img.onerror = resolve;
    });

    map.on('load', async () => {
      await Promise.all([
        loadImage('bus-icon', ASSETS.bus),
        loadImage('tram-icon', ASSETS.tram),
        loadImage('metroB-icon', ASSETS.metroB),
        loadImage('metroC-icon', ASSETS.metroC),
        loadImage('train-icon', ASSETS.train),
        loadImage('trolleybus-icon', ASSETS.trolleybus),
        loadImage('vehicle-icon', ASSETS.vehicle, 40, 80),
        loadImage('selected-station-box', ASSETS.selectedStation)
      ]);

      // Metro lines are rendered the same way as BusGo: colored lines beneath the stop symbols.
      map.addSource('metro-lines', {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: [
            {
              type: 'Feature',
              properties: { route_color: '#FBCB0A' },
              geometry: { type: 'LineString', coordinates: [[14.4238,50.0864],[14.4285,50.0877],[14.4396,50.0905],[14.4513,50.0926]] }
            },
            {
              type: 'Feature',
              properties: { route_color: '#E31E24' },
              geometry: { type: 'LineString', coordinates: [[14.4307,50.0797],[14.4329,50.0833],[14.4396,50.0905],[14.4387,50.0998]] }
            }
          ]
        }
      });
      map.addLayer({
        id: 'metro-lines-layer', type: 'line', source: 'metro-lines',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: { 'line-color': ['get','route_color'], 'line-width': 3, 'line-opacity': 0.22 }
      });

      const stops = [
        { coordinates: [14.4285,50.0877], icon: 'metroB-icon' },
        { coordinates: [14.4396,50.0905], icon: 'metroC-icon' },
        { coordinates: [14.4332,50.0832], icon: 'metroC-icon' },
        { coordinates: [14.4357,50.0871], icon: 'train-icon' },
        { coordinates: [14.4367,50.0914], icon: 'tram-icon' },
        { coordinates: [14.4297,50.0855], icon: 'tram-icon' },
        { coordinates: [14.4422,50.0918], icon: 'bus-icon' },
        { coordinates: [14.4261,50.0898], icon: 'bus-icon' },
        { coordinates: [14.4473,50.0875], icon: 'trolleybus-icon' },
        { coordinates: [14.4324,50.0928], icon: 'bus-icon' }
      ];

      map.addSource('stops', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: stops.map(s => ({
          type: 'Feature', geometry: { type: 'Point', coordinates: s.coordinates }, properties: { icon_name: s.icon }
        })) }
      });
      map.addLayer({
        id: 'bus-stops', type: 'symbol', source: 'stops',
        layout: {
          'icon-image': ['get','icon_name'],
          'icon-size': ['interpolate',['linear'],['zoom'],12,0.5,16,1],
          'icon-allow-overlap': true,
          'icon-ignore-placement': true
        },
        paint: { 'icon-opacity': 1 }
      });

      // A selected stop and live vehicle use the same repo assets as the real map.
      map.addSource('selected-stop', {
        type: 'geojson', data: { type: 'FeatureCollection', features: [{
          type: 'Feature', geometry: { type: 'Point', coordinates: [14.4396,50.0905] }, properties: {}
        }] }
      });
      map.addLayer({
        id: 'selected-stop-box', type: 'symbol', source: 'selected-stop',
        layout: { 'icon-image': 'selected-station-box', 'icon-size': 0.9, 'icon-allow-overlap': true }
      });

      map.addSource('vehicle', {
        type: 'geojson', data: { type: 'FeatureCollection', features: [{
          type: 'Feature', geometry: { type: 'Point', coordinates: [14.4342,50.0862] }, properties: { bearing: 34 }
        }] }
      });
      map.addLayer({
        id: 'vehicle-layer', type: 'symbol', source: 'vehicle',
        layout: {
          'icon-image': 'vehicle-icon', 'icon-size': 0.48,
          'icon-rotate': ['get','bearing'], 'icon-rotation-alignment': 'map',
          'icon-allow-overlap': true, 'icon-ignore-placement': true
        }
      });

      window.__BUSGO_HERO_READY__ = true;
    });
  </script>
</body>
</html>`;

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(html);
});

await new Promise(resolve => server.listen(4173, '127.0.0.1', resolve));

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 420 }, deviceScaleFactor: 2 });
  await page.goto('http://127.0.0.1:4173', { waitUntil: 'networkidle', timeout: 120000 });
  await page.waitForFunction(() => window.__BUSGO_HERO_READY__ === true, { timeout: 120000 });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(2500);
  await page.locator('#hero').screenshot({ path: path.join(root, 'docs/busgo-map-hero.png') });
} finally {
  await browser.close();
  server.close();
}
