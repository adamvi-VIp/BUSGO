function asString(value) {
  return value === null || value === undefined ? null : String(value);
}

export function stopMatchesId(stop, id) {
  const target = asString(id);
  if (!stop || !target) return false;

  if (asString(stop.gtfsId) === target) return true;
  if (asString(stop.uniqueStopPointId) === target) return true;

  return Array.isArray(stop.gtfsIds) && stop.gtfsIds.some(gtfsId => asString(gtfsId) === target);
}

export function getStopPrimaryId(stop) {
  if (!stop) return null;
  return asString(stop.gtfsId) ||
    asString(stop.uniqueStopPointId) ||
    (Array.isArray(stop.gtfsIds) ? asString(stop.gtfsIds[0]) : null);
}

export function stopHasLines(stop) {
  return Array.isArray(stop?.lines) && stop.lines.length > 0;
}
