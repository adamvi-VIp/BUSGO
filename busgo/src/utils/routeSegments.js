const EMPTY_LINE = { type: 'LineString', coordinates: [] };

function asCoord(value) {
  if (!Array.isArray(value) || value.length < 2) return null;
  const lon = Number(value[0]);
  const lat = Number(value[1]);
  return Number.isFinite(lon) && Number.isFinite(lat) ? [lon, lat] : null;
}

function sameCoord(a, b) {
  return a && b && a[0] === b[0] && a[1] === b[1];
}

function line(coords) {
  return coords.length >= 2 ? { type: 'LineString', coordinates: coords } : EMPTY_LINE;
}

function bearingFrom(a, b) {
  const angle = Math.atan2(b[0] - a[0], b[1] - a[1]) * 180 / Math.PI;
  return (angle + 360) % 360;
}

function splitAt(coords, segmentIndex, point) {
  const splitPoint = asCoord(point);
  if (!splitPoint || segmentIndex < 0) {
    return { past: EMPTY_LINE, future: line(coords) };
  }

  const past = coords.slice(0, segmentIndex + 1);
  if (!sameCoord(past[past.length - 1], splitPoint)) past.push(splitPoint);

  const future = [splitPoint];
  const restStart = sameCoord(coords[segmentIndex + 1], splitPoint) ? segmentIndex + 2 : segmentIndex + 1;
  future.push(...coords.slice(restStart));

  return { past: line(past), future: line(future) };
}

function pointByDistance(coords, distances, progress) {
  const distance = Number(progress);
  if (!Number.isFinite(distance) || !Array.isArray(distances) || distances.length !== coords.length) return null;

  const values = distances.map(Number);
  if (values.some(v => !Number.isFinite(v))) return null;
  if (distance <= values[0]) return { coordinates: coords[0], segmentIndex: 0, bearing: bearingFrom(coords[0], coords[1]) };

  for (let i = 0; i < values.length - 1; i += 1) {
    const start = values[i];
    const end = values[i + 1];
    if (distance > end) continue;

    const span = end - start;
    const ratio = span > 0 ? Math.max(0, Math.min(1, (distance - start) / span)) : 0;
    const a = coords[i];
    const b = coords[i + 1];
    return {
      coordinates: [
        a[0] + (b[0] - a[0]) * ratio,
        a[1] + (b[1] - a[1]) * ratio
      ],
      segmentIndex: i,
      bearing: bearingFrom(a, b)
    };
  }

  return {
    coordinates: coords[coords.length - 1],
    segmentIndex: coords.length - 2,
    bearing: bearingFrom(coords[coords.length - 2], coords[coords.length - 1])
  };
}

function splitByDistance(coords, distances, progress) {
  const point = pointByDistance(coords, distances, progress);
  return point ? splitAt(coords, point.segmentIndex, point.coordinates) : null;
}

function projectPointToSegment(point, a, b) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  const t = len2 ? Math.max(0, Math.min(1, ((point[0] - a[0]) * dx + (point[1] - a[1]) * dy) / len2)) : 0;
  const projected = [a[0] + dx * t, a[1] + dy * t];
  const dist2 = (point[0] - projected[0]) ** 2 + (point[1] - projected[1]) ** 2;
  return { projected, dist2 };
}

function pointByProjection(coords, position) {
  const point = asCoord(position);
  if (!point || coords.length < 2) return null;

  let best = null;
  for (let i = 0; i < coords.length - 1; i += 1) {
    // ponytail: planar math is enough at Prague map scale; use geodesic projection if routes span countries.
    const candidate = projectPointToSegment(point, coords[i], coords[i + 1]);
    if (!best || candidate.dist2 < best.dist2) best = { ...candidate, segmentIndex: i };
  }
  return best ? {
    coordinates: best.projected,
    segmentIndex: best.segmentIndex,
    bearing: bearingFrom(coords[best.segmentIndex], coords[best.segmentIndex + 1])
  } : null;
}

function splitByProjection(coords, position) {
  const point = pointByProjection(coords, position);
  return point ? splitAt(coords, point.segmentIndex, point.coordinates) : null;
}

export function snapVehicleToRoute(geometry, distances, vehiclePosition) {
  const coords = (geometry?.coordinates || []).map(asCoord).filter(Boolean);
  if (coords.length < 2 || !vehiclePosition) return vehiclePosition || null;

  const point = pointByDistance(coords, distances, vehiclePosition.shapeDistTraveled) ||
    pointByProjection(coords, vehiclePosition.coordinates);
  if (!point) return vehiclePosition;

  const bearing = Number(vehiclePosition.bearing);
  return {
    ...vehiclePosition,
    coordinates: point.coordinates,
    bearing: Number.isFinite(bearing) ? bearing : point.bearing
  };
}

export function splitLineByProgress(geometry, distances, vehiclePosition) {
  const coords = (geometry?.coordinates || []).map(asCoord).filter(Boolean);
  if (coords.length < 2) return { past: EMPTY_LINE, future: EMPTY_LINE };
  if (!vehiclePosition) return { past: EMPTY_LINE, future: line(coords) };

  const byDistance = splitByDistance(coords, distances, vehiclePosition.shapeDistTraveled);
  if (byDistance) return byDistance;

  const byProjection = splitByProjection(coords, vehiclePosition.coordinates);
  return byProjection || { past: EMPTY_LINE, future: line(coords) };
}
