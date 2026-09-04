// Pure geometry helpers for Sprint 5 (Live GPS Tracking). Deliberately
// zero dependencies (no Prisma, no config) — kept separate from
// gps.service.js so this logic is testable in isolation without needing
// a live database connection, and so it's clear at a glance that nothing
// here has a side effect.

export function haversineMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Sprint 6 (Route Deviation Detection): shortest distance from a point to
// a line SEGMENT (not an infinite line) between two other points, in
// meters. Uses an equirectangular approximation — treats the small
// lat/lng span of one route segment as locally flat/Cartesian, which is
// standard practice and accurate to well under 1% error at this scale
// (a few kilometers at most, per this project's own route lengths) —
// full spherical segment projection would be meaningfully more complex
// for no practical benefit here.
export function pointToSegmentDistanceMeters(lat, lon, segStartLat, segStartLon, segEndLat, segEndLon) {
  const metersPerDegLat = 111320;
  const metersPerDegLon = 111320 * Math.cos((lat * Math.PI) / 180);

  const toXY = (la, lo) => [(lo - segStartLon) * metersPerDegLon, (la - segStartLat) * metersPerDegLat];
  const [px, py] = toXY(lat, lon);
  const [ex, ey] = toXY(segEndLat, segEndLon); // segment start is the local origin by construction

  const segLenSq = ex * ex + ey * ey;
  if (segLenSq === 0) return haversineMeters(lat, lon, segStartLat, segStartLon);

  // Project point onto the segment, clamped to [0, 1] so the closest
  // point considered is never beyond either endpoint.
  let t = (px * ex + py * ey) / segLenSq;
  t = Math.max(0, Math.min(1, t));

  const closestX = t * ex;
  const closestY = t * ey;
  return Math.sqrt((px - closestX) ** 2 + (py - closestY) ** 2);
}

// Shortest distance from a point to the whole route (the minimum across
// every consecutive checkpoint-to-checkpoint segment) — what "off the
// allowed corridor" actually means for a multi-stop route, not just
// distance to the nearest single checkpoint.
export function distanceToRouteMeters(lat, lon, orderedCheckpoints) {
  if (!orderedCheckpoints || orderedCheckpoints.length === 0) return Infinity;
  if (orderedCheckpoints.length === 1) {
    return haversineMeters(lat, lon, orderedCheckpoints[0].latitude, orderedCheckpoints[0].longitude);
  }
  let min = Infinity;
  for (let i = 0; i < orderedCheckpoints.length - 1; i++) {
    const a = orderedCheckpoints[i];
    const b = orderedCheckpoints[i + 1];
    const d = pointToSegmentDistanceMeters(lat, lon, a.latitude, a.longitude, b.latitude, b.longitude);
    if (d < min) min = d;
  }
  return min;
}

// Integration Sprint 2: dense interpolated waypoints between a route's
// checkpoints, so a server-driven simulation animates smoothly rather
// than jumping between just a few points. Ported from
// TransportMonitoring.jsx's identical buildRoute() — the frontend no
// longer runs its own simulation loop (see gps.service.js's
// startAutoSimulation), so this is the one real implementation now, not
// a duplicate of a frontend copy.
export function buildInterpolatedRoute(waypoints, stepsBetween = 12) {
  const points = [];
  for (let i = 0; i < waypoints.length - 1; i++) {
    const a = waypoints[i];
    const b = waypoints[i + 1];
    for (let s = 0; s < stepsBetween; s++) {
      const t = s / stepsBetween;
      points.push({
        latitude: a.latitude + (b.latitude - a.latitude) * t,
        longitude: a.longitude + (b.longitude - a.longitude) * t,
      });
    }
  }
  points.push(waypoints[waypoints.length - 1]);
  return points;
}

// The "Wrong Route" scenario (Sprint 6): the same interpolation, but
// every waypoint shifted well past the deviation-corridor threshold
// first, so it reliably crosses it rather than depending on jitter.
export function buildWrongRoute(waypoints, offsetDegLat = 0.011, stepsBetween = 12) {
  const shifted = waypoints.map((wp) => ({ ...wp, latitude: wp.latitude + offsetDegLat }));
  return buildInterpolatedRoute(shifted, stepsBetween);
}

// Known checkpoint locations for the printing-press -> treasury -> exam
// centre route. Not a database table (the spec's TransportCheckpoint only
// persists per-session *reached* records, not checkpoint *definitions*) —
// reference/config data, same category as the AI side's
// datasets/config.py ALL_CLASSES. The frontend (TransportMonitoring.jsx)
// necessarily duplicates this same list — there's no endpoint that serves
// "checkpoint definitions" for it to fetch instead, a deliberate choice
// documented in that file too.
export const KNOWN_CHECKPOINTS = [
  { name: 'Printing Press', latitude: 12.9716, longitude: 77.5946 },
  { name: 'District Treasury', latitude: 12.98, longitude: 77.605 },
  { name: 'Exam Centre', latitude: 12.99, longitude: 77.615 },
];
