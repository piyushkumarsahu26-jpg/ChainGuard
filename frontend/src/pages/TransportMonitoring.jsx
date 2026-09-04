import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, Circle } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  Truck, Play, Pause, Square, Battery, Gauge, Clock, MapPin, User as UserIcon,
  FileText, CheckCircle2, Radio, AlertTriangle, Navigation, RefreshCw,
} from 'lucide-react';
import Card from '../components/ui/Card';
import Badge from '../components/ui/Badge';
import Skeleton from '../components/ui/Skeleton';
import EmptyState from '../components/ui/EmptyState';
import { useApp } from '../context/AppContext';
import gpsService from '../services/gpsService';
import envelopeService from '../services/envelopeService';
import examinationService from '../services/examinationService';
import envelopeBatchService from '../services/envelopeBatchService';
import { getSocket } from '../services/socket';

// Must match backend/src/services/gps.service.js's KNOWN_CHECKPOINTS
// exactly (same names, same coordinates). Kept as a separate frontend
// constant rather than fetched from an endpoint since there isn't one for
// "checkpoint definitions" (only per-session *reached* checkpoints are
// persisted) — this is reference/display data, the same category as
// every other small named constant already in this codebase (e.g.
// EnvelopeScanner.jsx's damageVariant).
const CHECKPOINTS = [
  { name: 'Printing Press', latitude: 12.9716, longitude: 77.5946 },
  { name: 'District Treasury', latitude: 12.98, longitude: 77.605 },
  { name: 'Exam Centre', latitude: 12.99, longitude: 77.615 },
];

// Sprint 6 (Route Planning): routes now come from the real
// GET /api/v1/routes endpoint — see the `routes` state in the component
// below — not a hardcoded constant. The same three routes (Direct / Via
// Ring Road / Express) that Sprint 5 hardcoded here are seeded in the
// database instead (backend/prisma/migrations/
// 20260803090000_geofencing_route_deviation's accompanying seed data),
// so the UI offers the identical choices as before — this is a
// data-source change, not a UI redesign. CHECKPOINTS above stays as the
// fallback fixed map pins (Printing Press/Treasury/Exam Centre are always
// shown regardless of which route is assigned, per the MAP requirement).

// Integration Sprint 2: this page no longer builds its own interpolated
// route (buildRoute/buildWrongRoute used to live here) -- that logic now
// lives once, on the backend (utils/geo.util.js's buildInterpolatedRoute/
// buildWrongRoute), since the backend is what actually drives the
// simulation now. This page only ever needs the *real* checkpoints
// (assignedRouteCheckpoints, below) to draw the expected-route line.

// Sprint 6 (Simulation): "Add controls: Normal Route, Wrong Route,
// Vehicle Stop, Battery Low, Lost GPS. Each simulation should generate
// corresponding alerts automatically." Each scenario's `describe` is
// shown in the UI so the officer running a demo knows what to expect and
// roughly how long it takes — VEHICLE_STOP genuinely takes the real
// 5-minute STOPPED_ALERT_MINUTES threshold to fire (not artificially
// shortened — that would misrepresent the system's actual behavior).
const SCENARIOS = {
  NORMAL: { label: 'Normal Route', description: 'Follows the selected route normally.' },
  WRONG_ROUTE: { label: 'Wrong Route', description: 'Deliberately drifts off the assigned corridor to trigger a Route Deviation alert (~15-45s in).' },
  VEHICLE_STOP: { label: 'Vehicle Stop', description: 'Stops moving partway through. Triggers "Vehicle Stopped" after the real 5-minute threshold — this scenario runs long by design.' },
  BATTERY_LOW: { label: 'Battery Low', description: 'Starts at 15% battery — triggers the low-battery alert on the very first update.' },
  LOST_GPS: { label: 'Lost GPS', description: 'Silently stops sending updates (unlike Pause, which is a deliberate, tracked state) — triggers "GPS Signal Lost" after 45s.' },
};

const MAP_CENTER = [12.9808, 77.6048];
// Mirrors backend/src/services/gps.service.js's ROUTE_CORRIDOR_METERS —
// display-only (the backend is the actual source of truth for what
// counts as a deviation); kept in sync manually since there's no
// endpoint that exposes backend alert-threshold constants.
const ROUTE_CORRIDOR_METERS_DISPLAY = 500;

const vehicleIcon = L.divIcon({
  className: '',
  html: `<div style="background:#38BDF8;border:2px solid #0B1220;border-radius:9999px;width:18px;height:18px;box-shadow:0 0 0 4px rgba(56,189,248,0.25);"></div>`,
  iconSize: [18, 18],
  iconAnchor: [9, 9],
});
const checkpointIcon = L.divIcon({
  className: '',
  html: `<div style="background:#1E293B;border:2px solid #64748B;border-radius:9999px;width:14px;height:14px;"></div>`,
  iconSize: [14, 14],
  iconAnchor: [7, 7],
});

// Sprint 5 extension — richer 9-step timeline connecting the AI Scanner
// (Sprint AI-4B) to transport. "Envelope Printed"/"AI Scan"/"Officer
// Accepted" have no dedicated backend state of their own (this project's
// data model doesn't track a separate printing or hand-off event) — they
// are treated as satisfied together, the moment a transport session
// exists, since a session can only be started for an envelope that's
// already been printed and handed to an officer. "Checkpoint 1"/"2" are
// ordinal (the 1st/2nd distinct checkpoint reached this session, whichever
// they are) — Treasury/Exam Centre are the two the spec also names
// individually, so reaching either of those necessarily satisfies the
// ordinal steps before it too (handled by returning the *latest*
// satisfied index, checked most-advanced-first below).
const TIMELINE_STEPS = [
  'Envelope Printed', 'AI Scan', 'Officer Accepted', 'Transport Started',
  'Checkpoint 1', 'Checkpoint 2', 'Treasury', 'Exam Centre', 'Delivered',
];

function deriveTimelineIndex(session, checkpointNames) {
  if (!session) return -1;
  if (session.status === 'COMPLETED') return 8; // Delivered
  if (checkpointNames.has('Exam Centre')) return 7;
  if (checkpointNames.has('District Treasury')) return 6;
  if (checkpointNames.size >= 2) return 5; // Checkpoint 2
  if (checkpointNames.size >= 1) return 4; // Checkpoint 1
  return 3; // Transport Started (also implies Officer Accepted/AI Scan/Printed)
}

function timeAgo(isoString) {
  if (!isoString) return '—';
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(isoString).getTime()) / 1000));
  if (seconds < 5) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  return `${Math.floor(seconds / 60)}m ago`;
}

// Display-only distance helper for "Travelled Distance". Deliberately not
// imported from the backend's utils/geo.util.js (a Node module, not
// reachable from the browser) and deliberately not a new backend
// endpoint either (this fix is frontend-only, per "existing backend
// architecture must remain unchanged") — a small, low-stakes duplication
// of the same haversine formula, fine for a UI display figure, unlike the
// backend's own copy which real detection/alerting logic depends on.
function haversineMetersDisplay(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export default function TransportMonitoring() {
  const { user, pushToast } = useApp();

  const [envelopes, setEnvelopes] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  // Critical bug fix: tracks which vehicles have a *real* ACTIVE/PAUSED
  // TransportSession, derived from GET /gps/live (the same source of
  // truth the backend itself now checks -- see gps.service.js's
  // startTransport()) and kept fresh via the transport:start/end socket
  // events below. Replaces trusting the selected vehicle's own `status`
  // field, which is only ever a derived, separately-written value that
  // can desync from what's actually true in the TransportSession table.
  const [activeVehicleIds, setActiveVehicleIds] = useState(new Set());
  const [routes, setRoutes] = useState([]); // Sprint 6: real routes from GET /api/v1/routes
  const [selectedEnvelopeId, setSelectedEnvelopeId] = useState('');
  const [selectedVehicleId, setSelectedVehicleId] = useState('');
  const [selectedRouteId, setSelectedRouteId] = useState('');
  const [scenario, setScenario] = useState('NORMAL');
  const [loading, setLoading] = useState(true);

  const [session, setSession] = useState(null); // the active TransportSession, once started
  const [locations, setLocations] = useState([]); // full route history for the polyline
  const [checkpointNames, setCheckpointNames] = useState(new Set());
  const [latest, setLatest] = useState(null); // most recent GPSLocation
  const [vehicleOnline, setVehicleOnline] = useState(true);
  const [deviating, setDeviating] = useState(false);
  const [deviationInfo, setDeviationInfo] = useState(null); // { distanceOffRouteMeters, timeOffRouteSeconds } — from the route:deviation payload, not recomputed client-side (avoids duplicating gps.service.js's geometry logic)
  const [eventLog, setEventLog] = useState([]); // Sprint 6 TIMELINE — live event feed

  const [simulating, setSimulating] = useState(false);
  const [paused, setPaused] = useState(false);
  // Integration Sprint 2: no simIndexRef/simTimerRef anymore -- there is
  // no local interval to track. sessionRef remains, since socket
  // listeners registered once (empty dependency array, below) still need
  // a stable way to read the *current* session without stale closures.
  const sessionRef = useRef(null);

  const pushEvent = useCallback((label, detail) => {
    setEventLog((prev) => [{ id: `${Date.now()}-${Math.random()}`, label, detail, at: new Date().toISOString() }, ...prev].slice(0, 30));
  }, []);

  // --- Critical bug fix: reconnect to an already-ACTIVE/PAUSED backend
  // session instead of ever trying to start a new one. ---
  // Root cause of the reported bug: the backend simulation (Integration
  // Sprint 2) already survives this page unmounting -- that part was
  // already correct. What was missing is that on remount, this page had
  // no way to know a session was still running, so its own mount effect
  // (below) auto-selected whatever vehicle happened to be first in the
  // list -- which, after a completed round trip away and back, is very
  // often the exact vehicle the still-running backend simulation has
  // marked IN_TRANSIT. Clicking "Start Simulation" then hit the
  // pre-existing, correct backend guard in gps.service.js's
  // startTransport() ("Vehicle is already on an active transport
  // session") -- a real safeguard doing its job, just with nothing on
  // the frontend checking first.
  //
  // Reuses two endpoints that already existed before this fix: GET
  // /gps/live (already used by Live Monitoring and Security Command
  // Center to answer "is anything active right now") to discover a
  // session on mount, and GET /gps/history/:sessionId (already existed
  // since Sprint 5/6) to pull everything needed to restore this page's
  // full view of it -- no new backend endpoint, no new business logic.
  const reconnectToSession = useCallback(async (sessionSummary) => {
    const { session: fullSession, locations: history, checkpoints } = await gpsService.getHistory(sessionSummary.id);
    sessionRef.current = fullSession;
    setSession(fullSession);
    setSelectedEnvelopeId(fullSession.envelopeId);
    setSelectedVehicleId(fullSession.vehicleId);
    if (fullSession.routeId) setSelectedRouteId(fullSession.routeId);

    setLocations(history);
    setLatest(history.length > 0 ? history[history.length - 1] : null);
    setCheckpointNames(new Set((checkpoints || []).map((c) => c.checkpointName)));

    // Simulation state restored from the session's own real status, not
    // guessed -- ACTIVE/PAUSED both mean "still running" for this page's
    // purposes (the live view + Pause/Stop controls), matching how
    // startSimulation()'s own success path already sets these.
    setSimulating(fullSession.status === 'ACTIVE' || fullSession.status === 'PAUSED');
    setPaused(fullSession.status === 'PAUSED');

    // vehicleOnline/deviating/deviationInfo have no persisted "current
    // state" to query (they're real-time alert conditions, not fields on
    // the session) -- default to the common case and let the very next
    // real gps:update/route:deviation event (the socket listeners below,
    // unchanged) self-correct within seconds if actually wrong. Safer
    // and more honest than fabricating a guess for something this page
    // genuinely cannot know until a fresh event arrives.
    setVehicleOnline(true);
    setDeviating(false);
    setDeviationInfo(null);

    setEventLog([]);
    pushEvent('Reconnected to active session', `${fullSession.envelope?.envelopeCode || ''} — session was already running`);
    for (const cp of checkpoints || []) {
      pushEvent(`Checkpoint reached: ${cp.checkpointName}`, new Date(cp.reachedAt).toLocaleTimeString());
    }
  }, [pushEvent]);

  // --- Initial data: envelopes + vehicles + routes (reuses existing services) ---
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [envRes, vehRes, routeRes, liveRes] = await Promise.all([
          // Architectural Integration sprint (Phase 5): only
          // READY_FOR_DISPATCH envelopes can actually be dispatched
          // (gps.service.js's startTransport() gate) -- filtering here
          // means the dropdown only ever shows envelopes that will
          // actually succeed, instead of letting an operator pick one
          // still mid-preparation and hit a rejection.
          envelopeService.getAll({ limit: 100, prepStatus: 'READY_FOR_DISPATCH' }),
          gpsService.getVehicles({ limit: 100 }),
          gpsService.listRoutes(),
          gpsService.getLive(),
        ]);
        if (cancelled) return;
        const envItems = envRes.items || [];
        const vehItems = vehRes.items || [];
        const routeItems = routeRes || [];
        setEnvelopes(envItems);
        setVehicles(vehItems);
        setRoutes(routeItems);

        // The actual fix: check for an already-active session *before*
        // falling back to auto-selecting fresh defaults. liveRes is the
        // same { session, latestLocation }[] shape Live Monitoring and
        // Security Command Center already consume.
        setActiveVehicleIds(new Set((liveRes || []).map((entry) => entry.session.vehicleId)));
        const existing = (liveRes || []).find((entry) => entry.session.status === 'ACTIVE' || entry.session.status === 'PAUSED');
        if (existing) {
          await reconnectToSession(existing.session);
        } else {
          if (envItems.length > 0) setSelectedEnvelopeId(envItems[0].id);
          if (vehItems.length > 0) setSelectedVehicleId(vehItems[0].id);
          if (routeItems.length > 0) setSelectedRouteId(routeItems[0].id);
        }
      } catch (err) {
        console.error('TransportMonitoring load error:', err);
        pushToast({ type: 'error', title: 'Could not load transport data', message: 'Refresh the page to try again.' });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [pushToast, reconnectToSession]);

  // --- Socket.IO: the map/status card is driven by these events, not by
  // the simulator's own HTTP responses — per the Sprint 5 objective
  // ("vehicle marker should move when new socket event arrives"), and so
  // any other connected user watching this page sees the same live
  // movement, not just the browser running the simulation. ---
  useEffect(() => {
    const socket = getSocket();

    const onGpsUpdate = (payload) => {
      if (!sessionRef.current || payload.sessionId !== sessionRef.current.id) return;
      setLatest(payload.location);
      setLocations((prev) => [...prev, payload.location]);
      setPaused(false); // a real update arriving is, by definition, not paused (mirrors the backend's auto-resume-on-update logic)
      if (payload.checkpointReached) {
        setCheckpointNames((prev) => new Set(prev).add(payload.checkpointReached.checkpointName));
        pushToast({ type: 'info', title: 'Checkpoint reached', message: payload.checkpointReached.checkpointName });
      }
    };
    const onTransportStart = (payload) => {
      // Not gated to sessionRef.current -- this specifically needs to
      // catch sessions started *elsewhere* (another tab, another
      // operator) so this page's own "already active" awareness stays
      // correct without requiring a reload.
      setActiveVehicleIds((prev) => new Set(prev).add(payload.session.vehicleId));
    };
    const onTransportPause = (payload) => {
      if (!sessionRef.current || payload.session.id !== sessionRef.current.id) return;
      setSession(payload.session);
      setPaused(true);
    };
    const onTransportEnd = (payload) => {
      setActiveVehicleIds((prev) => {
        const next = new Set(prev);
        next.delete(payload.session.vehicleId);
        return next;
      });
      if (!sessionRef.current || payload.session.id !== sessionRef.current.id) return;
      setSession(payload.session);
      setSimulating(false);
      // Integration Sprint 2: the backend's own auto-simulation loop
      // stops itself the moment a session is no longer ACTIVE (see
      // gps.service.js's runSimulationTick) -- there is no local
      // interval on this page to clean up anymore. This still covers the
      // "unexpectedly ended" auto-cancellation case (startStaleSession
      // Watcher), just by reflecting the resulting session state rather
      // than tearing down a timer this page no longer owns.
      if (payload.session.status === 'CANCELLED') {
        pushToast({ type: 'error', title: 'Transport ended unexpectedly', message: 'GPS signal was lost for too long — session auto-cancelled.' });
      }
    };
    const onVehicleOffline = (payload) => {
      if (sessionRef.current && payload.sessionId === sessionRef.current.id) setVehicleOnline(false);
    };
    const onVehicleOnline = (payload) => {
      if (sessionRef.current && payload.sessionId === sessionRef.current.id) setVehicleOnline(true);
    };
    // --- Sprint 6 events ---
    const onCheckpointReached = (payload) => {
      if (!sessionRef.current || payload.sessionId !== sessionRef.current.id) return;
      pushEvent('Reached Checkpoint', payload.checkpoint.checkpointName);
    };
    const onRouteDeviation = (payload) => {
      if (!sessionRef.current || payload.sessionId !== sessionRef.current.id) return;
      if (payload.status === 'STARTED') {
        setDeviating(true);
        setDeviationInfo({ distanceOffRouteMeters: payload.distanceOffRouteMeters, timeOffRouteSeconds: payload.timeOffRouteSeconds });
        pushEvent('Deviation Started', `${payload.distanceOffRouteMeters}m off route`);
        pushToast({ type: 'error', title: 'Route deviation', message: `${payload.distanceOffRouteMeters}m off the expected route.` });
      } else {
        setDeviating(false);
        setDeviationInfo(null);
        pushEvent('Deviation Ended', 'Back within the expected corridor');
      }
    };
    const onTransportDelay = (payload) => {
      if (!sessionRef.current || payload.sessionId !== sessionRef.current.id) return;
      pushEvent('Transport Delayed', `${payload.delayMinutes} min late`);
      pushToast({ type: 'error', title: 'Transport delayed', message: `Running ${payload.delayMinutes} minute(s) behind schedule.` });
    };

    socket.on('gps:update', onGpsUpdate);
    socket.on('transport:start', onTransportStart);
    socket.on('transport:pause', onTransportPause);
    socket.on('transport:end', onTransportEnd);
    socket.on('vehicle:offline', onVehicleOffline);
    socket.on('vehicle:online', onVehicleOnline);
    socket.on('checkpoint:reached', onCheckpointReached);
    socket.on('route:deviation', onRouteDeviation);
    socket.on('transport:delay', onTransportDelay);
    return () => {
      socket.off('gps:update', onGpsUpdate);
      socket.off('transport:start', onTransportStart);
      socket.off('transport:pause', onTransportPause);
      socket.off('transport:end', onTransportEnd);
      socket.off('vehicle:offline', onVehicleOffline);
      socket.off('vehicle:online', onVehicleOnline);
      socket.off('checkpoint:reached', onCheckpointReached);
      socket.off('route:deviation', onRouteDeviation);
      socket.off('transport:delay', onTransportDelay);
    };
  }, [pushToast, pushEvent]);

  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  // --- Demo data auto-provisioning (Transport module hotfix) ---
  // Regression note: this function was accidentally deleted during
  // Integration Sprint 2's refactor (a line-range block replacement that
  // removed it along with the client-driven simulation loop it used to
  // sit next to, while the call to it inside startSimulation below was
  // preserved) -- restored here exactly per the hotfix report's own
  // documented behavior, not redesigned or reimplemented differently.
  //
  // Auto-provisions demo data on first use. Calls only existing,
  // unmodified endpoints (POST /envelopes, POST /vehicles, POST /routes)
  // -- no backend capability added for this. Returns the IDs to use
  // immediately (not relying on React state having flushed by the time
  // the caller needs them), while also updating state so the dropdowns
  // reflect the newly-created records for any *subsequent* run.
  const ensureDemoData = async () => {
    let envelopeId = selectedEnvelopeId;
    let vehicleId = selectedVehicleId;
    let routeId = selectedRouteId;

    if (!envelopeId) {
      // Architectural Integration sprint, Phase 5: startTransport() now
      // gates on prepStatus === 'READY_FOR_DISPATCH'. A bare
      // envelopeService.create() call would leave a demo envelope stuck
      // at QR_GENERATED, unable to ever be dispatched. Routes through
      // the real Examination -> Batch -> Print -> Confirm pipeline
      // instead -- the same one a real operator uses, not a parallel
      // shortcut -- so the resulting envelope is genuinely ready.
      const examination = await examinationService.create({
        state: 'Demo State',
        city: 'Demo City',
        centre: 'Demo Exam Centre',
        examName: 'Demo Board Examination',
        subject: 'General Studies',
        examDate: new Date().toISOString(),
        examTime: '10:00 AM',
        officerId: user.id,
      });
      const { batch, envelopes: batchEnvelopes } = await envelopeBatchService.generateBatch({ examinationId: examination.id, count: 1 });
      await envelopeBatchService.downloadPdf(batch.id); // marks QR_PRINTED -- the real trigger, not a shortcut around it
      await envelopeBatchService.confirmPreparation(batch.id); // the explicit confirmation Phase 4's own correction requires -- advances to READY_FOR_DISPATCH

      const created = await envelopeService.getById(batchEnvelopes[0].id); // re-fetch: the batch response predates the print/confirm calls above
      envelopeId = created.id;
      setEnvelopes((prev) => [...prev, created]);
      setSelectedEnvelopeId(created.id);
      pushEvent('Demo envelope created', `${created.envelopeCode} (printed + preparation confirmed, ready for dispatch)`);
    }

    if (!vehicleId) {
      const created = await gpsService.createVehicle({
        vehicleNumber: `DEMO-${Math.floor(1000 + Math.random() * 9000)}`,
        driverName: 'Demo Driver',
      });
      vehicleId = created.id;
      setVehicles((prev) => [...prev, created]);
      setSelectedVehicleId(created.id);
      pushEvent('Demo vehicle created', created.vehicleNumber);
    }

    let route = routes.find((r) => r.id === routeId);
    if (!route) {
      // Same checkpoints as the Direct route this project ships seeded
      // in its own development database — kept identical here so a
      // freshly auto-created route looks and behaves the same way.
      route = await gpsService.createRoute({
        name: 'Demo Route (Direct)',
        description: 'Auto-created for demonstration — Printing Press -> Treasury -> Exam Centre',
        estimatedDurationMinutes: 45,
        checkpoints: [
          { name: 'Printing Press', latitude: 12.9716, longitude: 77.5946, sequence: 0, radiusMeters: 250 },
          { name: 'District Treasury', latitude: 12.98, longitude: 77.605, sequence: 1, radiusMeters: 250 },
          { name: 'Exam Centre', latitude: 12.99, longitude: 77.615, sequence: 2, radiusMeters: 250 },
        ],
      });
      routeId = route.id;
      setRoutes((prev) => [...prev, route]);
      setSelectedRouteId(route.id);
      pushEvent('Demo route created', route.name);
    }

    return { envelopeId, vehicleId, route };
  };

  // --- GPS observation (Integration Sprint 2) ---
  // Before this sprint, this page *drove* the simulation itself (a
  // setInterval here, calling POST /gps/update every 3s) -- meaning it
  // had to stay open and mounted for the simulation to keep running at
  // all. gps.service.js's startTransport() now starts and owns that loop
  // on the backend automatically (see its own comment on why). This
  // page's job is now purely to start/stop/pause/resume real sessions
  // and *observe* the real Socket.IO events those already produce --
  // exactly what every other page watching the same transport
  // (Dashboard, Live Monitoring, Security Command Center) does too.
  const stopSimulation = useCallback(async (sessionToStop) => {
    setSimulating(false);
    setPaused(false);
    if (sessionToStop) {
      try {
        const stopped = await gpsService.stopTransport(sessionToStop.id);
        setSession(stopped);
      } catch (err) {
        console.error('Stop transport error:', err);
      }
    }
  }, []);

  const startSimulation = async () => {
    if (!user?.id) return;
    try {
      // Defensive re-check, on top of the mount-time reconnect above --
      // covers the edge case where a session was started elsewhere
      // (another browser tab, another operator) in the time between this
      // page loading and this button being clicked. Never lets this
      // button reach startTransport() for a vehicle already IN_TRANSIT;
      // reconnects to whatever is actually running instead.
      if (selectedVehicleId) {
        const live = await gpsService.getLive();
        const alreadyRunning = (live || []).find(
          (entry) => entry.session.vehicleId === selectedVehicleId && (entry.session.status === 'ACTIVE' || entry.session.status === 'PAUSED')
        );
        if (alreadyRunning) {
          await reconnectToSession(alreadyRunning.session);
          pushToast({ type: 'info', title: 'Reconnected', message: 'This vehicle already has an active transport session — reconnected to it instead of starting a new one.' });
          return;
        }
      }

      // "Demo officer" is deliberately not a separate account to create --
      // the currently logged-in user already fills that role, exactly as
      // every prior sprint's simulator has done. Creating a *new* user
      // account here would need Administrator-only endpoints regardless
      // of who's running the demo, for no real benefit over using the
      // account already logged in.
      const { envelopeId, vehicleId, route } = await ensureDemoData();

      const newSession = await gpsService.startTransport({
        envelopeId,
        officerId: user.id,
        vehicleId,
        routeId: route.id,
        scenario,
        autoSimulate: true,
      });
      setSession(newSession);
      setLocations([]);
      setCheckpointNames(new Set());
      setVehicleOnline(true);
      setPaused(false);
      setDeviating(false);
      setDeviationInfo(null);
      setEventLog([]);
      pushEvent('Transport Started', `${SCENARIOS[scenario].label} scenario (server-driven)`);
      setSimulating(true);
      // No client-side loop to start -- the backend's auto-simulation is
      // already running by the time startTransport() resolves. Every
      // update from here on arrives via the gps:update socket listener
      // below, the same as it would on any other page.
    } catch (err) {
      console.error('Start transport error:', err);
      const status = err?.response?.status;
      const message =
        status === 403
          ? 'Auto-creating demo data needs Administrator (or Printing/Transport Officer) access. Log in as an administrator, or create an envelope/vehicle/route manually first.'
          : err?.response?.data?.message || err.message;
      pushToast({ type: 'error', title: 'Could not start transport', message });
    }
  };

  const pauseSimulation = async () => {
    try {
      const updated = await gpsService.pauseTransport(sessionRef.current.id);
      setSession(updated);
      setPaused(true);
    } catch (err) {
      console.error('Pause transport error:', err);
      pushToast({ type: 'error', title: 'Could not pause', message: err?.response?.data?.message || err.message });
    }
  };

  // Integration Sprint 2: the backend's auto-simulation loop correctly
  // *skips* sending updates for a PAUSED session (see gps.service.js's
  // runSimulationTick), so nothing will implicitly resume it anymore --
  // this now calls the new, explicit POST /gps/resume.
  const resumeSimulation = async () => {
    if (!sessionRef.current) return;
    try {
      const updated = await gpsService.resumeTransport(sessionRef.current.id);
      setSession(updated);
      setPaused(false);
    } catch (err) {
      console.error('Resume transport error:', err);
      pushToast({ type: 'error', title: 'Could not resume', message: err?.response?.data?.message || err.message });
    }
  };


  const timelineIndex = useMemo(() => deriveTimelineIndex(session, checkpointNames), [session, checkpointNames]);
  const routeSoFar = useMemo(() => locations.map((l) => [l.latitude, l.longitude]), [locations]);
  const markerPosition = latest ? [latest.latitude, latest.longitude] : null;
  const selectedVehicle = vehicles.find((v) => v.id === selectedVehicleId);

  // Sprint 6 (Map Enhancements: "Expected Route", "Checkpoint Radius").
  // Prefers the started session's own assigned route (authoritative once
  // a session exists) and falls back to the pre-session dropdown
  // selection, so the expected route is visible on the map even before
  // clicking "Start Simulation".
  const assignedRouteCheckpoints = session?.route?.checkpoints || routes.find((r) => r.id === selectedRouteId)?.checkpoints || [];
  const expectedRoutePositions = useMemo(
    () => assignedRouteCheckpoints.map((cp) => [cp.latitude, cp.longitude]),
    [assignedRouteCheckpoints]
  );

  // Sprint 6 hotfix requirement: "update travelled distance" / "update
  // ETA" — both computed here from data already on the page (the
  // locations history, and the assigned route's estimatedDurationMinutes)
  // rather than needing anything new from the backend.
  const travelledDistanceKm = useMemo(() => {
    let total = 0;
    for (let i = 1; i < locations.length; i++) {
      total += haversineMetersDisplay(locations[i - 1].latitude, locations[i - 1].longitude, locations[i].latitude, locations[i].longitude);
    }
    return total / 1000;
  }, [locations]);

  const eta = useMemo(() => {
    const durationMinutes = session?.route?.estimatedDurationMinutes;
    if (!session?.startTime || !durationMinutes) return null;
    const expectedArrival = new Date(session.startTime).getTime() + durationMinutes * 60000;
    const remainingMs = expectedArrival - Date.now();
    return { expectedArrival: new Date(expectedArrival), remainingMinutes: Math.round(remainingMs / 60000) };
  }, [session, latest]); // re-derives on every location update so the countdown stays live
  const selectedEnvelope = envelopes.find((e) => e.id === selectedEnvelopeId);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold text-slate-50">Live GPS Tracking</h1>
          <p className="text-slate-500 text-sm mt-1">Track transport officers carrying examination envelopes in real time.</p>
        </div>
        <div className="flex items-center gap-2">
          {!simulating ? (
            <button
              onClick={startSimulation}
              disabled={loading || session?.status === 'ACTIVE'}
              className="inline-flex items-center gap-2 bg-primary-500 hover:bg-primary-600 disabled:opacity-40 disabled:cursor-not-allowed text-bg font-medium rounded-xl px-4 py-2.5 text-sm"
            >
              {activeVehicleIds.has(selectedVehicleId) ? (
                <><RefreshCw size={15} /> Resume Active Session</>
              ) : (
                <><Play size={15} /> Start Simulation</>
              )}
            </button>
          ) : (
            <>
              {!paused ? (
                <button
                  onClick={pauseSimulation}
                  className="inline-flex items-center gap-2 bg-bg-elevated border border-border hover:border-warning/40 text-slate-300 hover:text-warning rounded-xl px-4 py-2.5 text-sm"
                >
                  <Pause size={15} /> Pause
                </button>
              ) : (
                <button
                  onClick={resumeSimulation}
                  className="inline-flex items-center gap-2 bg-primary-500 hover:bg-primary-600 text-bg font-medium rounded-xl px-4 py-2.5 text-sm"
                >
                  <Play size={15} /> Resume
                </button>
              )}
              <button
                onClick={() => stopSimulation(session)}
                className="inline-flex items-center gap-2 bg-bg-elevated border border-border hover:border-danger/40 text-slate-300 hover:text-danger rounded-xl px-4 py-2.5 text-sm"
              >
                <Square size={15} /> Stop Simulation
              </button>
            </>
          )}
        </div>
      </div>

      {loading ? (
        <Skeleton className="h-96 w-full" />
      ) : (
        <>
          {!session && (
            <Card className="p-5 grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <label className="text-xs text-slate-500 mb-1.5 block">Envelope</label>
                <select
                  value={selectedEnvelopeId}
                  onChange={(e) => setSelectedEnvelopeId(e.target.value)}
                  className="w-full bg-bg-elevated border border-border rounded-xl px-3 py-2.5 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-primary-500/40"
                >
                  {envelopes.length === 0 && <option value="">Auto-create demo envelope on start</option>}
                  {envelopes.map((e) => (
                    <option key={e.id} value={e.id}>{e.envelopeCode} — {e.exam}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-slate-500 mb-1.5 block">Vehicle</label>
                <select
                  value={selectedVehicleId}
                  onChange={(e) => setSelectedVehicleId(e.target.value)}
                  className="w-full bg-bg-elevated border border-border rounded-xl px-3 py-2.5 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-primary-500/40"
                >
                  {vehicles.length === 0 && <option value="">Auto-create demo vehicle on start</option>}
                  {vehicles.map((v) => (
                    <option key={v.id} value={v.id}>{v.vehicleNumber} — {v.driverName}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-slate-500 mb-1.5 block">Route</label>
                <select
                  value={selectedRouteId}
                  onChange={(e) => setSelectedRouteId(e.target.value)}
                  className="w-full bg-bg-elevated border border-border rounded-xl px-3 py-2.5 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-primary-500/40"
                >
                  {routes.length === 0 && <option value="">Auto-create demo route on start</option>}
                  {routes.map((r) => (
                    <option key={r.id} value={r.id}>{r.name} ({r.checkpoints.length} stops, ~{r.estimatedDurationMinutes}min)</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-slate-500 mb-1.5 block">Scenario</label>
                <select
                  value={scenario}
                  onChange={(e) => setScenario(e.target.value)}
                  className="w-full bg-bg-elevated border border-border rounded-xl px-3 py-2.5 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-primary-500/40"
                >
                  {Object.entries(SCENARIOS).map(([key, s]) => (
                    <option key={key} value={key}>{s.label}</option>
                  ))}
                </select>
                <p className="text-[11px] text-slate-500 mt-1.5">{SCENARIOS[scenario].description}</p>
              </div>
            </Card>
          )}

          <div className="grid lg:grid-cols-3 gap-6">
            {/* --- Map --- */}
            <Card className="lg:col-span-2 p-0 overflow-hidden" style={{ height: 480 }}>
              <MapContainer center={MAP_CENTER} zoom={13} style={{ height: '100%', width: '100%' }}>
                <TileLayer
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                {CHECKPOINTS.map((cp) => (
                  <Marker key={cp.name} position={[cp.latitude, cp.longitude]} icon={checkpointIcon}>
                    <Popup>{cp.name}</Popup>
                  </Marker>
                ))}
                {/* Sprint 6: each assigned-route checkpoint's configurable
                    geofence radius, drawn as a translucent circle — makes
                    "Configurable radius, default 250m" a visible fact on
                    the map, not just a stored number. */}
                {assignedRouteCheckpoints.map((cp) => (
                  <Circle
                    key={`geofence-${cp.name}`}
                    center={[cp.latitude, cp.longitude]}
                    radius={cp.radiusMeters || 250}
                    pathOptions={{ color: '#64748B', fillColor: '#64748B', fillOpacity: 0.08, weight: 1 }}
                  />
                ))}
                {/* Expected route (dashed) vs. Current/Travelled route
                    (solid) — Sprint 6's "Expected Route, Travelled Route,
                    Current Route" map requirement. */}
                {expectedRoutePositions.length > 1 && (
                  <Polyline positions={expectedRoutePositions} pathOptions={{ color: '#94A3B8', weight: 2, dashArray: '6 8' }} />
                )}
                {routeSoFar.length > 1 && (
                  <Polyline positions={routeSoFar} pathOptions={{ color: deviating ? '#F87171' : '#38BDF8', weight: 3 }} />
                )}
                {/* Deviation Area: while off-corridor, a highlighted ring
                    around the vehicle's current position. A precise
                    buffered-corridor polygon along the whole expected
                    route would need a geometry library this project
                    doesn't otherwise use (e.g. turf.js) for a purely
                    visual nicety — this simpler, honest approximation
                    (highlight where the deviation *currently* is) conveys
                    the same information without that new dependency. */}
                {deviating && markerPosition && (
                  <Circle center={markerPosition} radius={ROUTE_CORRIDOR_METERS_DISPLAY} pathOptions={{ color: '#F87171', fillColor: '#F87171', fillOpacity: 0.12, weight: 2, dashArray: '4 6' }} />
                )}
                {markerPosition && (
                  <Marker position={markerPosition} icon={vehicleIcon}>
                    <Popup>
                      {selectedVehicle?.vehicleNumber} — {latest?.speed?.toFixed(0)} km/h
                    </Popup>
                  </Marker>
                )}
              </MapContainer>
            </Card>

            {/* --- Live status card --- */}
            <Card className="p-5 space-y-4">
              <h3 className="font-display font-semibold text-slate-100 flex items-center gap-2">
                <Radio size={16} className={session?.status === 'ACTIVE' ? 'text-primary-500 animate-pulse' : 'text-slate-500'} />
                Live Status
              </h3>

              {!session ? (
                <EmptyState icon={Truck} title="No active transport" description="Start a simulation to see live tracking." />
              ) : (
                <div className="space-y-3 text-sm">
                  {!vehicleOnline && (
                    <div className="flex items-center gap-2 text-warning bg-warning/10 ring-1 ring-warning/30 rounded-lg px-3 py-2 text-xs">
                      <AlertTriangle size={14} /> GPS signal lost
                    </div>
                  )}
                  {deviating && deviationInfo && (
                    <div className="text-danger bg-danger/10 ring-1 ring-danger/30 rounded-lg px-3 py-2 text-xs space-y-1">
                      <div className="flex items-center gap-2 font-medium"><AlertTriangle size={14} /> Route deviation in progress</div>
                      <div>Distance off route: {deviationInfo.distanceOffRouteMeters}m</div>
                      <div>Time off route: {deviationInfo.timeOffRouteSeconds}s</div>
                    </div>
                  )}
                  <Row icon={Truck} label="Vehicle" value={selectedVehicle?.vehicleNumber || '—'} />
                  <Row icon={UserIcon} label="Officer" value={user?.name || '—'} />
                  <Row icon={FileText} label="Envelope" value={selectedEnvelope?.envelopeCode || '—'} />
                  <Row icon={Gauge} label="Speed" value={latest ? `${latest.speed?.toFixed(1)} km/h` : '—'} />
                  <Row icon={MapPin} label="Latitude" value={latest ? latest.latitude.toFixed(5) : '—'} />
                  <Row icon={MapPin} label="Longitude" value={latest ? latest.longitude.toFixed(5) : '—'} />
                  <Row
                    icon={Battery}
                    label="Battery"
                    value={latest?.batteryLevel != null ? `${latest.batteryLevel}%` : '—'}
                    valueClassName={latest?.batteryLevel != null && latest.batteryLevel < 20 ? 'text-danger' : ''}
                  />
                  <Row icon={Clock} label="Last Update" value={timeAgo(latest?.timestamp)} />
                  <Row icon={Navigation} label="Travelled Distance" value={`${travelledDistanceKm.toFixed(2)} km`} />
                  <Row
                    icon={Clock}
                    label="ETA"
                    value={eta ? (eta.remainingMinutes > 0 ? `${eta.remainingMinutes} min (${eta.expectedArrival.toLocaleTimeString()})` : 'Overdue') : '—'}
                    valueClassName={eta && eta.remainingMinutes <= 0 ? 'text-danger' : ''}
                  />
                  <div className="pt-2">
                    <Badge variant={session.status === 'ACTIVE' ? 'primary' : 'neutral'} dot>{session.status}</Badge>
                  </div>
                </div>
              )}
            </Card>
          </div>

          {/* --- Timeline --- */}
          <Card className="p-5">
            <h3 className="font-display font-semibold text-slate-100 mb-4">Transport Timeline</h3>
            <div className="flex flex-wrap items-center gap-2">
              {TIMELINE_STEPS.map((step, i) => (
                <React.Fragment key={step}>
                  <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium ${
                    i <= timelineIndex ? 'bg-primary-500/15 text-primary-500 ring-1 ring-primary-500/30' : 'bg-bg-elevated text-slate-500'
                  }`}>
                    {i <= timelineIndex && <CheckCircle2 size={12} />}
                    {step}
                  </div>
                  {i < TIMELINE_STEPS.length - 1 && <div className="w-4 h-px bg-border" />}
                </React.Fragment>
              ))}
            </div>
          </Card>

          {/* Sprint 6 (TIMELINE): "Entered Geofence, Exited Geofence,
              Reached Checkpoint, Deviation Started, Deviation Ended,
              Transport Delayed" — these are chronological *events*, not
              linear progress steps like the stage-based timeline above
              (a vehicle can enter/exit the same geofence repeatedly, or
              deviate more than once) — a live, timestamped feed is the
              more honest fit for them, added as its own panel rather
              than folded into the existing step-tracker. */}
          {eventLog.length > 0 && (
            <Card className="p-5">
              <h3 className="font-display font-semibold text-slate-100 mb-4">Live Event Log</h3>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {eventLog.map((e) => (
                  <div key={e.id} className="flex items-center justify-between text-sm">
                    <span className="text-slate-300">{e.label}{e.detail ? ` — ${e.detail}` : ''}</span>
                    <span className="text-slate-500 text-xs">{timeAgo(e.at)}</span>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

function Row({ icon: Icon, label, value, valueClassName = '' }) {
  return (
    <div className="flex items-center justify-between">
      <span className="flex items-center gap-2 text-slate-500"><Icon size={14} /> {label}</span>
      <span className={`text-slate-200 font-medium ${valueClassName}`}>{value}</span>
    </div>
  );
}
