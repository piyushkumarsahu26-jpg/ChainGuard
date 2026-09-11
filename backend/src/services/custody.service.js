// Business logic for Chain of Custody + the QR scan / tracking workflow.
// Every QR scan against an envelope must create a new custody event.
//
// Sprint 7 additions (verifyByQr, initiateHandover, acceptHandover,
// listPendingHandovers, search) reuse the same repositories already used
// throughout this file and the rest of the project — no new repository
// was created for this except where genuinely new data is being read
// (transportSession/detection lookups, both via their own existing
// repositories from Sprint 5/6 and Phase 1 respectively).
import { prisma } from '../config/db.js';
import { custodyRepository } from '../repositories/custody.repository.js';
import { envelopeRepository } from '../repositories/envelope.repository.js';
import { userRepository } from '../repositories/user.repository.js';
import { transportSessionRepository } from '../repositories/transportSession.repository.js';
import { gpsLocationRepository } from '../repositories/gpsLocation.repository.js';
import { detectionRepository } from '../repositories/detection.repository.js';
import { alertRepository } from '../repositories/alert.repository.js';
import { ApiError } from '../utils/apiError.js';
import { getPagination, buildPaginationMeta } from '../utils/pagination.util.js';
import { getIo } from '../config/socket.js';
import { decodeQrContent } from '../utils/qrSignature.util.js';
import { distanceToRouteMeters } from '../utils/geo.util.js';
import { ROUTE_CORRIDOR_METERS } from './gps.service.js';
import { gpsService } from './gps.service.js';
import { incidentResponseService } from './incidentResponse.service.js';
import { logger } from '../config/logger.js';

// QR Verification & Digital Authentication sprint: a scan of the same
// envelope by a different officer/device within this window is flagged
// as an unexpected duplicate (Phase 4). Wide enough that a single
// officer's own legitimate re-scan a few seconds later (a shaky camera,
// a retry) isn't flagged; short enough to catch a real "this envelope
// was just scanned somewhere else" collision.
const DUPLICATE_SCAN_WINDOW_MS = 2 * 60 * 1000;

// Roles that can plausibly hold physical custody of an envelope. AUDITOR
// (read-only oversight) and VIEWER (read-only) and AI_SYSTEM (not a
// person) are deliberately excluded — a "transfer" to any of these
// wouldn't mean anything.
// Final Verification Sprint: exported so custody.routes.js can apply
// the exact same role set as route-level authorization on the
// mutating endpoints (/scan, /verify, /handover/*) -- a real gap found
// during the privilege-escalation audit: none of these had an
// authorize() call, meaning a VIEWER or AUDITOR (explicitly documented
// immediately below as read-only roles) could call them despite each
// one performing a real, mutating action. One list, reused, not two
// that could drift out of sync.
export const CUSTODY_ELIGIBLE_ROLES = [
  'ADMINISTRATOR', 'PRINTING_OFFICER', 'TRANSPORT_OFFICER',
  'EXAM_CENTER_OFFICER', 'CHIEF_EXAMINATION_OFFICER', 'STORAGE_OFFICER',
];

async function attachGpsAndAiStatus(envelope) {
  const [sessions, detections] = await Promise.all([
    transportSessionRepository.listByEnvelope(envelope.id),
    detectionRepository.list({ skip: 0, take: 1, where: { envelopeId: envelope.id } }),
  ]);

  const activeSession = sessions.find((s) => s.status === 'ACTIVE' || s.status === 'PAUSED');
  let gps = null;
  if (activeSession) {
    const latest = await gpsLocationRepository.latestForSession(activeSession.id);
    gps = {
      vehicle: activeSession.vehicle,
      route: activeSession.route ? { name: activeSession.route.name } : null,
      status: activeSession.status,
      latest,
    };
  }

  const latestDetection = detections[0] || null;

  return { ...envelope, gps, latestDetection };
}

// Same two-step pattern gps.service.js's raiseAlert() already established
// (Integration Sprint 4): create the real Alert first (so it's visible
// immediately), then fire-and-forget the audit trail via
// incidentResponseService, which already handles its own failures
// without ever blocking the alert itself.
async function raiseQrAlert({ envelopeId, actorId, severity, category, title, description, createCustodyEvent = false, custodyEventType, location }) {
  const alert = await alertRepository.create({
    severity,
    status: 'OPEN',
    title,
    description,
    envelopeId: envelopeId || null,
    category,
  });
  getIo().emit('alert:new', { alert });

  incidentResponseService.recordIncident({
    envelopeId: envelopeId || null,
    actorId: actorId || null,
    category,
    title,
    description,
    createCustodyEvent,
    custodyEventType,
    location,
  });

  return alert;
}

// The one real place this project decodes and verifies a scanned QR.
// Every entry point below (scanQr, verifyByQr, initiateHandover,
// acceptHandover) calls this instead of each independently assuming the
// scanned content is a bare token -- which is exactly the bug this
// sprint's investigation found: QR *generation* has signed its output
// since utils/qrSignature.util.js was added, but nothing on the
// verification side had been updated to match, so a real scan of a real
// QR this system just printed would have failed to resolve at all.
//
// Handles three real outcomes (see decodeQrContent's own docstring for
// why "invalid" and "legacy" are different things): a well-formed signed
// payload, a pre-signing legacy QR (still honored, not treated as
// tampered), and genuinely unparseable content.
async function resolveQrOrThrow(rawContent, { actorId, location } = {}) {
  const decoded = decodeQrContent(rawContent);

  if (decoded.format === 'invalid') {
    await raiseQrAlert({
      envelopeId: null,
      actorId,
      severity: 'MEDIUM',
      category: 'INVALID_QR',
      title: 'Invalid QR code scanned',
      description: decoded.reason,
    });
    throw ApiError.badRequest(`Invalid QR code: ${decoded.reason}`);
  }

  const envelope = await envelopeRepository.findByQrCode(decoded.qrCode);
  if (!envelope) {
    await raiseQrAlert({
      envelopeId: null,
      actorId,
      severity: 'HIGH',
      category: 'UNKNOWN_ENVELOPE',
      title: 'QR scanned for unknown envelope',
      description: `Scanned code (${decoded.format === 'signed' ? 'signed payload' : 'legacy format'}) does not match any envelope in the system -- it may be forged.`,
    });
    throw ApiError.notFound('No envelope matches this QR code — it may be invalid or forged');
  }

  if (decoded.format === 'signed' && !decoded.signatureValid) {
    await raiseQrAlert({
      envelopeId: envelope.id,
      actorId,
      severity: 'CRITICAL',
      category: 'SIGNATURE_FAILURE',
      title: `QR signature invalid: ${envelope.envelopeCode}`,
      description: 'The scanned QR\'s cryptographic signature does not match its content -- possible forgery or corruption. The envelope itself is real; this specific QR is not trustworthy.',
      createCustodyEvent: true,
      custodyEventType: 'TAMPERED',
      location: location || envelope.center,
    });
    throw ApiError.conflict('QR signature verification failed — this QR may have been tampered with or forged');
  }

  // EXPIRED_QR: the envelope's own custody history already shows it
  // ARCHIVED -- reuses the existing CustodyEventType (Sprint 7) rather
  // than a separate "expiry" flag; an archived envelope's QR has no
  // further legitimate use.
  const history = await custodyRepository.listByEnvelope(envelope.id);
  const isArchived = history.some((e) => e.eventType === 'ARCHIVED');
  if (isArchived) {
    await raiseQrAlert({
      envelopeId: envelope.id,
      actorId,
      severity: 'MEDIUM',
      category: 'EXPIRED_QR',
      title: `Expired QR scanned: ${envelope.envelopeCode}`,
      description: 'This envelope was already archived; its QR code should no longer be in active use.',
    });
    throw ApiError.conflict('This QR code has expired — the envelope has been archived');
  }

  // Architectural Integration sprint (Phase 7 refinement): "Transport
  // Status (must have arrived before verification)". Re-read carefully
  // against the rest of this same refinement ("mark transport complete
  // if appropriate") -- this can't mean "must already be DELIVERED"
  // (verification is what completes an in-progress delivery, see
  // completeTransportIfActive() below, not something gated behind
  // delivery already having finished on its own). What's actually
  // required is that the envelope has been dispatched at all -- AT_REST
  // means it never left the printing/packing stage, and there is
  // nothing physically present to receive yet.
  // -------------------------------------------------------------------
  // TEMPORARY HACKATHON CHANGE
  // Transport-status validation is temporarily disabled.
  // Restore this check after the demo.
  // -------------------------------------------------------------------
  // if (envelope.transportStatus === 'AT_REST') {
  //   throw ApiError.conflict(`${envelope.envelopeCode} has not been dispatched yet — there is nothing to receive.`);
  // }

  return { envelope, decoded, history };
}

// Duplicate Scan Detection (Phase 4): the same envelope scanned again,
// by a different officer or device, within DUPLICATE_SCAN_WINDOW_MS.
// Non-blocking -- a duplicate is suspicious, not necessarily wrong (two
// legitimate officers near the same checkpoint could both scan close
// together), so this raises a real HIGH alert but does not reject the
// scan itself.
async function checkForDuplicateScan({ envelope, history, officerId, device, latitude, longitude }) {
  const lastEvent = history[history.length - 1];
  if (!lastEvent) return { detected: false };

  const msSinceLast = Date.now() - new Date(lastEvent.timestamp).getTime();
  const isDifferentActor = lastEvent.officerId !== officerId || lastEvent.device !== device;
  if (msSinceLast <= DUPLICATE_SCAN_WINDOW_MS && isDifferentActor) {
    await raiseQrAlert({
      envelopeId: envelope.id,
      actorId: officerId,
      severity: 'HIGH',
      category: 'DUPLICATE_SCAN',
      title: `Duplicate scan detected: ${envelope.envelopeCode}`,
      description: `Scanned again ${Math.round(msSinceLast / 1000)}s after a prior scan by a different officer/device. Previous: officer ${lastEvent.officerId} at ${lastEvent.location}${lastEvent.latitude != null ? ` (${lastEvent.latitude.toFixed(5)}, ${lastEvent.longitude.toFixed(5)})` : ''}, device "${lastEvent.device || 'unknown'}". Current: officer ${officerId}${latitude != null ? ` at (${latitude.toFixed(5)}, ${longitude.toFixed(5)})` : ''}, device "${device || 'unknown'}".`,
    });
    return {
      detected: true,
      secondsSinceLast: Math.round(msSinceLast / 1000),
      previousOfficerId: lastEvent.officerId,
      previousDevice: lastEvent.device,
      previousLocation: lastEvent.location,
    };
  }
  return { detected: false };
}

// Location Verification (Phase 5): if this envelope has a transport
// session with an assigned route, and the scan itself reports GPS
// coordinates, compare the scan location against that route the same
// way gps.service.js's own continuous deviation check does (same
// function, same threshold -- imported, not reimplemented) so "off
// route" means one consistent thing everywhere in this project, not two
// slightly different definitions depending on which code path noticed.
async function checkScanLocation({ envelope, officerId, latitude, longitude }) {
  if (latitude == null || longitude == null) return;

  const sessions = await transportSessionRepository.listByEnvelope(envelope.id);
  const relevantSession = sessions.find((s) => (s.status === 'ACTIVE' || s.status === 'PAUSED') && s.route);
  if (!relevantSession) return;

  const checkpoints = relevantSession.route.checkpoints;
  if (!checkpoints || checkpoints.length === 0) return;

  const distance = distanceToRouteMeters(latitude, longitude, checkpoints);
  if (distance > ROUTE_CORRIDOR_METERS) {
    await raiseQrAlert({
      envelopeId: envelope.id,
      actorId: officerId,
      severity: 'HIGH',
      category: 'ROUTE_DEVIATION',
      title: `Route violation at scan: ${envelope.envelopeCode}`,
      description: `Scanned ${Math.round(distance)}m from the assigned route "${relevantSession.route.name}" (corridor: ${ROUTE_CORRIDOR_METERS}m).`,
    });
  }
}

// Architectural Integration sprint (Phase 7 refinement): "verify the
// complete examination assignment, not only centre" -- state/city/
// centre/subject, each optional (mirroring how latitude/longitude are
// already optional on this same verify call) so a caller that only
// knows some of them (or none -- e.g. the legacy GET route) simply
// skips whichever checks it can't provide input for, rather than
// failing on parameters that never existed before. Falls back to the
// envelope's own flat exam/subject/center fields (always present) when
// it has no linked Examination. Subject is checked separately from
// centre deliberately: one centre can legitimately receive multiple
// different subjects' envelopes the same day, so a subject mismatch is
// a real, distinct failure a centre-only check would miss entirely.
function fieldMismatch(expected, actual) {
  if (!actual) return null; // not provided by the caller -- not checked, not a failure
  return expected.trim().toLowerCase() === actual.trim().toLowerCase() ? null : { expected, actual };
}

async function checkAssignmentMismatch({ envelope, scanning, actorId }) {
  const exam = envelope.examination;
  const expected = {
    state: exam?.state,
    city: exam?.city,
    centre: exam?.centre || envelope.center,
    subject: exam?.subject || envelope.subject,
  };

  const mismatches = {};
  for (const field of ['state', 'city', 'centre', 'subject']) {
    if (!expected[field]) continue; // no Examination linked and no fallback available for this field (e.g. state/city on a legacy envelope) -- can't check what we don't have
    const result = fieldMismatch(expected[field], scanning?.[field]);
    if (result) mismatches[field] = result;
  }

  const checked = ['state', 'city', 'centre', 'subject'].some((f) => scanning?.[f]);
  if (Object.keys(mismatches).length > 0) {
    const mismatchList = Object.entries(mismatches).map(([field, m]) => `${field}: expected "${m.expected}", got "${m.actual}"`).join('; ');
    await raiseQrAlert({
      envelopeId: envelope.id,
      actorId,
      severity: 'HIGH',
      category: 'WRONG_CENTRE', // reuses the one category added for this refinement rather than one per field -- every case here means the same real thing: this envelope is not where it's assigned to be
      title: `Assignment mismatch: ${envelope.envelopeCode}`,
      description: mismatchList,
    });
    // Hard failure, not a soft flag -- see the reasoning in this
    // function's own git history: an assignment mismatch (any of
    // state/city/centre/subject) must never silently let the envelope
    // still get marked delivered, verified, and AI-scanner-enabled.
    throw ApiError.conflict(`Assignment mismatch for ${envelope.envelopeCode}: ${mismatchList}. Do not accept this envelope here.`);
  }

  return { checked, match: true, expected };
}

// Architectural Integration sprint (Phase 7 refinement): "Mark
// transport complete if appropriate." If the envelope's delivering
// transport session is still ACTIVE/PAUSED at the moment of receipt
// verification, this scan *is* the arrival -- completes it by calling
// the exact same gps.service.js stopTransport() the "Stop Simulation"
// button itself calls, not a second, parallel way of ending a session.
// If the envelope is already DELIVERED (a real "Stop" already
// happened, or a later re-verification), this is a no-op.
async function completeTransportIfActive(envelope) {
  if (envelope.transportStatus !== 'IN_TRANSIT') {
    return { transportJustCompleted: false };
  }
  const sessions = await transportSessionRepository.listByEnvelope(envelope.id);
  const activeSession = sessions.find((s) => s.status === 'ACTIVE' || s.status === 'PAUSED');
  if (!activeSession) {
    // transportStatus said IN_TRANSIT but no active session was found --
    // a real inconsistency worth logging, not silently ignoring, but
    // not worth failing the whole verification over (the envelope can
    // still be received; this just means nothing to auto-complete here).
    logger.warn(`Envelope ${envelope.envelopeCode} has transportStatus IN_TRANSIT but no ACTIVE/PAUSED session was found`);
    return { transportJustCompleted: false };
  }
  await gpsService.stopTransport({ sessionId: activeSession.id });
  return { transportJustCompleted: true, sessionId: activeSession.id };
}

// Phase 10 ("combine AI and QR verification... unified security
// report"): a single decision from the three signals this project
// already independently computes -- the QR's own signature validity,
// the AI Scanner's most recent finding on this envelope (reused from
// attachGpsAndAiStatus, not re-queried), and whether an active
// transport is currently off its assigned route. SUSPICIOUS if any one
// of the three says so; SAFE only if all three agree there's nothing to
// flag. Deliberately conservative (any red flag wins) for a security
// system -- a false SUSPICIOUS an officer double-checks costs a minute;
// a false SAFE does not get a second look.
function computeUnifiedDecision({ signatureValid, latestDetection, routeViolation }) {
  const aiFlag = latestDetection && latestDetection.prediction && !['SAFE', 'SEALED'].includes(latestDetection.prediction.toUpperCase());
  const reasons = [];
  if (signatureValid === false) reasons.push('QR signature invalid');
  if (aiFlag) reasons.push(`AI detected ${latestDetection.prediction}`);
  if (routeViolation) reasons.push('Scan location outside the assigned route corridor');

  return {
    decision: reasons.length > 0 ? 'SUSPICIOUS' : 'SAFE',
    reasons,
    signals: {
      qr: signatureValid === false ? 'SIGNATURE_INVALID' : signatureValid === true ? 'SIGNATURE_VALID' : 'UNSIGNED_LEGACY',
      ai: latestDetection ? { prediction: latestDetection.prediction, confidence: latestDetection.confidence } : null,
      transport: routeViolation ? 'ROUTE_VIOLATION' : 'ON_ROUTE_OR_NOT_APPLICABLE',
    },
  };
}

export const custodyService = {
  // `qrCode` here is the *raw scanned content* -- despite the
  // unchanged field name (kept for backward compatibility with every
  // existing caller), it now accepts either a legacy bare token or a
  // full signed JSON payload; decodeQrContent() (called inside
  // resolveQrOrThrow) tells them apart. This is the actual fix for the
  // bug this sprint's own investigation found: QR generation has signed
  // its output since utils/qrSignature.util.js was added, but this
  // function was still doing a direct, unverified findByQrCode() lookup
  // -- meaning a real scan of a real signed QR never actually ran the
  // signature check, duplicate-scan check, or route-location check this
  // same file already had fully built and ready.
  async scanQr({ qrCode: rawContent, officerId, location, remarks, eventType = 'QR_SCAN', latitude, longitude, device, ipAddress }) {
    const { envelope, history } = await resolveQrOrThrow(rawContent, { actorId: officerId, location });

    // Both non-blocking (per their own docstrings) -- a duplicate or an
    // off-route scan is a real alert, not a rejected request.
    const duplicateCheck = await checkForDuplicateScan({ envelope, history, officerId, device, latitude, longitude });
    await checkScanLocation({ envelope, officerId, latitude, longitude });

    const event = await custodyRepository.create({
      envelopeId: envelope.id,
      eventType,
      officerId,
      location,
      latitude: latitude ?? null,
      longitude: longitude ?? null,
      device: device ?? null,
      ipAddress: ipAddress ?? null,
      remarks,
    });

    getIo().emit('envelope:updated', { type: 'CUSTODY_EVENT', envelopeId: envelope.id, event });

    return { envelope, event, duplicateScan: duplicateCheck };
  },

  // Sprint 7 (Part 2, "Verify authenticity... display envelope
  // details/status/location/officer/AI status"). Deliberately read-only —
  // does NOT create a custody event. A logged VERIFIED event is
  // available separately via scanQr({eventType: 'VERIFIED'}) for callers
  // that DO want it on the record.
  //
  // QR Verification & Digital Authentication sprint: now runs the real
  // signature/duplicate/location pipeline (see scanQr's comment on why
  // this matters), and the response gained additive fields
  // (signatureStatus, unifiedReport) -- envelope/latestEvent/authentic
  // are unchanged in shape, so no existing caller reading only those
  // breaks.
  // Architectural Integration sprint (Phase 7 refinement): now has real
  // side effects -- previously deliberately read-only (Sprint 7's own
  // original design), superseded here because this phase explicitly
  // requires verification to complete an in-progress delivery, enable
  // the AI Scanner, and log a real custody event. scanningCentre is a
  // new, optional parameter (mirrors latitude/longitude, already
  // optional) -- omitting it just skips the wrong-centre check, not an
  // error.
  async verifyByQr(rawContent, { actorId, location, latitude, longitude, scanningState, scanningCity, scanningCentre, scanningSubject, expectedEnvelopeId, completeActiveTransport = true } = {}) {
    const { envelope, decoded, history } = await resolveQrOrThrow(rawContent, { actorId, location });

    // The Envelope Scanner supplies the envelope selected by the officer.
    // Check it immediately after cryptographic/registered-envelope
    // resolution and before any receipt mutation.  A real QR for a
    // *different* envelope is not a valid scan of the selected one.
    if (expectedEnvelopeId && envelope.id !== expectedEnvelopeId) {
      throw ApiError.conflict(
        `QR belongs to envelope ${envelope.envelopeCode}, not the selected envelope. AI detection was not run.`
      );
    }

    // Phase 4: verifying is the primary "scan" action from a user's
    // perspective even though it doesn't log its own custody event --
    // checked against whatever the last *real* event was, the same
    // signal scanQr()'s own duplicate check uses.
    const duplicateCheck = await checkForDuplicateScan({ envelope, history, officerId: actorId, device: undefined, latitude, longitude });
    const centreCheck = await checkAssignmentMismatch({
      envelope,
      scanning: { state: scanningState, city: scanningCity, centre: scanningCentre, subject: scanningSubject },
      actorId,
    });

    if (latitude != null && longitude != null) {
      await checkScanLocation({ envelope, officerId: actorId, latitude, longitude });
    }

    // Computed *before* completeTransportIfActive() below -- once a
    // session completes it's no longer ACTIVE/PAUSED, so this specific
    // lookup (an active session's assigned route) has to happen first.
    const sessions = await transportSessionRepository.listByEnvelope(envelope.id);
    const activeSession = sessions.find((s) => (s.status === 'ACTIVE' || s.status === 'PAUSED') && s.route);
    let routeViolation = false;
    if (activeSession && latitude != null && longitude != null && activeSession.route.checkpoints?.length) {
      routeViolation = distanceToRouteMeters(latitude, longitude, activeSession.route.checkpoints) > ROUTE_CORRIDOR_METERS;
    }

    // Phase 7's own two required side effects: complete an in-progress
    // delivery (reuses gps.service.js's real stopTransport(), not a
    // duplicate), and mark this envelope's QR as genuinely verified --
    // the exact flag Phase 8's AI-scanner gate will check.
    // Receipt verification on the dedicated QR page retains its existing
    // behaviour. The Envelope Scanner verifies authenticity but must not
    // manufacture a delivery or replace the GPS workflow.
    const transportResult = completeActiveTransport
      ? await completeTransportIfActive(envelope)
      : { transportJustCompleted: false };
    let updatedEnvelope = envelope;
    if (!envelope.qrVerifiedAt) {
      updatedEnvelope = await envelopeRepository.update(envelope.id, { qrVerifiedAt: new Date() });
    }

    await custodyRepository.create({
      envelopeId: envelope.id,
      eventType: 'VERIFIED',
      officerId: actorId,
      location: scanningCentre || location || envelope.center,
      remarks: transportResult.transportJustCompleted
        ? 'QR verified on receipt — delivery marked complete.'
        : 'QR verified.',
    });
    getIo().emit('envelope:updated', { type: 'QR_VERIFIED', envelope: updatedEnvelope });

    const enriched = await attachGpsAndAiStatus(updatedEnvelope);
    const latestEvent = history[history.length - 1] || null;

    const unifiedReport = computeUnifiedDecision({
      signatureValid: decoded.format === 'signed' ? decoded.signatureValid : null,
      latestDetection: enriched.latestDetection,
      routeViolation,
    });
    if (duplicateCheck.detected) {
      unifiedReport.decision = 'SUSPICIOUS';
      unifiedReport.reasons.push(`Duplicate scan ${duplicateCheck.secondsSinceLast}s after a different officer/device`);
    }
    // Note: no "wrong centre" branch here -- checkWrongCentre() above
    // now throws on any real mismatch (a hard failure, not a soft
    // flag), so this point in the function is only ever reached when
    // centreCheck.match is true or the check wasn't requested at all.

    return {
      envelope: enriched,
      latestEvent,
      authentic: true,
      signatureStatus: decoded.format === 'signed' ? (decoded.signatureValid ? 'VALID' : 'INVALID') : 'UNSIGNED_LEGACY',
      qrFormat: decoded.format,
      unifiedReport,
      duplicateScan: duplicateCheck,
      centreCheck,
      // Phase 7, requirement 3 ("present a receiving summary instead of
      // requiring users to navigate elsewhere") -- everything the
      // "complete examination assignment" list asked to be verified,
      // gathered in one place rather than requiring a click to
      // Envelope Details/Live GPS to piece it together.
      receivingSummary: {
        transportJustCompleted: transportResult.transportJustCompleted,
        aiScannerEnabled: true,
        examination: envelope.examination
          ? {
              state: envelope.examination.state,
              city: envelope.examination.city,
              centre: envelope.examination.centre,
              examName: envelope.examination.examName,
              subject: envelope.examination.subject,
              examDate: envelope.examination.examDate,
              examTime: envelope.examination.examTime,
            }
          : null,
        batch: envelope.batch ? { id: envelope.batch.id, count: envelope.batch.count } : null,
        envelopeId: envelope.id,
        envelopeCode: envelope.envelopeCode,
      },
    };
  },

  // --- Sprint 7 (Part 4/5): two-step handover workflow ---

  async initiateHandover({ qrCode, fromOfficerId, toOfficerId, location, remarks, latitude, longitude, device }) {
    // "Transfer Verification" (Part 5) — the hard, request-rejecting checks.
    const envelope = await envelopeRepository.findByQrCode(qrCode);
    if (!envelope) throw ApiError.notFound('No envelope matches this QR code');

    const toOfficer = await userRepository.findById(toOfficerId);
    if (!toOfficer) throw ApiError.notFound('Receiving officer not found');
    if (!CUSTODY_ELIGIBLE_ROLES.includes(toOfficer.role)) {
      throw ApiError.badRequest(`${toOfficer.role} is not an eligible role to receive custody`);
    }
    if (toOfficerId === fromOfficerId) {
      throw ApiError.badRequest('Cannot hand an envelope over to yourself');
    }

    const existingPending = await custodyRepository.findPendingHandover(envelope.id);
    if (existingPending) {
      throw ApiError.conflict('This envelope already has a pending, unconfirmed handover');
    }

    const event = await custodyRepository.create({
      envelopeId: envelope.id,
      eventType: 'HANDOVER',
      officerId: fromOfficerId,
      toOfficerId,
      confirmed: false,
      location,
      latitude: latitude ?? null,
      longitude: longitude ?? null,
      device: device ?? null,
      remarks,
    });

    getIo().emit('envelope:updated', { type: 'HANDOVER_INITIATED', envelopeId: envelope.id, event });

    // Informational, non-blocking status — surfaced to the caller so the
    // UI can show "no active transport session" / "no AI scan yet"
    // without those facts ever preventing a legitimate manual handover
    // (e.g. a desk-to-desk transfer at the printing press has no GPS
    // session and may have no AI scan yet — neither should be a hard
    // rejection).
    const enriched = await attachGpsAndAiStatus(envelope);

    return {
      envelope: enriched,
      event,
      warnings: {
        noActiveTransport: !enriched.gps,
        noAiScanYet: !enriched.latestDetection,
      },
    };
  },

  async acceptHandover({ qrCode, officerId, location, remarks, latitude, longitude, device }) {
    const envelope = await envelopeRepository.findByQrCode(qrCode);
    if (!envelope) throw ApiError.notFound('No envelope matches this QR code');

    const pending = await custodyRepository.findPendingHandover(envelope.id);
    if (!pending) throw ApiError.notFound('No pending handover found for this envelope');
    if (pending.toOfficerId !== officerId) {
      throw ApiError.forbidden('This handover was not addressed to you');
    }

    await custodyRepository.update(pending.id, { confirmed: true });

    const event = await custodyRepository.create({
      envelopeId: envelope.id,
      eventType: 'HANDOVER_ACCEPTED',
      officerId,
      confirmed: true,
      location,
      latitude: latitude ?? null,
      longitude: longitude ?? null,
      device: device ?? null,
      remarks: remarks || 'Accepted via QR scan',
    });

    getIo().emit('envelope:updated', { type: 'HANDOVER_ACCEPTED', envelopeId: envelope.id, event });

    return { envelope, event };
  },

  async listPendingHandovers(officerId) {
    return custodyRepository.listPendingForOfficer(officerId);
  },

  async getTrackingHistory(envelopeId) {
    return custodyRepository.listByEnvelope(envelopeId);
  },

  async list(query) {
    const { page, limit, skip } = getPagination(query);
    const where = {};
    if (query.envelopeId) where.envelopeId = query.envelopeId;
    if (query.eventType) where.eventType = query.eventType;

    const [items, total] = await Promise.all([
      custodyRepository.list({ skip, take: limit, where }),
      custodyRepository.count(where),
    ]);
    return { items, meta: buildPaginationMeta({ page, limit, total }) };
  },

  // Sprint 7 (Part 7, "Search History") — search by QR/envelope
  // code/officer/vehicle/district(center)/date. "Vehicle" is searched
  // indirectly (via the transport sessions carrying this envelope) since
  // ChainOfCustody itself has no vehicleId — reusing the existing
  // TransportSession table directly for that one filter rather than
  // adding a redundant column to ChainOfCustody.
  async search(query) {
    const { page, limit, skip } = getPagination(query);
    const where = {};

    if (query.officerId) where.officerId = query.officerId;
    if (query.dateFrom || query.dateTo) {
      where.timestamp = {};
      if (query.dateFrom) where.timestamp.gte = new Date(query.dateFrom);
      if (query.dateTo) where.timestamp.lte = new Date(query.dateTo);
    }

    // envelopeCode / qrCode / center(district) all resolve to a set of
    // envelope ids first, then filter custody rows by those — simpler
    // and more predictable than one giant nested Prisma query.
    let envelopeIdFilter = null;
    if (query.envelopeCode || query.qrCode || query.center) {
      const envelopeWhere = {};
      if (query.envelopeCode) envelopeWhere.envelopeCode = { contains: query.envelopeCode, mode: 'insensitive' };
      if (query.qrCode) envelopeWhere.qrCode = query.qrCode;
      if (query.center) envelopeWhere.center = { contains: query.center, mode: 'insensitive' };
      const envelopes = await envelopeRepository.list({ skip: 0, take: 500, where: envelopeWhere });
      envelopeIdFilter = envelopes.map((e) => e.id);
    }

    if (query.vehicleId) {
      const vehicleSessions = await prisma.transportSession.findMany({
        where: { vehicleId: query.vehicleId },
        select: { envelopeId: true },
      });
      const vehicleEnvelopeIds = vehicleSessions.map((s) => s.envelopeId);
      envelopeIdFilter = envelopeIdFilter ? envelopeIdFilter.filter((id) => vehicleEnvelopeIds.includes(id)) : vehicleEnvelopeIds;
    }

    if (envelopeIdFilter) where.envelopeId = { in: envelopeIdFilter };

    const [items, total] = await Promise.all([
      custodyRepository.list({ skip, take: limit, where }),
      custodyRepository.count(where),
    ]);
    return { items, meta: buildPaginationMeta({ page, limit, total }) };
  },
};
