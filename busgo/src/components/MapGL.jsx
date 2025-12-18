import React, { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import busStationBoxIcon from '../assets/busstationbox.png';
import stationBoxIcon from '../assets/stationbox.png';
import nightIcon from '../assets/night-icon.png';
// Import generated colored icons & SVGs
import tramIcon from '../assets/tram-icon.png';
import metroAIcon from '../assets/metroA_v2.svg';
import metroBIcon from '../assets/metroB_v2.svg';
import metroCIcon from '../assets/metroC_v2.svg';
import trainIcon from '../assets/train-icon.png';
import ferryIcon from '../assets/ferry-icon.png';
import trolleybusIcon from '../assets/trolleybus-icon.png';

const DEFAULT_CENTER = [14.4378, 50.0755]; // Prague
const DEFAULT_ZOOM = 16;

function stopsToGeoJSON(stops) {
  return {
    type: 'FeatureCollection',
    features: (stops || [])
      .filter(s => s && s.lat !== undefined && s.lon !== undefined && !isNaN(s.lat) && !isNaN(s.lon))
      .map(s => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [s.lon, s.lat] },
        properties: { ...s }
      }))
  };
}

function userToGeoJSON(loc) {
  return {
    type: 'FeatureCollection',
    features: loc && loc.latitude !== undefined && loc.longitude !== undefined
      ? [{ type: 'Feature', geometry: { type: 'Point', coordinates: [loc.longitude, loc.latitude] }, properties: {} }]
      : []
  };
}

function selectedToGeoJSON(stop) {
  return {
    type: 'FeatureCollection',
    features: stop && stop.lat !== undefined && stop.lon !== undefined && !isNaN(stop.lat) && !isNaN(stop.lon)
      ? [{ type: 'Feature', geometry: { type: 'Point', coordinates: [stop.lon, stop.lat] }, properties: { ...stop, id: stop.uniqueStopPointId } }]
      : []
  };
}

const MapGL = ({ stops, userLocation, onStopSelect, selectedStop, socket, isRefreshing, programmaticMoveRef, setMapReady }) => {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const lastCenterRef = useRef(null);
  const lastEmitTsRef = useRef(0);
  const busClickHandlerRef = React.useRef(null);
  const stationClickHandlerRef = React.useRef(null);
  const initialUserMoveDoneRef = useRef(false);

  useEffect(() => {
    const center = selectedStop && selectedStop.lat !== undefined && selectedStop.lon !== undefined && !isNaN(selectedStop.lat) && !isNaN(selectedStop.lon)
      ? [selectedStop.lon, selectedStop.lat]
      : (userLocation && userLocation.latitude !== undefined && userLocation.longitude !== undefined
        ? [userLocation.longitude, userLocation.latitude]
        : DEFAULT_CENTER);

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
      layers: [
        {
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
        }
      ]
    };

    const map = new maplibregl.Map({
      container: containerRef.current,
      style,
      center,
      zoom: DEFAULT_ZOOM,
      attributionControl: false,
      dragRotate: false, // Disable right-click drag rotation
      touchPitch: false  // Disable touch pitch (often confusing with 2D maps)
    });

    // Disable pinch-to-rotate specific behavior while keeping pinch-to-zoom
    map.touchZoomRotate.disableRotation();

    mapRef.current = map;

    // Fix for map going black or losing context on resume/resize
    const handleMapResize = () => {
      try {
        if (map) {
          map.resize();
          map.triggerRepaint();
        }
      } catch (e) {
        // failed to resize
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        // Small delay to ensure container is ready
        setTimeout(handleMapResize, 100);
      }
    };

    map.on('load', async () => {
      try {
        const loadImage = (name, url) => new Promise((resolve) => {
          const img = new Image(48, 48); // Standardize to 48x48 for all, including SVGs
          img.crossOrigin = 'anonymous';
          img.src = url;
          img.onload = () => { if (!map.hasImage(name)) map.addImage(name, img); resolve(); };
          img.onerror = () => resolve();
        });

        await Promise.all([
          loadImage('bus-icon', busStationBoxIcon),
          loadImage('station-icon', stationBoxIcon),
          loadImage('night-icon', nightIcon),
          loadImage('tram-icon', tramIcon),
          loadImage('metroA-icon', metroAIcon),
          loadImage('metroB-icon', metroBIcon),
          loadImage('metroC-icon', metroCIcon),
          loadImage('train-icon', trainIcon),
          loadImage('ferry-icon', ferryIcon),
          loadImage('trolleybus-icon', trolleybusIcon)
        ]);

        // Add rounded-square overlay image for selected stop
        if (!map.hasImage('selected-stop-overlay')) {
          const overlaySize = 48;
          const cornerRadius = 8; // rounded-lg
          const canvas = document.createElement('canvas');
          canvas.width = overlaySize;
          canvas.height = overlaySize;
          const ctx = canvas.getContext('2d');
          ctx.clearRect(0, 0, overlaySize, overlaySize);
          ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
          const r = cornerRadius;
          ctx.beginPath();
          ctx.moveTo(r, 0);
          ctx.lineTo(overlaySize - r, 0);
          ctx.quadraticCurveTo(overlaySize, 0, overlaySize, r);
          ctx.lineTo(overlaySize, overlaySize - r);
          ctx.quadraticCurveTo(overlaySize, overlaySize, overlaySize - r, overlaySize);
          ctx.lineTo(r, overlaySize);
          ctx.quadraticCurveTo(0, overlaySize, 0, overlaySize - r);
          ctx.lineTo(0, r);
          ctx.quadraticCurveTo(0, 0, r, 0);
          ctx.closePath();
          ctx.fill();
          const imageData = ctx.getImageData(0, 0, overlaySize, overlaySize);
          try { map.addImage('selected-stop-overlay', imageData); } catch { }
        }

        // --- LAYER ORDERING STRATEGY ---
        // 1. Selected Stop Icons (Bottom) - to be covered by darkener
        // 2. Selected Stop Darkener (Middle) - covers selected stop
        // 3. All Other Stops (Top) - drawn 'fresh' on top of any darkeners beneath them.

        map.addSource('selected-stop', { type: 'geojson', data: selectedToGeoJSON(selectedStop) });

        // 1. Selected Stop Icon (Universal - rendered UNDER the darkener)
        map.addLayer({
          id: 'selected-stop-bus',
          type: 'symbol',
          source: 'selected-stop',
          layout: {
            'icon-image': [
              'case',
              ['to-boolean', ['get', 'is_night']], 'night-icon',
              ['match', ['get', 'mainTrafficType'],
                'tram', 'tram-icon',
                'metroA', 'metroA-icon',
                'metroB', 'metroB-icon',
                'metroC', 'metroC-icon',
                'train', 'train-icon',
                'ferry', 'ferry-icon',
                'trolleybus', 'trolleybus-icon',
                'bus-icon' // Default
              ]
            ],
            'icon-size': ['interpolate', ['linear'], ['zoom'], 12, 0.5, 16, 1],
            'icon-allow-overlap': true,
            'icon-ignore-placement': true
          },
          paint: {
            'icon-opacity': 0, // Start invisible, fade in
            'icon-opacity-transition': { duration: 300 }
          }
        });

        // 2. Darkener (Middle)
        map.addLayer({
          id: 'selected-stop-darkener',
          type: 'symbol',
          source: 'selected-stop',
          layout: {
            'icon-image': 'selected-stop-overlay',
            'icon-size': ['interpolate', ['linear'], ['zoom'], 12, 0.5, 16, 1],
            'icon-anchor': 'center',
            'icon-allow-overlap': true,
            'icon-ignore-placement': true
          },
          paint: {
            'icon-opacity': 0, // Start invisible, fade in
            'icon-opacity-transition': { duration: 300 }
          }
        });

        // 3. Main Stops (All stops as Bus Icons)
        map.addSource('stops', { type: 'geojson', data: stopsToGeoJSON(stops) });

        map.addLayer({
          id: 'bus-stops',
          type: 'symbol',
          source: 'stops',
          // No filter = show ALL stops
          layout: {
            'icon-image': [
              'case',
              ['to-boolean', ['get', 'is_night']], 'night-icon',
              ['match', ['get', 'mainTrafficType'],
                'tram', 'tram-icon',
                'metroA', 'metroA-icon',
                'metroB', 'metroB-icon',
                'metroC', 'metroC-icon',
                'train', 'train-icon',
                'ferry', 'ferry-icon',
                'trolleybus', 'trolleybus-icon',
                'bus-icon' // Default
              ]
            ],
            'icon-size': ['interpolate', ['linear'], ['zoom'], 12, 0.5, 16, 1],
            'icon-allow-overlap': true,
            'icon-ignore-placement': true
          },
          paint: {
            'icon-opacity': 1,
            'icon-opacity-transition': { duration: 300 }
            // 'icon-color' removed, using icon-image match instead
          }
        });

        // User location
        map.addSource('user', { type: 'geojson', data: userToGeoJSON(userLocation) });
        map.addLayer({
          id: 'user-location',
          type: 'circle',
          source: 'user',
          paint: {
            'circle-radius': 6,
            'circle-color': '#22c55e',
            'circle-opacity': 0.9,
            'circle-stroke-width': 2,
            'circle-stroke-color': '#22c55e'
          }
        });

        // Update opacity for the first time if selectedStop exists
        if (selectedStop && selectedStop.uniqueStopPointId) {
          const id = selectedStop.uniqueStopPointId;
          try {
            // Cross-Fade: Main Out, Selected In
            map.setPaintProperty('bus-stops', 'icon-opacity', ['case', ['==', ['get', 'uniqueStopPointId'], id], 0, 1]);

            map.setPaintProperty('selected-stop-bus', 'icon-opacity', 1);
            map.setPaintProperty('selected-stop-darkener', 'icon-opacity', 1);
          } catch { }
        }


        // Click handlers are managed by a top-level effect; removed nested hook.
        // Movement monitoring and throttled fetch
        map.on('moveend', () => {
          if (programmaticMoveRef && programmaticMoveRef.current) {
            programmaticMoveRef.current = false;
            return;
          }
          const c = map.getCenter();
          if (!lastCenterRef.current || Math.abs(lastCenterRef.current.lat - c.lat) > 0.002 || Math.abs(lastCenterRef.current.lng - c.lng) > 0.002) {
            lastCenterRef.current = c;
            const now = Date.now();
            if (!lastEmitTsRef.current || (now - lastEmitTsRef.current) > 500) {
              lastEmitTsRef.current = now;
              if (socket && typeof socket.emit === 'function') {
                socket.emit('searchStops', { lat: c.lat, lon: c.lng, timestamp: Date.now(), source: 'map-movement' });
              }
            }
          }
        });

        if (typeof setMapReady === 'function') setMapReady(true);
      } catch (e) {
        // noop
      }
    });

    window.addEventListener('resize', handleMapResize);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('resize', handleMapResize);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      try { map.remove(); } catch { }
    };
  }, []);

  // Update stops
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const src = map.getSource && map.getSource('stops');
    if (src && src.setData) src.setData(stopsToGeoJSON(stops));
  }, [stops]);

  // Update user location
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const src = map.getSource && map.getSource('user');
    if (src && src.setData) src.setData(userToGeoJSON(userLocation));
  }, [userLocation]);

  // Selected stop overlay updater effect
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const src = map.getSource && map.getSource('selected-stop');
    if (src && src.setData) src.setData(selectedToGeoJSON(selectedStop));

    // Update OPACITY on main layers to hide selected stop smoothly (instead of filtering/blinking)
    const id = selectedStop?.uniqueStopPointId;
    if (id) {
      try {
        // Cross-Fade: Main Out, Selected In
        map.setPaintProperty('bus-stops', 'icon-opacity', ['case', ['==', ['get', 'uniqueStopPointId'], id], 0, 1]);

        map.setPaintProperty('selected-stop-bus', 'icon-opacity', 1);
        map.setPaintProperty('selected-stop-darkener', 'icon-opacity', 1);
      } catch { }
    } else {
      // Reset opacity if no selection
      try {
        // Cross-Fade: Main In, Selected Out
        map.setPaintProperty('bus-stops', 'icon-opacity', 1);

        map.setPaintProperty('selected-stop-bus', 'icon-opacity', 0);
        map.setPaintProperty('selected-stop-darkener', 'icon-opacity', 0);
      } catch { }
    }

  }, [selectedStop]);

  // Stop click handlers effect
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const detach = () => {
      if (busClickHandlerRef.current) {
        try { map.off('click', 'bus-stops', busClickHandlerRef.current); } catch { }
        busClickHandlerRef.current = null;
      }
    };

    const attach = () => {
      const handler = (e) => {
        const f = e.features && e.features[0];
        if (!f) return;
        const id = f.properties && f.properties.uniqueStopPointId;
        if (!id) return;
        const stop = (stops || []).find(s => s.uniqueStopPointId === id);
        if (stop && typeof onStopSelect === 'function') onStopSelect(stop);
      };
      busClickHandlerRef.current = handler;
      try { map.on('click', 'bus-stops', busClickHandlerRef.current); } catch { }
    };

    const ensureLayersAndAttach = () => {
      if (!map.getLayer('bus-stops')) return false;
      detach();
      attach();
      return true;
    };

    if (!ensureLayersAndAttach()) {
      const onceIdle = () => {
        ensureLayersAndAttach();
        try { map.off('idle', onceIdle); } catch { }
      };
      map.on('idle', onceIdle);
      return () => { try { map.off('idle', onceIdle); } catch { } detach(); };
    }

    return () => detach();
  }, [stops, onStopSelect]);

  // Camera movement: selected stop only (do not move on userLocation updates)
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (selectedStop && selectedStop.lat !== undefined && selectedStop.lon !== undefined && !isNaN(selectedStop.lat) && !isNaN(selectedStop.lon)) {
      if (programmaticMoveRef) programmaticMoveRef.current = true;
      map.flyTo({ center: [selectedStop.lon, selectedStop.lat], zoom: DEFAULT_ZOOM, duration: 1000, essential: true });
    }
  }, [selectedStop]);

  // One-time camera move to GPS location on first availability
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (initialUserMoveDoneRef.current) return;
    if (selectedStop) return; // do not override a selected stop
    const lat = userLocation && userLocation.latitude;
    const lon = userLocation && userLocation.longitude;
    if (typeof lat !== 'number' || typeof lon !== 'number') return;
    if (programmaticMoveRef) programmaticMoveRef.current = true;
    map.flyTo({ center: [lon, lat], zoom: DEFAULT_ZOOM, duration: 1000, essential: true });
    initialUserMoveDoneRef.current = true;
  }, [userLocation, selectedStop]);

  // Periodic nearby stops refresh every 2 minutes based on current map center
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !socket) return;
    const id = setInterval(() => {
      try {
        const c = map.getCenter();
        if (socket && typeof socket.emit === 'function') {
          socket.emit('searchStops', { lat: c.lat, lon: c.lng, timestamp: Date.now(), source: 'periodic' });
        }
      } catch { }
    }, 120000);
    return () => clearInterval(id);
  }, [socket]);

  return (
    <div className="absolute inset-0 z-0 h-full w-full">
      <div ref={containerRef} style={{ height: '100%', width: '100%' }} />
    </div>
  );
};

export default MapGL;