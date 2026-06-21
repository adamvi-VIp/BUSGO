import React, { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import busIcon from '../assets/bus-icon.png';
import busStationBoxIcon from '../assets/busstationbox.png';
import stationBoxIcon from '../assets/stationbox.png';
import nightIcon from '../assets/night-icon.png';
// Import generated colored icons & SVGs
// Import generated colored icons & SVGs replacement
import tramIcon from '../assets/tram-icon.png';
import metroAIcon from '../assets/metroA-icon.png';
import metroBIcon from '../assets/metroB-icon.png';
import metroCIcon from '../assets/metroC-icon.png';
import trainIcon from '../assets/train-icon.png';
import ferryIcon from '../assets/ferry-icon.png';
import trolleybusIcon from '../assets/trolleybus-icon.png';

// Import Dimmed Icons
import busIconDimmed from '../assets/bus-icon-dimmed.png';
import tramIconDimmed from '../assets/tram-icon-dimmed.png';
import metroAIconDimmed from '../assets/metroA-icon-dimmed.png';
import metroBIconDimmed from '../assets/metroB-icon-dimmed.png';
import metroCIconDimmed from '../assets/metroC-icon-dimmed.png';
import trainIconDimmed from '../assets/train-icon-dimmed.png';
import ferryIconDimmed from '../assets/ferry-icon-dimmed.png';
import trolleybusIconDimmed from '../assets/trolleybus-icon-dimmed.png';
import nightIconDimmed from '../assets/night-icon-dimmed.png';
import { splitLineByProgress } from '../utils/routeSegments.js';

const DEFAULT_CENTER = [14.4378, 50.0755]; // Prague
const DEFAULT_ZOOM = 16;
const EMPTY_LINE = { type: 'LineString', coordinates: [] };

function lineFeature(geometry = EMPTY_LINE, properties = {}) {
  return { type: 'Feature', geometry, properties };
}

function vehicleToGeoJSON(position) {
  return {
    type: 'FeatureCollection',
    features: position?.coordinates
      ? [lineFeature({ type: 'Point', coordinates: position.coordinates }, { bearing: position.bearing || 0 })]
      : []
  };
}

function metroLinesToGeoJSON(metroLines, activeShortName) {
  const features = Array.isArray(metroLines?.features) ? metroLines.features : [];
  return {
    type: 'FeatureCollection',
    features: features.map(feature => ({
      ...feature,
      properties: {
        ...(feature.properties || {}),
        is_active: !!activeShortName && String(feature.properties?.route_short_name) === String(activeShortName)
      }
    }))
  };
}

function getIconName(stop, isTripActive = false, isSelectionOverlay = false) {
  if (!stop) return 'bus-icon';

  let base = 'bus-icon';
  if (stop.is_night) {
    base = 'night-icon';
  } else {
    switch (stop.mainTrafficType) {
      case 'tram': base = 'tram-icon'; break;
      case 'metroA': base = 'metroA-icon'; break;
      case 'metroB': base = 'metroB-icon'; break;
      case 'metroC': base = 'metroC-icon'; break;
      case 'train': base = 'train-icon'; break;
      case 'ferry': base = 'ferry-icon'; break;
      case 'trolleybus': base = 'trolleybus-icon'; break;
      default: base = 'bus-icon';
    }
  }

  // If trip active OR station selected, use dimmed variant.
  return (isTripActive || isSelectionOverlay) ? `${base}-dimmed` : base;
}

function stopsToGeoJSON(stops) {
  return {
    type: 'FeatureCollection',
    features: (stops || [])
      .filter(s => s && s.lat !== undefined && s.lon !== undefined && !isNaN(s.lat) && !isNaN(s.lon))
      .map(s => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [s.lon, s.lat] },
        properties: { ...s, icon_name: getIconName(s, false, false) }
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

function selectedToGeoJSON(stop, isTripActive = false) {
  return {
    type: 'FeatureCollection',
    features: stop && stop.lat !== undefined && stop.lon !== undefined && !isNaN(stop.lat) && !isNaN(stop.lon)
      ? [{
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [stop.lon, stop.lat] },
        properties: { ...stop, id: stop.uniqueStopPointId, icon_name: getIconName(stop, isTripActive, true) }
      }]
      : []
  };
}

function stopIdExpression(field, ids) {
  return ['in', ['string', ['get', field]], ['literal', (ids || []).map(String)]];
}

function routeStopOpacityExpression(selectedStop, highlightedStopIds, nextStopId) {
  const selectedId = String(selectedStop?.uniqueStopPointId || '');
  if (!selectedId) return 1;
  if (!highlightedStopIds || highlightedStopIds.length === 0) {
    return ['case', ['==', ['string', ['get', 'uniqueStopPointId']], selectedId], 0, 1];
  }

  return ['case',
    ['==', ['string', ['get', 'uniqueStopPointId']], selectedId], 0,
    ['any', stopIdExpression('uniqueStopPointId', [nextStopId]), stopIdExpression('gtfsId', [nextStopId])], 1,
    ['any', stopIdExpression('uniqueStopPointId', highlightedStopIds), stopIdExpression('gtfsId', highlightedStopIds)], 0.78,
    0.14
  ];
}

function routeStopSizeExpression(highlightedStopIds, nextStopId) {
  const base = ['interpolate', ['linear'], ['zoom'], 12, 0.5, 16, 1];
  if (!highlightedStopIds || highlightedStopIds.length === 0) return base;
  return ['case',
    ['any', stopIdExpression('uniqueStopPointId', [nextStopId]), stopIdExpression('gtfsId', [nextStopId])],
    ['interpolate', ['linear'], ['zoom'], 12, 0.7, 16, 1.25],
    ['any', stopIdExpression('uniqueStopPointId', highlightedStopIds), stopIdExpression('gtfsId', highlightedStopIds)],
    ['interpolate', ['linear'], ['zoom'], 12, 0.55, 16, 1.05],
    base
  ];
}

const MapGL = ({ stops, userLocation, onStopSelect, selectedStop, socket, isRefreshing, programmaticMoveRef,
  setMapReady,
  highlightedStopIds,
  tripStops,
  routeGeometry,
  routeShapeDistances,
  routeColor,
  routeShortName,
  tripVehiclePosition,
  metroLines,
  activeTripId
}) => {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const lastCenterRef = useRef(null);
  const lastEmitTsRef = useRef(0);
  const busClickHandlerRef = React.useRef(null);
  const stationClickHandlerRef = React.useRef(null);
  const initialUserMoveDoneRef = useRef(false);
  const lastFocusedTripIdRef = useRef(null);
  const metroLinesRef = useRef(metroLines);
  const routeShortNameRef = useRef(routeShortName);

  useEffect(() => {
    metroLinesRef.current = metroLines;
    routeShortNameRef.current = routeShortName;
  }, [metroLines, routeShortName]);

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
          loadImage('bus-icon', busIcon),
          loadImage('selected-station-box', busStationBoxIcon),
          loadImage('station-icon', stationBoxIcon),
          loadImage('night-icon', nightIcon),
          loadImage('tram-icon', tramIcon),
          loadImage('metroA-icon', metroAIcon),
          loadImage('metroB-icon', metroBIcon),
          loadImage('metroC-icon', metroCIcon),
          loadImage('train-icon', trainIcon),
          loadImage('ferry-icon', ferryIcon),
          loadImage('trolleybus-icon', trolleybusIcon),

          // Load Dimmed Icons
          loadImage('bus-icon-dimmed', busIconDimmed),
          loadImage('tram-icon-dimmed', tramIconDimmed),
          loadImage('metroA-icon-dimmed', metroAIconDimmed),
          loadImage('metroB-icon-dimmed', metroBIconDimmed),
          loadImage('metroC-icon-dimmed', metroCIconDimmed),
          loadImage('train-icon-dimmed', trainIconDimmed),
          loadImage('ferry-icon-dimmed', ferryIconDimmed),
          loadImage('trolleybus-icon-dimmed', trolleybusIconDimmed),
          loadImage('night-icon-dimmed', nightIconDimmed)
        ]);

        // Canvas overlay generation removed (replaced by dimmed icons)

        // --- LAYER ORDERING STRATEGY ---
        // New Strategy:
        // 1. All Other Stops (Bottom)
        // 2. Selected Stop (Top)

        map.addSource('metro-lines', { type: 'geojson', data: metroLinesToGeoJSON(metroLinesRef.current, routeShortNameRef.current) });
        map.addLayer({
          id: 'metro-lines-layer',
          type: 'line',
          source: 'metro-lines',
          layout: { 'line-join': 'round', 'line-cap': 'round' },
          paint: {
            'line-color': ['coalesce', ['get', 'route_color'], '#ffffff'],
            'line-width': ['case', ['boolean', ['get', 'is_active'], false], 5, 3],
            'line-opacity': ['case', ['boolean', ['get', 'is_active'], false], 0.65, 0.22]
          }
        });

        const initialSegments = splitLineByProgress(routeGeometry, routeShapeDistances, tripVehiclePosition);
        map.addSource('route-past', { type: 'geojson', data: lineFeature(initialSegments.past) });
        map.addSource('route-future', { type: 'geojson', data: lineFeature(initialSegments.future) });

        map.addLayer({
          id: 'route-past-layer',
          type: 'line',
          source: 'route-past',
          layout: { 'line-join': 'round', 'line-cap': 'round' },
          paint: {
            'line-color': routeColor || '#3b82f6',
            'line-width': 4,
            'line-opacity': 0.28
          }
        });

        map.addLayer({
          id: 'route-future-layer',
          type: 'line',
          source: 'route-future',
          layout: { 'line-join': 'round', 'line-cap': 'round' },
          paint: {
            'line-color': routeColor || '#3b82f6',
            'line-width': 5,
            'line-opacity': 0.9
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
            'icon-image': ['get', 'icon_name'],
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

        // 4. Selected Stop (ALWAYS ON TOP)
        const isTripActiveInitial = !!(highlightedStopIds && highlightedStopIds.length > 0);
        map.addSource('selected-stop', { type: 'geojson', data: selectedToGeoJSON(selectedStop, isTripActiveInitial) });

        map.addLayer({
          id: 'selected-stop-bus',
          type: 'symbol',
          source: 'selected-stop',
          layout: {
            'icon-image': ['get', 'icon_name'],
            'icon-size': ['interpolate', ['linear'], ['zoom'], 12, 0.5, 16, 1],
            'icon-allow-overlap': true,
            'icon-ignore-placement': true
          },
          paint: {
            'icon-opacity': 0, // Start invisible, fade in
            'icon-opacity-transition': { duration: 300 }
          }
        });

        map.addSource('live-bus', { type: 'geojson', data: vehicleToGeoJSON(tripVehiclePosition) });
        map.addLayer({
          id: 'live-bus-layer',
          type: 'symbol',
          source: 'live-bus',
          layout: {
            'icon-image': 'bus-icon',
            'icon-size': ['interpolate', ['linear'], ['zoom'], 12, 0.65, 16, 1.15],
            'icon-allow-overlap': true,
            'icon-ignore-placement': true,
            'icon-rotate': ['get', 'bearing'],
            'icon-rotation-alignment': 'map'
          },
          paint: {
            'icon-opacity': 1
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
          try {
            const routeStopIds = highlightedStopIds?.length ? highlightedStopIds : (tripStops || []).map(stop => stop.uniqueStopPointId || stop.gtfsId);
            const opacityExpression = routeStopOpacityExpression(selectedStop, routeStopIds, tripVehiclePosition?.nextStopId);
            if (map.getLayer('bus-stops')) {
              map.setPaintProperty('bus-stops', 'icon-opacity', opacityExpression);
              map.setLayoutProperty('bus-stops', 'icon-size', routeStopSizeExpression(routeStopIds, tripVehiclePosition?.nextStopId));
            }

            if (map.getLayer('selected-stop-bus')) {
              map.setPaintProperty('selected-stop-bus', 'icon-opacity', 1);
            }
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
    const isTripActive = !!(highlightedStopIds && highlightedStopIds.length > 0);
    if (src && src.setData) src.setData(selectedToGeoJSON(selectedStop, isTripActive));

    // Update OPACITY on main layers to hide selected stop smoothly (instead of filtering/blinking)
    const id = selectedStop?.uniqueStopPointId;
    if (id) {
      try {
        const nextStopId = tripVehiclePosition?.nextStopId;
        const routeStopIds = highlightedStopIds?.length ? highlightedStopIds : (tripStops || []).map(stop => stop.uniqueStopPointId || stop.gtfsId);
        const opacityExpression = routeStopOpacityExpression(selectedStop, routeStopIds, nextStopId);

        if (map.getLayer('bus-stops')) {
          map.setPaintProperty('bus-stops', 'icon-opacity', opacityExpression);
          map.setLayoutProperty('bus-stops', 'icon-size', routeStopSizeExpression(routeStopIds, nextStopId));
        }

        if (map.getLayer('selected-stop-bus')) {
          map.setPaintProperty('selected-stop-bus', 'icon-opacity', 1);
          // Maintain consistent sizing
          const selectedSize = ['interpolate', ['linear'], ['zoom'], 12, 0.5, 16, 1];
          map.setLayoutProperty('selected-stop-bus', 'icon-size', selectedSize);
        }
      } catch (e) { console.error('[MapGL] Error updating highlight styles:', e); }
    } else {
      // Reset styles if no selection
      try {
        if (map.getLayer('bus-stops')) {
          map.setPaintProperty('bus-stops', 'icon-opacity', 1);
          map.setLayoutProperty('bus-stops', 'icon-size', ['interpolate', ['linear'], ['zoom'], 12, 0.5, 16, 1]);
        }

        if (map.getLayer('selected-stop-bus')) {
          map.setPaintProperty('selected-stop-bus', 'icon-opacity', 0);
        }
      } catch (e) { }
    }

  }, [selectedStop, highlightedStopIds, tripStops, tripVehiclePosition]); // Added highlightedStopIds dependency

  // Focus selected trip once on the live vehicle, then leave user pan/zoom alone.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!activeTripId) {
      lastFocusedTripIdRef.current = null;
      return;
    }

    if (lastFocusedTripIdRef.current === activeTripId) return;
    const center = tripVehiclePosition?.coordinates;
    if (!center) return;

    try {
      if (programmaticMoveRef) programmaticMoveRef.current = true;
      map.flyTo({ center, zoom: 16.5, duration: 900, essential: true });
      lastFocusedTripIdRef.current = activeTripId;
    } catch (e) {
      console.error('[MapGL] Error focusing live vehicle:', e);
    }
  }, [activeTripId, tripVehiclePosition, programmaticMoveRef]);

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
        const id = f.properties && f.properties.uniqueStopPointId ? String(f.properties.uniqueStopPointId) : null;
        const gtfsIdFallback = f.properties && f.properties.gtfsId ? String(f.properties.gtfsId) : null;

        console.log('[MapGL] Clicked Feature IDs (Normalized):', { unique: id, gtfs: gtfsIdFallback });

        let stop = null;

        // Primary Lookup
        if (id) {
          stop = (stops || []).find(s => s.uniqueStopPointId === id);
        }

        // Secondary Lookup (Fallback)
        if (!stop && gtfsIdFallback) {
          console.warn('[MapGL] Primary ID lookup failed. Trying GTFS ID fallback:', gtfsIdFallback);
          stop = (stops || []).find(s => s.gtfsId === gtfsIdFallback);
        }

        if (!stop) {
          console.error('[MapGL] Stop NOT found in stops array. Lookup failed for:', { unique: id, gtfs: gtfsIdFallback });
          if (stops && stops.length > 0) {
            console.log('[MapGL] Sample available IDs:', stops.slice(0, 3).map(s => `${s.uniqueStopPointId}|${s.gtfsId}`));
          }
        } else {
          console.log('[MapGL] Stop found:', stop.name);
        }

        if (stop && typeof onStopSelect === 'function') {
          // Only trigger haptic if this is a NEW selection
          const isAlreadySelected = selectedStop && (
            (stop.uniqueStopPointId && String(selectedStop.uniqueStopPointId) === String(stop.uniqueStopPointId)) ||
            (stop.gtfsId && String(selectedStop.gtfsId) === String(stop.gtfsId))
          );
          if (!isAlreadySelected) {
            document.dispatchEvent(new Event('haptic'));
          }
          onStopSelect(stop);
        }
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
  }, [stops, onStopSelect, selectedStop]);

  // Update route line geometry
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const segments = splitLineByProgress(routeGeometry, routeShapeDistances, tripVehiclePosition);
    const past = map.getSource && map.getSource('route-past');
    const future = map.getSource && map.getSource('route-future');
    if (past && past.setData) past.setData(lineFeature(segments.past));
    if (future && future.setData) future.setData(lineFeature(segments.future));

    const color = routeColor || '#3b82f6';
    if (map.getLayer('route-past-layer')) map.setPaintProperty('route-past-layer', 'line-color', color);
    if (map.getLayer('route-future-layer')) map.setPaintProperty('route-future-layer', 'line-color', color);
  }, [routeGeometry, routeShapeDistances, tripVehiclePosition, routeColor]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const src = map.getSource && map.getSource('live-bus');
    if (src && src.setData) src.setData(vehicleToGeoJSON(tripVehiclePosition));
  }, [tripVehiclePosition]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const src = map.getSource && map.getSource('metro-lines');
    if (src && src.setData) src.setData(metroLinesToGeoJSON(metroLines, routeShortName));
  }, [metroLines, routeShortName]);

  // Camera movement: selected stop only (do not move on userLocation updates)
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (selectedStop && selectedStop.lat !== undefined && selectedStop.lon !== undefined && !isNaN(selectedStop.lat) && !isNaN(selectedStop.lon)) {
      if (programmaticMoveRef) programmaticMoveRef.current = true;
      map.flyTo({ center: [selectedStop.lon, selectedStop.lat], zoom: DEFAULT_ZOOM, duration: 1000, essential: true });
    }
  }, [selectedStop]);

  // Camera Reset: When active trip focus ends, fly back to the station
  // This handles the "Auto-Restore" map behavior
  const prevHighlightedRef = useRef(highlightedStopIds);
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const wasActive = prevHighlightedRef.current && prevHighlightedRef.current.length > 0;
    const isActive = highlightedStopIds && highlightedStopIds.length > 0;

    // If we just lost focus (Active -> None) AND we have a selected stop selected
    if (wasActive && !isActive && selectedStop) {
      if (selectedStop.lat !== undefined && selectedStop.lon !== undefined) {
        if (programmaticMoveRef) programmaticMoveRef.current = true;
        map.flyTo({
          center: [selectedStop.lon, selectedStop.lat],
          zoom: DEFAULT_ZOOM,
          duration: 1200, // Slightly slower for a relaxed "return" feel
          essential: true
        });
      }
    }

    prevHighlightedRef.current = highlightedStopIds;
  }, [highlightedStopIds, selectedStop]);

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

  // Handle programmatic moves from custom events (e.g. location button click)
  useEffect(() => {
    const handleMapMove = (e) => {
      const map = mapRef.current;
      if (!map) return;
      const { center, zoom, duration = 1000 } = e.detail || {};
      if (center) {
        if (programmaticMoveRef) programmaticMoveRef.current = true;
        map.flyTo({ center, zoom: zoom || DEFAULT_ZOOM, duration, essential: true });
      }
    };

    window.addEventListener('map-move', handleMapMove);
    return () => window.removeEventListener('map-move', handleMapMove);
  }, [programmaticMoveRef]);

  return (
    <div className="absolute inset-0 z-0 h-full w-full">
      <div ref={containerRef} style={{ height: '100%', width: '100%' }} />
    </div>
  );
};

export default MapGL;
