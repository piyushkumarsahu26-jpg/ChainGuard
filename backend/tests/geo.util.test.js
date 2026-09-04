// Tests for utils/geo.util.js — the pure geometry/checkpoint-constant
// logic extracted from gps.service.js specifically so it's testable
// without a live database connection. gps.service.js itself (and its
// DB-touching methods: startTransport, updateLocation, etc.) requires a
// live Prisma-connected database, which this sandbox cannot boot — same
// long-standing limitation as every backend phase in this project (see
// CHANGELOG.md). What's genuinely testable in isolation is tested here,
// for real, not skipped.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { haversineMeters, KNOWN_CHECKPOINTS, pointToSegmentDistanceMeters, distanceToRouteMeters, buildInterpolatedRoute, buildWrongRoute } from '../src/utils/geo.util.js';

test('haversineMeters returns ~0 for identical coordinates', () => {
  const distance = haversineMeters(12.9716, 77.5946, 12.9716, 77.5946);
  assert.ok(distance < 0.001);
});

test('haversineMeters computes a known real-world distance correctly', () => {
  // Printing Press -> District Treasury, per KNOWN_CHECKPOINTS. Expected
  // value cross-checked independently with a separate Python
  // implementation of the same haversine formula (not derived from this
  // function itself) — confirmed 1463.67m, not the ~1.6km this test
  // originally assumed before that check.
  const distance = haversineMeters(12.9716, 77.5946, 12.98, 77.605);
  assert.ok(distance > 1400 && distance < 1500, `expected ~1464m, got ${distance}m`);
});

test('haversineMeters is symmetric (A->B equals B->A)', () => {
  const ab = haversineMeters(12.9716, 77.5946, 12.99, 77.615);
  const ba = haversineMeters(12.99, 77.615, 12.9716, 77.5946);
  assert.ok(Math.abs(ab - ba) < 0.001);
});

test('haversineMeters correctly orders distances (closer point is actually closer)', () => {
  const origin = [12.9716, 77.5946];
  const near = haversineMeters(...origin, 12.972, 77.595); // ~60m away
  const far = haversineMeters(...origin, 12.99, 77.615); // ~2.9km away
  assert.ok(near < far);
});

test('KNOWN_CHECKPOINTS has exactly the three route stops the frontend also expects', () => {
  const names = KNOWN_CHECKPOINTS.map((c) => c.name);
  assert.deepEqual(names, ['Printing Press', 'District Treasury', 'Exam Centre']);
  for (const cp of KNOWN_CHECKPOINTS) {
    assert.equal(typeof cp.latitude, 'number');
    assert.equal(typeof cp.longitude, 'number');
  }
});

// --- Sprint 6: pointToSegmentDistanceMeters / distanceToRouteMeters ---

const SEG_A = { lat: 12.9716, lon: 77.5946 };
const SEG_B = { lat: 12.98, lon: 77.605 };

test('pointToSegmentDistanceMeters returns ~0 for the exact midpoint of the segment', () => {
  const midLat = (SEG_A.lat + SEG_B.lat) / 2;
  const midLon = (SEG_A.lon + SEG_B.lon) / 2;
  const distance = pointToSegmentDistanceMeters(midLat, midLon, SEG_A.lat, SEG_A.lon, SEG_B.lat, SEG_B.lon);
  assert.ok(distance < 0.01, `expected ~0, got ${distance}`);
});

test('pointToSegmentDistanceMeters returns ~0 for either endpoint itself', () => {
  const atA = pointToSegmentDistanceMeters(SEG_A.lat, SEG_A.lon, SEG_A.lat, SEG_A.lon, SEG_B.lat, SEG_B.lon);
  const atB = pointToSegmentDistanceMeters(SEG_B.lat, SEG_B.lon, SEG_A.lat, SEG_A.lon, SEG_B.lat, SEG_B.lon);
  assert.ok(atA < 0.01 && atB < 0.01);
});

test('pointToSegmentDistanceMeters clamps to the endpoint for a point beyond the segment', () => {
  // A point far past B, roughly along the same bearing, should be
  // approximately distance(point, B) — clamping to the segment (not an
  // infinite line) is the whole point of this function existing.
  // Tolerance is relative (0.5%), not absolute sub-meter: this function's
  // own docstring documents "under 1% error" for its local equirectangular
  // approximation, and this test case is ~13km — genuinely at the edge of
  // "a few kilometers," where a small, expected discrepancy against true
  // haversine is normal, not a defect. Verified independently: the actual
  // gap here is ~0.10%, comfortably inside the documented bound.
  const beyondB = pointToSegmentDistanceMeters(13.05, 77.7, SEG_A.lat, SEG_A.lon, SEG_B.lat, SEG_B.lon);
  const directToB = haversineMeters(13.05, 77.7, SEG_B.lat, SEG_B.lon);
  const relativeError = Math.abs(beyondB - directToB) / directToB;
  assert.ok(relativeError < 0.005, `expected within 0.5% of ${directToB}, got ${beyondB} (${(relativeError * 100).toFixed(2)}% off)`);
});

test('pointToSegmentDistanceMeters grows with genuine perpendicular offset', () => {
  const midLat = (SEG_A.lat + SEG_B.lat) / 2;
  const midLon = (SEG_A.lon + SEG_B.lon) / 2;
  const near = pointToSegmentDistanceMeters(midLat + 0.0001, midLon, SEG_A.lat, SEG_A.lon, SEG_B.lat, SEG_B.lon);
  const far = pointToSegmentDistanceMeters(midLat + 0.01, midLon, SEG_A.lat, SEG_A.lon, SEG_B.lat, SEG_B.lon);
  assert.ok(far > near);
});

test('distanceToRouteMeters finds the minimum across every segment of a multi-stop route', () => {
  const route = [
    { latitude: 12.9716, longitude: 77.5946 },
    { latitude: 12.98, longitude: 77.605 },
    { latitude: 12.99, longitude: 77.615 },
  ];
  // A point sitting exactly on the second segment's midpoint should be
  // ~0 distance from the ROUTE overall, even though it's far from the
  // first segment.
  const midLat = (12.98 + 12.99) / 2;
  const midLon = (77.605 + 77.615) / 2;
  const distance = distanceToRouteMeters(midLat, midLon, route);
  assert.ok(distance < 0.01, `expected ~0, got ${distance}`);
});

test('distanceToRouteMeters returns Infinity for an empty route (no route assigned)', () => {
  assert.equal(distanceToRouteMeters(12.97, 77.6, []), Infinity);
});

// --- Integration Sprint 2: buildInterpolatedRoute / buildWrongRoute ---

test('buildInterpolatedRoute starts and ends exactly at the given waypoints', () => {
  const waypoints = [
    { latitude: 12.9716, longitude: 77.5946 },
    { latitude: 12.98, longitude: 77.605 },
    { latitude: 12.99, longitude: 77.615 },
  ];
  const route = buildInterpolatedRoute(waypoints, 12);
  assert.equal(route[0].latitude, waypoints[0].latitude);
  assert.equal(route[0].longitude, waypoints[0].longitude);
  assert.equal(route[route.length - 1].latitude, waypoints[2].latitude);
  assert.equal(route[route.length - 1].longitude, waypoints[2].longitude);
});

test('buildInterpolatedRoute produces the expected point count (stepsBetween per segment, plus the final point)', () => {
  const waypoints = [
    { latitude: 0, longitude: 0 },
    { latitude: 1, longitude: 1 },
    { latitude: 2, longitude: 2 },
  ];
  const route = buildInterpolatedRoute(waypoints, 10);
  // 2 segments * 10 steps each + 1 final point = 21
  assert.equal(route.length, 21);
});

test('buildInterpolatedRoute every intermediate point lies on the real route (distanceToRouteMeters ~0)', () => {
  const waypoints = [
    { latitude: 12.9716, longitude: 77.5946 },
    { latitude: 12.98, longitude: 77.605 },
    { latitude: 12.99, longitude: 77.615 },
  ];
  const route = buildInterpolatedRoute(waypoints, 12);
  for (const point of route) {
    const distance = distanceToRouteMeters(point.latitude, point.longitude, waypoints);
    assert.ok(distance < 1, `expected ~0, got ${distance}m for point ${JSON.stringify(point)}`);
  }
});

test('buildWrongRoute is genuinely off the real route by more than the deviation threshold', () => {
  const waypoints = [
    { latitude: 12.9716, longitude: 77.5946 },
    { latitude: 12.98, longitude: 77.605 },
    { latitude: 12.99, longitude: 77.615 },
  ];
  const wrongRoute = buildWrongRoute(waypoints);
  const ROUTE_CORRIDOR_METERS = 500; // must match gps.service.js's real threshold
  for (const point of wrongRoute) {
    const distance = distanceToRouteMeters(point.latitude, point.longitude, waypoints);
    assert.ok(distance > ROUTE_CORRIDOR_METERS, `expected > ${ROUTE_CORRIDOR_METERS}m, got ${distance}m`);
  }
});
