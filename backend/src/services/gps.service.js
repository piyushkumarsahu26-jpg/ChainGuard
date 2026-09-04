// Business logic for Sprint 5 (Live GPS Tracking) + Sprint 6
// (Geofencing, Route Deviation & Smart Transport Alerts). Follows the
// exact Controller -> Service -> Repository layering already established
// throughout this project (detection.service.js, envelope.service.js,
// etc.) — nothing new introduced architecturally.
import { vehicleRepository } from '../repositories/vehicle.repository.js';
import { transportSessionRepository } from '../repositories/transportSession.repository.js';
import { prisma } from '../config/db.js';
import { gpsLocationRepository } from '../repositories/gpsLocation.repository.js';
import { transportCheckpointRepository } from '../repositories/transportCheckpoint.repository.js';
import { transportRouteRepository } from '../repositories/transportRoute.repository.js';
import { geofenceEventRepository } from '../repositories/geofenceEvent.repository.js';
import { alertRepository } from '../repositories/alert.repository.js';
import { envelopeRepository } from '../repositories/envelope.repository.js';
import { custodyRepository } from '../repositories/custody.repository.js';
import { userRepository } from '../repositories/user.repository.js';
import { auditLogRepository } from '../repositories/auditLog.repository.js';
import { incidentResponseService } from './incidentResponse.service.js';
import { getIo } from '../config/socket.js';
import { ApiError } from '../utils/apiError.js';
import { logger } from '../config/logger.js';
import { haversineMeters, KNOWN_CHECKPOINTS, distanceToRouteMeters, buildInterpolatedRoute, buildWrongRoute } from '../utils/geo.util.js';

export { KNOWN_CHECKPOINTS };

const CHECKPOINT_RADIUS_METERS = 300;

// Alert thresholds (Sprint 5 objective, "ALERTS" section).
const LOW_BATTERY_THRESHOLD = 20;
const STOPPED_ALERT_MINUTES = 5;
const SIGNAL_LOST_SECONDS = 45; // see startStaleSessionWatcher() below

// Sprint 6 thresholds. ROUTE_CORRIDOR_METERS is deliberately wider than
// any single checkpoint's own geofence radius (default 250m) — a route is
// a *line*, not a set of points, and real road curvature means a vehicle
// genuinely following its route will still sit some distance from the
// straight-line interpolation between checkpoints. 500m gives that
// slack without being so wide that a real deviation goes undetected.
export const ROUTE_CORRIDOR_METERS = 500;
// A single momentarily-noisy GPS point shouldn't raise a deviation alert
// — require the vehicle to still be off-corridor after this many seconds
// of continuous deviation before alerting (checked against when the
// deviation *started*, not a fixed update count, so it works the same
// regardless of update frequency).
const DEVIATION_ALERT_GRACE_SECONDS = 15;
const LATE_ARRIVAL_GRACE_MINUTES = 10;

// Per-session debounce state, in-process only (this is a single-server
// deployment, same scope assumption every other part of this project
// makes — e.g. inference/performance.py's metrics store on the AI side).
// Cleared when a session stops. Prevents "battery low" / "stopped" from
// re-alerting on every single 3-second update while the condition persists.
const alertedConditions = new Map(); // sessionId -> Set of condition keys
const offlineSessions = new Set(); // sessionId currently flagged vehicle:offline
const deviatingSessions = new Map(); // sessionId -> { startedAt } while off-corridor
const insideGeofences = new Map(); // sessionId -> Set of checkpoint names currently inside

function hasAlerted(sessionId, key) {
  return alertedConditions.get(sessionId)?.has(key) ?? false;
}
function markAlerted(sessionId, key) {
  if (!alertedConditions.has(sessionId)) alertedConditions.set(sessionId, new Set());
  alertedConditions.get(sessionId).add(key);
}
function clearAlertState(sessionId) {
  alertedConditions.delete(sessionId);
  offlineSessions.delete(sessionId);
  deviatingSessions.delete(sessionId);
  insideGeofences.delete(sessionId);
}

async function raiseAlert({ session, severity, title, description, category }) {
  const alert = await alertRepository.create({
    severity,
    status: 'OPEN',
    title,
    description,
    envelopeId: session?.envelopeId || null,
    category: category || null,
  });
  getIo().emit('alert:new', { alert });

  // Integration Sprint 4: every transport-anomaly alert now also writes
  // a real AuditLog entry and (when there's a real envelope + officer
  // behind it) a ChainOfCustody event -- neither existed for this path
  // before. Fire-and-forget is deliberate: incidentResponseService
  // itself catches and logs its own failures rather than throwing, so a
  // problem writing the audit trail can never prevent the real alert
  // (already created above) from reaching the user.
  if (session) {
    incidentResponseService.recordIncident({
      envelopeId: session.envelopeId,
      actorId: session.officerId,
      category: category || 'TRANSPORT_ANOMALY',
      title,
      description,
      createCustodyEvent: true,
      custodyEventType: 'DISCREPANCY',
      location: session.vehicle?.vehicleNumber ? `In transit (vehicle ${session.vehicle.vehicleNumber})` : undefined,
    });
  }

  return alert;
}

export const gpsService = {
  // Integration Sprint 2: `scenario` (NORMAL | WRONG_ROUTE | VEHICLE_STOP |
  // BATTERY_LOW | LOST_GPS -- the exact 5 scenarios Sprint 6's frontend
  // simulator already offered) and `autoSimulate` are new, both optional
  // and backward compatible. `autoSimulate` defaults to true: "when a
  // transport session starts, the GPS simulation automatically begins"
  // is this sprint's literal instruction, and this project has never had
  // a real GPS device to opt out in favor of -- every prior sprint's own
  // completion reports confirm the simulator has always been the only
  // real data source. The flag exists for forward-compatibility (a
  // future real-device integration would pass autoSimulate: false) more
  // than because anything in this project needs it today.
  async startTransport({ envelopeId, officerId, vehicleId, routeId, scenario = 'NORMAL', autoSimulate = true }) {
    const [envelope, officer, vehicle, route] = await Promise.all([
      envelopeRepository.findById(envelopeId),
      userRepository.findById(officerId),
      vehicleRepository.findById(vehicleId),
      routeId ? transportRouteRepository.findById(routeId) : Promise.resolve(null),
    ]);
    if (!envelope) throw ApiError.notFound('Envelope not found');
    if (!officer) throw ApiError.notFound('Officer not found');
    if (!vehicle) throw ApiError.notFound('Vehicle not found');
    if (routeId && !route) throw ApiError.notFound('Route not found');

    // Architectural Integration sprint, Phase 5: "Only Ready For
    // Dispatch envelopes can be dispatched." Checked against the real
    // preparation lifecycle (Phase 4), not inferred from anything else.
    if (envelope.prepStatus !== 'READY_FOR_DISPATCH') {
      throw ApiError.conflict(
        `Envelope ${envelope.envelopeCode} is not ready for dispatch (current status: ${envelope.prepStatus}). Complete QR printing and preparation confirmation first.`
      );
    }

    // Critical bug fix: this used to check vehicle.status === 'IN_TRANSIT'
    // directly -- a field that's only ever *derived*, kept in sync by
    // separate writes in stopTransport() and the stale-session watcher
    // whenever a session ends. If either of those writes ever failed
    // partway (e.g. the session's own status update committing but a
    // later step throwing before the vehicle got reset -- exactly what
    // an unwrapped multi-step write risks, see stopTransport()'s own new
    // comment on why it's now wrapped in a transaction), the vehicle
    // could be marked IN_TRANSIT forever with no session actually
    // backing that claim, permanently blocking every future transport
    // for it. This checks the real source of truth instead: is there an
    // actual ACTIVE/PAUSED TransportSession referencing this vehicle
    // right now?
    const activeSession = await transportSessionRepository.findActiveForVehicle(vehicleId);
    if (activeSession) {
      throw ApiError.conflict('Vehicle is already on an active transport session');
    }
    // Final Verification Sprint fix: the analogous check for the
    // envelope side of the same real-world constraint was missing
    // entirely -- a physical envelope cannot legitimately be in transit
    // on two different vehicles/sessions at once, but nothing prevented
    // two dispatch requests for the same envelope (different vehicles)
    // from both succeeding. Checked against the real session table, not
    // envelope.transportStatus -- same reasoning as the vehicle check
    // above: a derived field can theoretically go stale, the real
    // active-session query cannot.
    const activeEnvelopeSession = await transportSessionRepository.findActiveForEnvelope(envelopeId);
    if (activeEnvelopeSession) {
      throw ApiError.conflict(`Envelope ${envelope.envelopeCode} already has an active transport session`);
    }
    if (vehicle.status === 'IN_TRANSIT') {
      // Self-heal: the flag was stale (no real session backs it) --
      // correct it now rather than silently working around it and
      // leaving the bad data sitting in place for the next reader (a
      // vehicle list, a dashboard count) to still show wrong.
      logger.warn(`Vehicle ${vehicle.vehicleNumber} was marked IN_TRANSIT with no active session backing it -- correcting to AVAILABLE`);
      await vehicleRepository.update(vehicleId, { status: 'AVAILABLE' });
    }

    const session = await transportSessionRepository.create({
      envelopeId,
      officerId,
      vehicleId,
      routeId: routeId || null,
      status: 'ACTIVE',
    });
    await vehicleRepository.update(vehicleId, { status: 'IN_TRANSIT' });

    // Sprint Integration-1: the envelope's own transportStatus is now a
    // real, written field (not just derivable from querying its
    // sessions) -- see schema.prisma's comment on why this is distinct
    // from sealStatus. Updated here, in the same place the session
    // itself becomes ACTIVE, so the two can never disagree.
    const updatedEnvelope = await envelopeRepository.update(envelopeId, { transportStatus: 'IN_TRANSIT' });

    await auditLogRepository.create({
      action: 'TRANSPORT_STARTED',
      actorId: officerId,
      metadata: { envelopeId, envelopeCode: envelope.envelopeCode, sessionId: session.id, vehicleId, vehicleNumber: vehicle.vehicleNumber, routeId: routeId || null, scenario },
    });

    // Final Verification Sprint fix: TRANSPORT_START has existed as a
    // CustodyEventType since the very first phase of this project, but
    // this function only ever wrote an AuditLog entry, never a real
    // ChainOfCustody event -- a real, confirmed gap found during the
    // Chain of Custody audit. Fixed by reusing the exact same
    // custodyRepository.create() pattern every other custody-event
    // write in this codebase already uses.
    await custodyRepository.create({
      envelopeId,
      eventType: 'TRANSPORT_START',
      officerId,
      location: vehicle.vehicleNumber ? `Dispatched via vehicle ${vehicle.vehicleNumber}` : envelope.center,
      remarks: `Transport started${routeId ? ` on route ${routeId}` : ''}.`,
    });

    getIo().emit('transport:start', { session });
    // Reuses the exact same event envelope.service.js's create() already
    // emits, per this sprint's own "notify the dashboard through
    // existing Socket.IO events" instruction -- not a new event name,
    // the same one any existing envelope:updated listener already
    // handles (Security Command Center, EnvelopeDetails, etc.).
    getIo().emit('envelope:updated', { type: 'TRANSPORT_STARTED', envelope: updatedEnvelope });
    logger.info(`Transport session started: ${session.id} (vehicle ${vehicle.vehicleNumber})`);

    if (autoSimulate) {
      startAutoSimulation(session, scenario);
    }

    return session;
  },

  async pauseTransport({ sessionId }) {
    const session = await transportSessionRepository.findById(sessionId);
    if (!session) throw ApiError.notFound('Transport session not found');
    if (session.status !== 'ACTIVE') {
      throw ApiError.conflict('Only an active transport session can be paused');
    }

    const updated = await transportSessionRepository.update(sessionId, { status: 'PAUSED' });
    getIo().emit('transport:pause', { session: updated });
    logger.info(`Transport session paused: ${sessionId}`);
    return updated;
  },

  // Integration Sprint 2: a new, small, symmetric counterpart to
  // pauseTransport -- genuinely needed now, not present before. Sprint
  // 6's original design deliberately had no resume endpoint: pausing
  // only ever stopped the *frontend's* update loop, and "resume" was
  // just the frontend restarting it, whose very next real gps:update
  // would auto-flip PAUSED back to ACTIVE (see updateLocation() below).
  // Now that the simulation loop itself runs on the backend and
  // correctly *skips* sending updates for a paused session (so it can't
  // accidentally self-resume mid-pause), something has to explicitly
  // flip the status back -- this is that.
  async resumeTransport({ sessionId }) {
    const session = await transportSessionRepository.findById(sessionId);
    if (!session) throw ApiError.notFound('Transport session not found');
    if (session.status !== 'PAUSED') {
      throw ApiError.conflict('Only a paused transport session can be resumed');
    }

    const updated = await transportSessionRepository.update(sessionId, { status: 'ACTIVE' });
    getIo().emit('transport:start', { session: updated }); // reuses the existing event -- a resume is, from every consumer's perspective, "this session is active again"
    logger.info(`Transport session resumed: ${sessionId}`);
    return updated;
  },

  async updateLocation({ sessionId, latitude, longitude, speed, accuracy, heading, batteryLevel }) {
    const session = await transportSessionRepository.findById(sessionId);
    if (!session) throw ApiError.notFound('Transport session not found');
    if (session.status !== 'ACTIVE' && session.status !== 'PAUSED') {
      throw ApiError.conflict('Transport session is not active');
    }

    // A fresh update arriving for a PAUSED session is exactly what
    // "Resume" means — per the objective's own event list, there is no
    // separate transport:resume event; resuming is simply the gps:update
    // stream continuing. Same auto-recovery pattern as the existing
    // offline/online detection just below.
    if (session.status === 'PAUSED') {
      await transportSessionRepository.update(sessionId, { status: 'ACTIVE' });
    }

    const location = await gpsLocationRepository.create({
      sessionId,
      latitude,
      longitude,
      speed: speed ?? null,
      accuracy: accuracy ?? null,
      heading: heading ?? null,
      batteryLevel: batteryLevel ?? null,
    });

    // A session coming back after being flagged offline (see
    // startStaleSessionWatcher) is real, useful signal — surface it.
    if (offlineSessions.has(sessionId)) {
      offlineSessions.delete(sessionId);
      getIo().emit('vehicle:online', { sessionId, vehicleId: session.vehicleId });
    }

    // --- Checkpoint proximity detection ---
    // Sprint 6: uses the session's ASSIGNED route's own checkpoints when
    // one exists (each with its own configurable radius) — a route like
    // "Via Ring Road" has stops (Ring Road Junction, Bypass Junction)
    // that aren't in KNOWN_CHECKPOINTS at all. Falls back to
    // KNOWN_CHECKPOINTS for a routeless session, preserving Sprint 5's
    // exact original behavior for backward compatibility.
    const routeCheckpoints = session.route?.checkpoints?.length > 0 ? session.route.checkpoints : null;
    const checkpointsToCheck = routeCheckpoints || KNOWN_CHECKPOINTS;

    const reachedNames = await transportCheckpointRepository.namesReachedForSession(sessionId);
    let checkpointReached = null;
    for (const checkpoint of checkpointsToCheck) {
      if (reachedNames.has(checkpoint.name)) continue;
      const distance = haversineMeters(latitude, longitude, checkpoint.latitude, checkpoint.longitude);
      const radius = checkpoint.radiusMeters ?? CHECKPOINT_RADIUS_METERS;
      if (distance <= radius) {
        checkpointReached = await transportCheckpointRepository.create({
          sessionId,
          checkpointName: checkpoint.name,
          latitude,
          longitude,
        });
        logger.info(`Checkpoint reached: ${checkpoint.name} (session ${sessionId})`);
        getIo().emit('checkpoint:reached', { sessionId, checkpoint: checkpointReached });
        // Final Verification Sprint fix: same gap as TRANSPORT_START/
        // TRANSPORT_END -- CHECKPOINT existed as a CustodyEventType but
        // nothing ever created one. Attributed to the session's own
        // assigned officer, matching the established decision for
        // automatic custody events (no synthetic system user).
        await custodyRepository.create({
          envelopeId: session.envelopeId,
          eventType: 'CHECKPOINT',
          officerId: session.officerId,
          location: checkpoint.name,
          remarks: `Checkpoint reached: ${checkpoint.name}.`,
        });

        // Sprint 6: "Checkpoint Missed" — if this checkpoint's sequence is
        // N but an earlier-sequence checkpoint on the same route was
        // never reached, the vehicle skipped it (took a shortcut, or a
        // geofence was never actually entered for it). Only meaningful
        // for route-assigned sessions, where sequence is formally defined.
        if (routeCheckpoints && checkpoint.sequence != null) {
          const updatedReached = new Set(reachedNames).add(checkpoint.name);
          const skipped = routeCheckpoints.filter((c) => c.sequence < checkpoint.sequence && !updatedReached.has(c.name));
          for (const missedCp of skipped) {
            const key = `checkpoint_missed:${missedCp.name}`;
            if (hasAlerted(sessionId, key)) continue;
            markAlerted(sessionId, key);
            await raiseAlert({
              session,
              severity: 'MEDIUM',
              category: 'CHECKPOINT_MISSED',
              title: `Checkpoint missed: ${missedCp.name}`,
              description: `${session.vehicle.vehicleNumber} reached "${checkpoint.name}" without ever entering "${missedCp.name}"'s geofence (session ${sessionId}).`,
            });
          }
        }
        break; // at most one new checkpoint per update — they're spaced apart
      }
    }

    // --- Sprint 6: Geofencing — per-checkpoint enter/exit events, for
    // every checkpoint on the assigned route (or KNOWN_CHECKPOINTS if
    // none), independent of the "reached" bookkeeping above. A vehicle
    // can enter and exit the same geofence more than once per session;
    // TransportCheckpoint (above) only ever records the first arrival. ---
    if (!insideGeofences.has(sessionId)) insideGeofences.set(sessionId, new Set());
    const currentlyInside = insideGeofences.get(sessionId);
    for (const checkpoint of checkpointsToCheck) {
      const distance = haversineMeters(latitude, longitude, checkpoint.latitude, checkpoint.longitude);
      const radius = checkpoint.radiusMeters ?? CHECKPOINT_RADIUS_METERS;
      const isInside = distance <= radius;
      const wasInside = currentlyInside.has(checkpoint.name);

      if (isInside && !wasInside) {
        currentlyInside.add(checkpoint.name);
        await geofenceEventRepository.create({ sessionId, checkpointName: checkpoint.name, eventType: 'ENTERED', latitude, longitude });
      } else if (!isInside && wasInside) {
        currentlyInside.delete(checkpoint.name);
        await geofenceEventRepository.create({ sessionId, checkpointName: checkpoint.name, eventType: 'EXITED', latitude, longitude });
      }
    }

    // --- Sprint 6: Route Deviation Detection — only for a session with
    // an assigned route (a routeless session has no "expected route" to
    // compare against, exactly like Sprint 5's own envelopeId/cameraId
    // nullability precedent). ---
    let deviationStatus = null;
    if (routeCheckpoints) {
      const offRouteDistance = distanceToRouteMeters(latitude, longitude, routeCheckpoints);
      const isOffRoute = offRouteDistance > ROUTE_CORRIDOR_METERS;
      const deviationState = deviatingSessions.get(sessionId);

      if (isOffRoute && !deviationState) {
        deviatingSessions.set(sessionId, { startedAt: Date.now(), distance: offRouteDistance });
      } else if (isOffRoute && deviationState) {
        const secondsSinceStart = (Date.now() - deviationState.startedAt) / 1000;
        if (secondsSinceStart >= DEVIATION_ALERT_GRACE_SECONDS && !hasAlerted(sessionId, 'deviation')) {
          markAlerted(sessionId, 'deviation');
          deviationStatus = 'STARTED';
          getIo().emit('route:deviation', {
            sessionId,
            status: 'STARTED',
            currentPosition: { latitude, longitude },
            distanceOffRouteMeters: Math.round(offRouteDistance),
            timeOffRouteSeconds: Math.round(secondsSinceStart),
          });
          await raiseAlert({
            session,
            severity: 'HIGH',
            category: 'ROUTE_DEVIATION',
            title: `Route deviation: ${session.vehicle.vehicleNumber}`,
            description: `${Math.round(offRouteDistance)}m off the expected route for over ${Math.round(secondsSinceStart)}s (session ${sessionId}).`,
          });
        }
      } else if (!isOffRoute && deviationState) {
        // Back within the corridor — clear state so a later, genuinely
        // new deviation can alert again. Emits ENDED regardless of
        // whether the grace period had actually elapsed and an alert was
        // raised — the map/timeline should reflect "no longer deviating"
        // either way, even for a brief deviation that self-corrected
        // before crossing the alert threshold.
        deviatingSessions.delete(sessionId);
        alertedConditions.get(sessionId)?.delete('deviation');
        deviationStatus = 'ENDED';
        getIo().emit('route:deviation', {
          sessionId,
          status: 'ENDED',
          currentPosition: { latitude, longitude },
          distanceOffRouteMeters: Math.round(offRouteDistance),
        });
      }
    }

    // --- Alerts (Sprint 5 objective, "ALERTS" section) ---
    if (batteryLevel != null && batteryLevel < LOW_BATTERY_THRESHOLD && !hasAlerted(sessionId, 'battery')) {
      markAlerted(sessionId, 'battery');
      await raiseAlert({
        session,
        severity: 'HIGH',
        category: 'BATTERY_LOW',
        title: `Low battery: ${session.vehicle.vehicleNumber}`,
        description: `Transport device battery at ${batteryLevel}% (session ${sessionId}, officer ${session.officer.name}).`,
      });
    }

    if (speed != null && speed < 1 && !hasAlerted(sessionId, 'stopped')) {
      const lastMoving = await gpsLocationRepository.mostRecentMovingPoint(sessionId);
      if (lastMoving) {
        const stoppedMinutes = (Date.now() - new Date(lastMoving.timestamp).getTime()) / 60000;
        if (stoppedMinutes >= STOPPED_ALERT_MINUTES) {
          markAlerted(sessionId, 'stopped');
          await raiseAlert({
            session,
            severity: 'MEDIUM',
            category: 'VEHICLE_STOPPED',
            title: `Vehicle stopped: ${session.vehicle.vehicleNumber}`,
            description: `No movement for over ${STOPPED_ALERT_MINUTES} minutes (session ${sessionId}, officer ${session.officer.name}).`,
          });
        }
      }
    }
    // Speed picking back up clears the "stopped" debounce, so a second
    // genuine stop later in the same session can alert again.
    if (speed != null && speed >= 1) {
      alertedConditions.get(sessionId)?.delete('stopped');
    }

    getIo().emit('gps:update', { sessionId, location, checkpointReached, deviationStatus });
    return { location, checkpointReached, deviationStatus };
  },

  async stopTransport({ sessionId }) {
    const session = await transportSessionRepository.findById(sessionId);
    if (!session) throw ApiError.notFound('Transport session not found');
    if (session.status !== 'ACTIVE') throw ApiError.conflict('Transport session is not active');

    stopAutoSimulation(sessionId);

    // Critical bug fix: these two writes must succeed or fail together.
    // Previously separate, unwrapped calls -- if the second ever threw
    // after the first had already committed (a transient DB error, or
    // the process exiting between them), the session would be left
    // COMPLETED while the vehicle stayed IN_TRANSIT forever, with no
    // session left to explain why. This is the actual mechanism that
    // produced the reported bug. Reuses the same update() functions
    // every other call site already uses, via the optional `client`
    // param each gained for exactly this -- not a second, parallel way
    // of writing these fields.
    const updated = await prisma.$transaction(async (tx) => {
      const updatedSession = await transportSessionRepository.update(sessionId, { status: 'COMPLETED', endTime: new Date() }, tx);
      await vehicleRepository.update(session.vehicleId, { status: 'AVAILABLE' }, tx);
      return updatedSession;
    });
    clearAlertState(sessionId);

    // A normal stopTransport() call is always a deliberate, successful
    // completion (the "unexpectedly ended" path below is separate and
    // reverts to AT_REST instead, since nothing was actually delivered).
    const updatedEnvelope = await envelopeRepository.update(session.envelopeId, { transportStatus: 'DELIVERED' });
    await auditLogRepository.create({
      action: 'TRANSPORT_ENDED',
      actorId: session.officerId,
      metadata: { envelopeId: session.envelopeId, envelopeCode: session.envelope?.envelopeCode, sessionId, outcome: 'COMPLETED' },
    });
    // Final Verification Sprint fix: same gap as TRANSPORT_START above --
    // TRANSPORT_END existed as a CustodyEventType but was never created.
    await custodyRepository.create({
      envelopeId: session.envelopeId,
      eventType: 'TRANSPORT_END',
      officerId: session.officerId,
      location: session.vehicle?.vehicleNumber ? `Arrived via vehicle ${session.vehicle.vehicleNumber}` : (session.envelope?.center || 'Destination'),
      remarks: 'Transport session completed.',
    });

    getIo().emit('transport:end', { session: updated });
    getIo().emit('envelope:updated', { type: 'TRANSPORT_ENDED', envelope: updatedEnvelope });
    logger.info(`Transport session ended: ${sessionId}`);
    return updated;
  },

  async getLiveLocations() {
    const activeSessions = await transportSessionRepository.listActive();
    // Final Verification Sprint fix: same N+1 pattern as
    // getDashboardStats() had, missed when that one was fixed nearby --
    // this endpoint is if anything more performance-sensitive (GET
    // /gps/live is polled directly by Live Monitoring, Security Command
    // Center, and TransportMonitoring.jsx's own reconnect-on-mount
    // check), so one batched query replaces one query per active
    // session.
    const latestLocations = await gpsLocationRepository.latestForSessions(activeSessions.map((s) => s.id));
    const latestBySession = new Map(latestLocations.map((loc) => [loc.sessionId, loc]));
    return activeSessions.map((session) => ({ session, latestLocation: latestBySession.get(session.id) || null }));
  },

  async getHistory(sessionId) {
    const session = await transportSessionRepository.findById(sessionId);
    if (!session) throw ApiError.notFound('Transport session not found');
    const [locations, checkpoints] = await Promise.all([
      gpsLocationRepository.historyForSession(sessionId),
      transportCheckpointRepository.listForSession(sessionId),
    ]);
    return { session, locations, checkpoints };
  },

  // "Generate transport history for every envelope" (Sprint 5 objective,
  // REPORTS section) — every session this envelope has ever been carried
  // under (normally one, but the data model doesn't assume exactly one),
  // each with its full location + checkpoint history.
  async getHistoryByEnvelope(envelopeId) {
    const envelope = await envelopeRepository.findById(envelopeId);
    if (!envelope) throw ApiError.notFound('Envelope not found');

    const sessions = await transportSessionRepository.listByEnvelope(envelopeId);
    const withHistory = await Promise.all(
      sessions.map(async (session) => {
        const [locations, checkpoints] = await Promise.all([
          gpsLocationRepository.historyForSession(session.id),
          transportCheckpointRepository.listForSession(session.id),
        ]);
        return { session, locations, checkpoints };
      })
    );
    return { envelope, sessions: withHistory };
  },

  // Dashboard widgets (Sprint 5 objective, "DASHBOARD INTEGRATION"):
  // Vehicles Online, Active Transport, Average Speed, GPS Signal Status,
  // Live Alerts. Called from dashboard.service.js's getSummary() — kept
  // here, not there, since this is GPS domain logic, matching how
  // dashboard.service.js already delegates to other repositories rather
  // than owning cross-domain logic itself.
  async getDashboardStats() {
    const [activeOnlySessions, allActiveOrPaused, vehiclesInTransit, liveAlerts] = await Promise.all([
      transportSessionRepository.listActiveOnly(),
      transportSessionRepository.listActive(),
      vehicleRepository.count({ status: 'IN_TRANSIT' }),
      // GPS/transport-sourced alerts are the ones with no detectionId —
      // every AI-originated alert has one (see detection.service.js);
      // this project has no other alert source, so this filter reliably
      // isolates GPS-specific alerts from AI tamper alerts without a new
      // schema field.
      alertRepository.count({ status: 'OPEN', detectionId: null }),
    ]);

    // Final Verification Sprint fix (Performance Audit): previously
    // called gpsLocationRepository.latestForSession() once per active
    // session in a sequential loop -- a real N+1 query pattern on a
    // dashboard endpoint that's polled regularly. latestForSessions()
    // (new) gets every session's latest point in one query via
    // Postgres's DISTINCT ON, using the existing [sessionId, timestamp]
    // index rather than a new one.
    const latestLocations = await gpsLocationRepository.latestForSessions(activeOnlySessions.map((s) => s.id));
    const speeds = latestLocations.map((loc) => loc.speed).filter((speed) => speed != null);
    const averageSpeed = speeds.length > 0 ? speeds.reduce((a, b) => a + b, 0) / speeds.length : 0;

    const offlineCount = allActiveOrPaused.filter((s) => offlineSessions.has(s.id)).length;
    const gpsSignalStatus =
      allActiveOrPaused.length === 0 ? 'NO_ACTIVE_TRANSPORT' : offlineCount > 0 ? 'ISSUES_DETECTED' : 'ALL_ONLINE';

    // Sprint 6 ("Live Dashboard" — Vehicles Delayed, Vehicles Off Route).
    // Both read from state this same service already tracks in-process
    // for alert debouncing (deviatingSessions, alertedConditions) rather
    // than a new query — a session is "currently" delayed/off-route
    // exactly when that state says so, no separate source of truth needed.
    const activeIds = new Set(allActiveOrPaused.map((s) => s.id));
    const vehiclesOffRoute = [...deviatingSessions.keys()].filter((id) => activeIds.has(id)).length;
    const vehiclesDelayed = allActiveOrPaused.filter((s) => hasAlerted(s.id, 'delay')).length;

    return {
      vehiclesOnline: vehiclesInTransit,
      activeTransportCount: activeOnlySessions.length,
      averageSpeed: Math.round(averageSpeed * 10) / 10,
      gpsSignalStatus,
      offlineVehicleCount: offlineCount,
      vehiclesDelayed,
      vehiclesOffRoute,
      liveAlerts,
    };
  },
};

// --- Integration Sprint 2: server-driven GPS simulation ---
//
// Before this sprint, the simulated GPS "device" was a setInterval loop
// living inside TransportMonitoring.jsx -- tied to that specific React
// component's lifecycle, so navigating away from the page (to watch the
// same transport update live on the Dashboard or Security Command
// Center, for instance) silently killed it. That directly contradicted
// this sprint's own requirement ("must immediately display... without
// manual refresh" on *other* pages while a simulation neither of them is
// driving keeps running). Moving the loop here means the frontend is now
// a pure observer of real Socket.IO events for a transport it did not
// have to stay open to keep alive -- exactly the same events every
// prior sprint's UI already listens for (gps:update, transport:start/
// pause/end), since this code calls the exact same updateLocation()/
// stopTransport() methods above, just invoked directly (a plain function
// call, not a self-HTTP-request) instead of by an incoming request.
const activeSimulations = new Map(); // sessionId -> { intervalHandle, route, index, scenario, vehicleStopState }
const SIMULATION_TICK_MS = 3000; // matches the interval Sprint 6's frontend simulator always used
const VEHICLE_STOP_TICKS = 110; // ~5.5 minutes at 3s/tick -- deliberately just past STOPPED_ALERT_MINUTES (5 min) so "Vehicle Stop" reliably crosses the real threshold

function buildScenarioRoute(checkpoints, scenario) {
  return scenario === 'WRONG_ROUTE' ? buildWrongRoute(checkpoints) : buildInterpolatedRoute(checkpoints);
}

async function runSimulationTick(sessionId) {
  const state = activeSimulations.get(sessionId);
  if (!state) return; // already stopped/cleaned up between the timer firing and this running

  let session;
  try {
    session = await transportSessionRepository.findById(sessionId);
  } catch (err) {
    logger.error(`Auto-simulation: failed to read session ${sessionId}: ${err.message}`);
    return;
  }
  if (!session || session.status === 'COMPLETED' || session.status === 'CANCELLED') {
    stopAutoSimulation(sessionId);
    return;
  }
  if (session.status === 'PAUSED') {
    return; // skip this tick entirely: no advance, no update sent, matching resumeTransport()'s own comment on why this can't self-resume
  }

  const { route, scenario } = state;
  const index = state.index;

  // LOST_GPS: silently stop sending updates after a few real points --
  // no stopTransport() call. The session stays ACTIVE with no incoming
  // data, exactly like a real device dropout, so the existing stale-
  // session watcher (not this code) is what detects and alerts on it.
  if (scenario === 'LOST_GPS' && index >= 5) {
    logger.info(`Simulated GPS loss for session ${sessionId} (LOST_GPS scenario) — stopping auto-updates; the stale-session watcher will detect this`);
    stopAutoSimulation(sessionId);
    return;
  }

  if (index >= route.length) {
    // Reached the end of the route for real -- "finalize the route" by
    // completing the session the exact same way a manual Stop does.
    stopAutoSimulation(sessionId);
    try {
      await gpsService.stopTransport({ sessionId });
    } catch (err) {
      logger.error(`Auto-simulation: failed to auto-complete session ${sessionId}: ${err.message}`);
    }
    return;
  }

  const isHoldingStill = scenario === 'VEHICLE_STOP' && (state.vehicleStopState.stopping || index >= Math.floor(route.length * 0.4));
  const point = isHoldingStill ? route[Math.floor(route.length * 0.4)] : route[index];
  const progress = index / (route.length - 1);

  const batteryLevel =
    scenario === 'BATTERY_LOW'
      ? Math.max(5, Math.round(15 - progress * 10)) // starts at 15%, already below the 20% alert threshold
      : Math.round(100 - progress * 90); // drains toward the threshold over a normal trip, same as every other scenario

  try {
    await gpsService.updateLocation({
      sessionId,
      latitude: point.latitude,
      longitude: point.longitude,
      speed: isHoldingStill ? 0 : 15 + Math.random() * 25, // 15-40 km/h, a plausible transport-vehicle range
      accuracy: 5 + Math.random() * 10,
      heading: Math.random() * 360,
      batteryLevel,
    });
  } catch (err) {
    logger.error(`Auto-simulation update failed for session ${sessionId}: ${err.message}`);
  }

  if (isHoldingStill) {
    if (!state.vehicleStopState.stopping) {
      state.vehicleStopState.stopping = true;
      state.vehicleStopState.ticksRemaining = VEHICLE_STOP_TICKS;
    }
    state.vehicleStopState.ticksRemaining -= 1;
    if (state.vehicleStopState.ticksRemaining <= 0) {
      state.vehicleStopState.stopping = false;
      state.index = Math.floor(route.length * 0.4) + 1; // resume normal movement next tick
    }
    // while genuinely holding still, index does not otherwise advance
  } else {
    state.index = index + 1;
  }
}

function startAutoSimulation(session, scenario = 'NORMAL') {
  if (activeSimulations.has(session.id)) return; // already running for this session
  const checkpoints = session.route?.checkpoints?.length > 0 ? session.route.checkpoints : KNOWN_CHECKPOINTS;
  const route = buildScenarioRoute(checkpoints, scenario);
  const intervalHandle = setInterval(() => runSimulationTick(session.id), SIMULATION_TICK_MS);
  activeSimulations.set(session.id, { intervalHandle, route, index: 0, scenario, vehicleStopState: { stopping: false, ticksRemaining: 0 } });
  logger.info(`Auto-simulation started for session ${session.id} (scenario: ${scenario}, ${route.length} points)`);
}

function stopAutoSimulation(sessionId) {
  const state = activeSimulations.get(sessionId);
  if (state) {
    clearInterval(state.intervalHandle);
    activeSimulations.delete(sessionId);
  }
}

// Exposed so server.js can stop every running simulation on graceful
// shutdown, same reasoning as clearing the stale-session/camera-health
// watcher intervals there.
export function stopAllAutoSimulations() {
  for (const sessionId of activeSimulations.keys()) {
    stopAutoSimulation(sessionId);
  }
}

/**
 * Periodically checks every ACTIVE (not PAUSED — an intentional pause is
 * not a lost signal) session for a stale last-update timestamp and raises
 * a "GPS signal lost" alert + `vehicle:offline` broadcast — the one alert
 * condition from the Sprint 5 objective that genuinely can't be detected
 * *on* an update (a lost signal is defined by the *absence* of updates).
 * Started once from server.js, same lifecycle as the HTTP server itself.
 *
 * Also detects "Transport unexpectedly ended" (Sprint 5 extension,
 * ALERTS section): if a session stays offline far longer than the
 * initial signal-lost warning — UNEXPECTED_END_MINUTES, well beyond any
 * plausible temporary dead zone — it's auto-marked CANCELLED rather than
 * left ACTIVE forever with a vehicle that's never coming back online.
 * This is distinct from a normal stopTransport() call (which is always a
 * deliberate, successful COMPLETED ending) — this path only fires when
 * the session was abandoned, never properly stopped.
 *
 * Sprint 6 adds Late Arrival / delay detection here too — like signal
 * loss, "the expected arrival time has passed" is defined by the passage
 * of time, not by anything that happens *on* a GPS update, so it belongs
 * in this same periodic check rather than in updateLocation().
 */
const UNEXPECTED_END_MINUTES = 10;

export function startStaleSessionWatcher(intervalMs = 15000) {
  return setInterval(async () => {
    try {
      const activeSessions = await transportSessionRepository.listActiveOnly();
      for (const session of activeSessions) {
        // Related robustness fix found during this investigation: each
        // session's checks now isolated in their own try/catch. Before,
        // one exception anywhere in this loop body (e.g. a transient DB
        // error during one session's cancellation) would propagate out
        // of the whole for-loop, silently skipping every *other* active
        // session's deviation/delay/signal checks for that entire tick.
        try {
        const latest = await gpsLocationRepository.latestForSession(session.id);

        // --- Sprint 6: Delay Detection (independent of GPS staleness —
        // a vehicle can be sending perfectly healthy updates and still
        // be running late). ---
        if (session.route && !hasAlerted(session.id, 'delay')) {
          const expectedArrival = new Date(session.startTime).getTime() + session.route.estimatedDurationMinutes * 60000;
          const graceMs = LATE_ARRIVAL_GRACE_MINUTES * 60000;
          if (Date.now() > expectedArrival + graceMs) {
            markAlerted(session.id, 'delay');
            const delayMinutes = Math.round((Date.now() - expectedArrival) / 60000);
            getIo().emit('transport:delay', {
              sessionId: session.id,
              expectedArrival: new Date(expectedArrival).toISOString(),
              currentTime: new Date().toISOString(),
              delayMinutes,
            });
            await raiseAlert({
              session,
              severity: 'MEDIUM',
              category: 'LATE_ARRIVAL',
              title: `Late transport: ${session.vehicle.vehicleNumber}`,
              description: `Expected to arrive by ${new Date(expectedArrival).toISOString()}, now ${delayMinutes} minute(s) late (session ${session.id}).`,
            });
          }
        }

        if (!latest) continue;
        const secondsSince = (Date.now() - new Date(latest.timestamp).getTime()) / 1000;

        if (secondsSince >= SIGNAL_LOST_SECONDS && !offlineSessions.has(session.id)) {
          offlineSessions.add(session.id);
          getIo().emit('vehicle:offline', { sessionId: session.id, vehicleId: session.vehicleId });
          if (!hasAlerted(session.id, 'signal')) {
            markAlerted(session.id, 'signal');
            await raiseAlert({
              session,
              severity: 'HIGH',
              category: 'GPS_SIGNAL_LOST',
              title: `GPS signal lost: ${session.vehicle.vehicleNumber}`,
              description: `No location update received for over ${SIGNAL_LOST_SECONDS} seconds (session ${session.id}).`,
            });
          }
        }

        const minutesSince = secondsSince / 60;
        if (minutesSince >= UNEXPECTED_END_MINUTES && !hasAlerted(session.id, 'unexpected_end')) {
          markAlerted(session.id, 'unexpected_end');
          stopAutoSimulation(session.id);
          // Critical bug fix: same reasoning as stopTransport() -- these
          // two writes must succeed or fail together, or this path can
          // produce the exact same "vehicle stuck IN_TRANSIT forever"
          // bug through a second route.
          await prisma.$transaction(async (tx) => {
            await transportSessionRepository.update(session.id, { status: 'CANCELLED', endTime: new Date() }, tx);
            await vehicleRepository.update(session.vehicleId, { status: 'AVAILABLE' }, tx);
          });
          clearAlertState(session.id);
          // Sprint Integration-1: unlike stopTransport()'s DELIVERED,
          // nothing was actually delivered here -- an abandoned session
          // reverts the envelope to AT_REST, not stuck at IN_TRANSIT
          // forever.
          const revertedEnvelope = await envelopeRepository.update(session.envelopeId, { transportStatus: 'AT_REST' });
          await auditLogRepository.create({
            action: 'TRANSPORT_ENDED',
            actorId: session.officerId,
            metadata: { envelopeId: session.envelopeId, envelopeCode: session.envelope?.envelopeCode, sessionId: session.id, outcome: 'CANCELLED_SIGNAL_LOST' },
          });
          getIo().emit('transport:end', { session: { ...session, status: 'CANCELLED' } });
          getIo().emit('envelope:updated', { type: 'TRANSPORT_ENDED', envelope: revertedEnvelope });
          await raiseAlert({
            session,
            severity: 'CRITICAL',
            category: 'GPS_SIGNAL_LOST',
            title: `Transport unexpectedly ended: ${session.vehicle.vehicleNumber}`,
            description: `No location update for over ${UNEXPECTED_END_MINUTES} minutes — session auto-cancelled (session ${session.id}).`,
          });
          logger.warn(`Transport session auto-cancelled after prolonged signal loss: ${session.id}`);
        }
        } catch (sessionErr) {
          logger.error(`Stale session watcher: error processing session ${session.id}: ${sessionErr.message}`);
        }
      }
    } catch (err) {
      logger.error(`Stale session watcher error: ${err.message}`);
    }
  }, intervalMs);
}
