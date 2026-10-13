export function getBasemapStyle(cartoApiKey = '') {
  const key = cartoApiKey.trim();
  const osmAttribution = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>';

  return {
    version: 8,
    glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
    sources: {
      basemap: {
        type: 'raster',
        tiles: [key
          ? `https://basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png?key=${encodeURIComponent(key)}`
          : 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
        tileSize: 256,
        maxzoom: key ? 20 : 19,
        attribution: osmAttribution + (key ? ' &copy; <a href="https://carto.com/attributions">CARTO</a>' : '')
      }
    },
    layers: [{
      id: 'basemap-layer',
      type: 'raster',
      source: 'basemap',
      paint: key ? {
        'raster-brightness-min': 0.05,
        'raster-brightness-max': 1.0,
        'raster-contrast': -0.08,
        'raster-saturation': -0.15,
        'raster-opacity': 0.98
      } : {}
    }]
  };
}
