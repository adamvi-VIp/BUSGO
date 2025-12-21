// --- Filter Geometry Test (Smoothing + Deduplication Logic) ---

// Mock helper functions
function deg2rad(deg) { return deg * (Math.PI / 180); }
function getDistanceFromLatLonInKm(lat1, lon1, lat2, lon2) {
    var R = 6371;
    var dLat = deg2rad(lat2 - lat1);
    var dLon = deg2rad(lon2 - lon1);
    var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

// Re-implementing filterGeometry for the test script (Updated with Smoothing)
function localFilterGeometry(geometry, stops) {
    if (!geometry || !stops || stops.length === 0) return geometry;
    const segments = geometry.type === 'LineString' ? [geometry.coordinates] : geometry.coordinates;
    const stopMatchingThresholdKm = 0.25;
    const connectivityThresholdKm = 0.3;
    const tightConnectionThresholdKm = 0.02;

    const stopSegments = stops.map(stop => {
        const matches = [];
        let minDist = Infinity;
        let bestIdx = -1;
        segments.forEach((line, idx) => {
            let localMin = Infinity;
            line.forEach(p => {
                const d = getDistanceFromLatLonInKm(stop.lat, stop.lon, p[1], p[0]);
                if (d < localMin) localMin = d;
            });
            if (localMin < stopMatchingThresholdKm) matches.push({ idx, dist: localMin });
            if (localMin < minDist) { minDist = localMin; bestIdx = idx; }
        });

        const tightMatches = matches.filter(m => m.dist < 0.05);
        if (tightMatches.length > 0) return tightMatches.map(m => m.idx);

        if (matches.length === 0 && bestIdx !== -1) matches.push({ idx: bestIdx, dist: minDist });
        return matches.map(m => m.idx);
    });

    const adj = Array.from({ length: segments.length }, () => []);
    for (let i = 0; i < segments.length; i++) {
        for (let j = i + 1; j < segments.length; j++) {
            const segA = segments[i], segB = segments[j];
            const endA = [segA[0], segA[segA.length - 1]], endB = [segB[0], segB[segB.length - 1]];
            let minGap = Infinity;
            endA.forEach(pA => endB.forEach(pB => {
                const d = getDistanceFromLatLonInKm(pA[1], pA[0], pB[1], pB[0]);
                if (d < minGap) minGap = d;
            }));
            if (minGap > tightConnectionThresholdKm) {
                endA.forEach(pA => segB.forEach(pB => {
                    const d = getDistanceFromLatLonInKm(pA[1], pA[0], pB[1], pB[0]);
                    if (d < minGap) minGap = d;
                }));
                endB.forEach(pB => segA.forEach(pA => {
                    const d = getDistanceFromLatLonInKm(pB[1], pB[0], pA[1], pA[0]);
                    if (d < minGap) minGap = d;
                }));
            }
            if (minGap < connectivityThresholdKm) {
                const weight = minGap < tightConnectionThresholdKm ? 1 : Math.ceil(minGap * 500);
                adj[i].push({ to: j, weight });
                adj[j].push({ to: i, weight });
            }
        }
    }

    const keepIndices = new Set();
    const orderedSegments = [];

    for (let i = 0; i < stopSegments.length - 1; i++) {
        const starts = stopSegments[i], ends = stopSegments[i + 1];
        if (starts.length === 0 || ends.length === 0) continue;
        const queue = starts.map(s => ({ node: s, weight: 0, path: [s] }));
        const visited = new Map();
        starts.forEach(s => visited.set(s, 0));
        let bestPath = null, minWeightFound = Infinity;
        while (queue.length > 0) {
            queue.sort((a, b) => a.weight - b.weight);
            const { node, weight, path } = queue.shift();
            if (weight > minWeightFound) continue;
            if (ends.includes(node)) {
                if (weight < minWeightFound) { minWeightFound = weight; bestPath = path; }
                continue;
            }
            if (path.length > 100) continue;
            for (const edge of adj[node]) {
                const newWeight = weight + edge.weight;
                if (!visited.has(edge.to) || visited.get(edge.to) > newWeight) {
                    visited.set(edge.to, newWeight);
                    queue.push({ node: edge.to, weight: newWeight, path: [...path, edge.to] });
                }
            }
        }
        if (bestPath) {
            bestPath.forEach(idx => keepIndices.add(idx));
            if (i === 0) {
                orderedSegments.push(...bestPath);
            } else {
                const last = orderedSegments[orderedSegments.length - 1];
                const startIdx = bestPath[0] === last ? 1 : 0;
                orderedSegments.push(...bestPath.slice(startIdx));
            }
        } else {
            // Fallback
            const stopA = stops[i];
            const stopB = stops[i + 1];
            const centerLat = (stopA.lat + stopB.lat) / 2;
            const centerLon = (stopA.lon + stopB.lon) / 2;
            const distBetweenStops = getDistanceFromLatLonInKm(stopA.lat, stopA.lon, stopB.lat, stopB.lon);
            const radius = distBetweenStops / 2 + 0.5; // 500m buffer

            segments.forEach((line, idx) => {
                const isNear = line.some(p => getDistanceFromLatLonInKm(centerLat, centerLon, p[1], p[0]) < radius);
                if (isNear) {
                    keepIndices.add(idx);
                    if (!orderedSegments.includes(idx)) orderedSegments.push(idx);
                }
            });
        }
    }

    if (stopSegments.length > 0) {
        stopSegments[0].forEach(idx => {
            keepIndices.add(idx);
            if (!orderedSegments.includes(idx)) orderedSegments.unshift(idx);
        });
        stopSegments[stopSegments.length - 1].forEach(idx => {
            keepIndices.add(idx);
            if (!orderedSegments.includes(idx)) orderedSegments.push(idx);
        });
    }

    if (keepIndices.size === 0) return geometry;

    // SMOOTHING Check
    try {
        if (orderedSegments.length > 0) {
            const mergedCoords = [];
            const distEx = (p1, p2) => getDistanceFromLatLonInKm(p1[1], p1[0], p2[1], p2[0]);
            let seg0 = segments[orderedSegments[0]];

            if (orderedSegments.length > 1) {
                const nextSeg = segments[orderedSegments[1]];
                const dStartToNext = distEx(seg0[0], nextSeg[0]) + distEx(seg0[0], nextSeg[nextSeg.length - 1]);
                const dEndToNext = distEx(seg0[seg0.length - 1], nextSeg[0]) + distEx(seg0[seg0.length - 1], nextSeg[nextSeg.length - 1]);
                if (dStartToNext < dEndToNext) seg0 = [...seg0].reverse();
            } else if (stops && stops.length > 0) {
                const dStart = distEx(stops[0], seg0[0]), dEnd = distEx(stops[0], seg0[seg0.length - 1]);
                if (dEnd < dStart) seg0 = [...seg0].reverse();
            }
            mergedCoords.push(...seg0);

            for (let k = 1; k < orderedSegments.length; k++) {
                const nextSegRaw = segments[orderedSegments[k]];
                const lastPoint = mergedCoords[mergedCoords.length - 1];
                const dStart = distEx(lastPoint, nextSegRaw[0]);
                const dEnd = distEx(lastPoint, nextSegRaw[nextSegRaw.length - 1]);
                if (dStart < dEnd) {
                    const toAdd = dStart < 0.005 ? nextSegRaw.slice(1) : nextSegRaw;
                    mergedCoords.push(...toAdd);
                } else {
                    const reversed = [...nextSegRaw].reverse();
                    const toAdd = dEnd < 0.005 ? reversed.slice(1) : reversed;
                    mergedCoords.push(...toAdd);
                }
            }

            const smooth = (coords) => {
                if (coords.length < 3) return coords;
                const newCoords = [coords[0]];
                for (let i = 0; i < coords.length - 1; i++) {
                    const p0 = coords[i], p1 = coords[i + 1];
                    const Q = [0.75 * p0[0] + 0.25 * p1[0], 0.75 * p0[1] + 0.25 * p1[1]];
                    const R = [0.25 * p0[0] + 0.75 * p1[0], 0.25 * p0[1] + 0.75 * p1[1]];
                    newCoords.push(Q, R);
                }
                newCoords.push(coords[coords.length - 1]);
                return newCoords;
            };

            let smoothed = smooth(mergedCoords);
            smoothed = smooth(smoothed);
            return { type: 'LineString', coordinates: smoothed };
        }
    } catch (e) {
        console.error('Smoothing error:', e);
    }
    return { type: 'MultiLineString', coordinates: segments.filter((_, idx) => keepIndices.has(idx)) };
}

// TURN VS JUMP TEST CASE
const turnSegments = [
    [[14.42, 50.080], [14.425, 50.080]], // 0
    [[14.425, 50.080], [14.425, 50.085]], // 1
    [[14.425, 50.085], [14.430, 50.085]], // 2
    [[14.430, 50.085], [14.430, 50.080]], // 3
    [[14.421, 50.081], [14.429, 50.081]], // 4 (Shortcut)
];
const turnStops = [{ lat: 50.080, lon: 14.420 }, { lat: 50.080, lon: 14.430 }];

console.log('--- Running Dijkstra + Smoothing Test ---');
const result = localFilterGeometry({ type: 'MultiLineString', coordinates: turnSegments }, turnStops);

if (result.type === 'LineString') {
    console.log('SUCCESS: Output is a smoothed LineString.');
    // Check point count (should be > sum of points in segments due to smoothing)
    // 4 segments * 2 points = 8 points. 
    // Merged: ~6-8 points.
    // Smoothed (2 iters): 8 -> ~16 -> ~32 approx. 
    // Actually Chaikin roughly doubles points per iteration minus edge effects.
    console.log('Original Points:', 8, 'Smoothed Points:', result.coordinates.length);
    if (result.coordinates.length > 10) {
        console.log('SUCCESS: Chaikin smoothing increased point count.');
    } else {
        console.log('WARNING: Point count did not increase significantly?');
    }
} else {
    console.log('FAILURE: Output is NOT a LineString (Smoothing failed?). Type:', result.type);
}
