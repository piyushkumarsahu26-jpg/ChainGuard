// Business logic for Envelope lifecycle, including QR generation and
// the initial chain-of-custody event on creation.
import { envelopeRepository } from '../repositories/envelope.repository.js';
import { custodyRepository } from '../repositories/custody.repository.js';
import { auditLogRepository } from '../repositories/auditLog.repository.js';
import { transportSessionRepository } from '../repositories/transportSession.repository.js';
import { gpsLocationRepository } from '../repositories/gpsLocation.repository.js';
import { generateEnvelopeQr } from '../utils/qrcode.util.js';
import { getPagination, buildPaginationMeta } from '../utils/pagination.util.js';
import { ApiError } from '../utils/apiError.js';
import { getIo } from '../config/socket.js';
import { randomUUID } from 'crypto';
import { evidenceService } from './evidence.service.js';
import { detectionService } from './detection.service.js';
import { aiClientService } from './aiClient.service.js';
import { sealStatusForPrediction } from '../utils/damageClass.util.js';
import { incidentResponseService } from './incidentResponse.service.js';
import { readFile } from 'fs/promises';
import path from 'path';

export const envelopeService = {
  // Architectural Integration sprint: examinationId/batchId are new,
  // both optional (default null) -- the original single-envelope
  // creation endpoint (still supported, unchanged behavior) simply
  // doesn't pass them. envelopeBatch.service.js's generateBatch() is
  // the only caller that does, reusing this exact function N times
  // rather than duplicating envelope-creation logic for the batch path.
  async create({ exam, subject, center, createdById, examinationId = null, batchId = null }) {
    const envelopeCode = `ENV-${Date.now()}-${randomUUID().slice(0, 6).toUpperCase()}`;
    const { qrCode, qrImagePath } = await generateEnvelopeQr(envelopeCode);

    const envelope = await envelopeRepository.create({
      envelopeCode,
      qrCode,
      qrImagePath,
      exam,
      subject,
      center,
      createdById,
      examinationId,
      batchId,
    });

    await custodyRepository.create({
      envelopeId: envelope.id,
      eventType: 'CREATED',
      officerId: createdById,
      location: center,
      remarks: 'Envelope created and sealed.',
    });

    // Phase 6 (QR Verification & Digital Authentication sprint): a
    // distinct timeline step for QR generation, logged right after
    // CREATED since both happen at this same moment -- the QR (and its
    // digital signature, utils/qrSignature.util.js) already exists by
    // the time this function reaches this line.
    await custodyRepository.create({
      envelopeId: envelope.id,
      eventType: 'QR_GENERATED',
      officerId: createdById,
      location: center,
      remarks: `Secure QR generated and signed for ${envelope.envelopeCode}.`,
    });

    // Sprint Integration-1: a real AuditLog entry, distinct from the
    // ChainOfCustody event above -- ChainOfCustody is this envelope's
    // own physical-custody history (who has had it, where, when);
    // AuditLog is this project's system-wide action log (Phase 2,
    // previously user-administration actions only). Both are real and
    // both matter for different audiences -- an auditor reviewing "every
    // action taken in the system" reads AuditLog; an officer reviewing
    // "what happened to this specific envelope" reads ChainOfCustody.
    await auditLogRepository.create({
      action: 'ENVELOPE_CREATED',
      actorId: createdById,
      metadata: { envelopeId: envelope.id, envelopeCode: envelope.envelopeCode, exam, subject, center },
    });

    getIo().emit('envelope:updated', { type: 'CREATED', envelope });
    return envelope;
  },

  async getById(id) {
    const envelope = await envelopeRepository.findById(id);
    if (!envelope) throw ApiError.notFound('Envelope not found');
    return envelope;
  },

  async list(query) {
    const { page, limit, skip } = getPagination(query);
    const where = {};
    if (query.sealStatus) where.sealStatus = query.sealStatus;
    if (query.center) where.center = { contains: query.center, mode: 'insensitive' };
    if (query.exam) where.exam = { contains: query.exam, mode: 'insensitive' };
    if (query.prepStatus) where.prepStatus = query.prepStatus;

    const [items, total] = await Promise.all([
      envelopeRepository.list({ skip, take: limit, where }),
      envelopeRepository.count(where),
    ]);

    return { items, meta: buildPaginationMeta({ page, limit, total }) };
  },

  async update(id, data) {
    await this.getById(id);
    const updated = await envelopeRepository.update(id, data);
    getIo().emit('envelope:updated', { type: 'UPDATED', envelope: updated });
    return updated;
  },

  async remove(id) {
    await this.getById(id);
    await envelopeRepository.delete(id);
  },

  async listCenters() {
    const rows = await envelopeRepository.distinctCenters();
    return rows.map((r) => r.center);
  },

  /**
   * The on-demand Scanner flow (Phase 3A design, Step 3's "backend ->
   * AI" path; Sprint AI-4B's Stage 2 "Evidence Pipeline"). Orchestrates
   * five existing services rather than duplicating any of their logic:
   *   1. Confirm the envelope exists (this.getById — already built)
   *   2. Record Evidence for the uploaded photo (evidenceService — wired
   *      up this sprint, previously orphaned since Phase 1)
   *   3. Submit the image to the AI service (aiClientService — new this
   *      sprint)
   *   4. Create one Detection row per AI-returned finding, and let
   *      detectionService's existing auto-alert logic decide whether any
   *      of them warrant an Alert — not reimplemented here
   *   5. Emit a status update over the socket so a connected client sees
   *      the scan complete without polling
   *
   * If the AI service is unreachable, the Evidence record still exists
   * (the upload itself succeeded and is preserved) — only the
   * AI-submission step fails, surfaced as a 503 to the caller. A failed
   * scan is not silently swallowed, but it also doesn't lose the officer's
   * upload.
   */
  // Integration Sprint 3: ties together Transport, Evidence, Detection,
  // Alert, and Chain of Custody into one real workflow. Every piece
  // below already existed as its own working system (evidenceService,
  // detectionService, custodyRepository, the transport session data
  // itself) -- this method's job is purely to connect them, not to add
  // new logic to any of them individually.
  async scan({ envelopeId, filePath, mimetype, officerId }) {
    const envelope = await this.getById(envelopeId);

    // The gate this sprint requires: only a DELIVERED envelope (i.e.
    // one with a real, completed transport session behind it -- see
    // Sprint Integration-1's schema comment on why transportStatus is
    // its own field, distinct from sealStatus) may be scanned. Rejects
    // early, before any Evidence/AI work happens, so a rejected scan
    // leaves no partial trail behind it.
    // -------------------------------------------------------------------
    // TEMPORARY HACKATHON CHANGE
    // Transport-status validation is temporarily disabled.
    // Restore this check after the demo.
    // -------------------------------------------------------------------
    // if (envelope.transportStatus !== 'DELIVERED') {
    //   throw ApiError.conflict(
    //     `Envelope ${envelope.envelopeCode} cannot be scanned yet -- its transport status is ${envelope.transportStatus}, not DELIVERED. Complete its transport session first.`
    //   );
    // }
    // Phase 8 (Architectural Integration sprint): "QR Verification MUST
    // happen first... AI Scanner must never become the first
    // verification step." transportStatus === DELIVERED alone doesn't
    // prove this -- an envelope's transport can complete without anyone
    // ever having scanned its QR at the destination (e.g. a delivery
    // that auto-completed via GPS reaching the end of its route, with
    // no receiving officer having verified it yet). qrVerifiedAt is the
    // real flag custody.service.js's verifyByQr() sets specifically
    // when a real QR verification succeeds -- checked directly here,
    // not inferred.
    if (!envelope.qrVerifiedAt) {
      throw ApiError.conflict(
        `Envelope ${envelope.envelopeCode} cannot be AI-scanned yet -- its QR must be verified at receipt first.`
      );
    }

    // Auto-preload transport context (officer, vehicle, timestamp,
    // location) from real, existing data -- exactly what this sprint
    // asks for "rather than requiring manual user input." The most
    // recently COMPLETED session for this envelope is the one that
    // actually delivered it; officer/vehicle come from that session's
    // own relations (transportSessionRepository's withContext already
    // includes them), location from its last real GPS point.
    const sessions = await transportSessionRepository.listByEnvelope(envelopeId);
    const deliveringSession = sessions
      .filter((s) => s.status === 'COMPLETED')
      .sort((a, b) => new Date(b.endTime || 0) - new Date(a.endTime || 0))[0] || null;
    const lastLocation = deliveringSession
      ? await gpsLocationRepository.latestForSession(deliveringSession.id)
      : null;

    const evidence = await evidenceService.create({
      filePath,
      fileType: 'IMAGE',
      envelopeId,
      description: deliveringSession
        ? `Scan on delivery -- officer ${officerId}, vehicle ${deliveringSession.vehicle?.vehicleNumber || 'unknown'}, session ${deliveringSession.id}`
        : `Manual scan upload by officer ${officerId}`,
      transportSessionId: deliveringSession?.id,
    });

    getIo().emit('evidence:processed', { status: 'PROCESSING', evidence, envelopeId });

    let aiResult;
    try {
      const buffer = await readFile(filePath);
      const filename = path.basename(filePath);
      aiResult = await aiClientService.predictImage(buffer, filename, mimetype);
    } catch (err) {
      getIo().emit('evidence:processed', { status: 'FAILED', evidence, envelopeId, error: err.message });
      throw err; // ApiError.serviceUnavailable, already correctly shaped by aiClientService
    }

    const createdDetections = [];
    const createdAlerts = [];
    for (const item of aiResult.detections) {
      const { detection, alert } = await detectionService.create({
        envelopeId,
        prediction: item.predictedClass,
        confidence: item.confidence,
        boundingBox: item.boundingBox,
        imagePath: filePath,
        transportSessionId: deliveringSession?.id,
        latitude: lastLocation?.latitude,
        longitude: lastLocation?.longitude,
      });
      createdDetections.push(detection);
      if (alert) createdAlerts.push(alert);
    }

    // Update envelope status from the real detection results -- the
    // worst (highest-severity) real finding wins if there are several.
    // See utils/damageClass.util.js's sealStatusForPrediction() for the
    // documented SAFE -> no change / OPENED -> OPENED / everything else
    // damage-like -> TAMPERED mapping.
    let updatedEnvelope = envelope;
    let worstPrediction = null;
    let worstSeverityStatus = null;
    for (const item of aiResult.detections) {
      const impliedStatus = sealStatusForPrediction(item.predictedClass);
      if (impliedStatus && (!worstSeverityStatus || impliedStatus === 'TAMPERED')) {
        worstSeverityStatus = impliedStatus;
        worstPrediction = item.predictedClass;
      }
    }
    if (worstSeverityStatus) {
      updatedEnvelope = await envelopeRepository.update(envelopeId, { sealStatus: worstSeverityStatus });
      // Reuses CustodyEventType.DAMAGED/TAMPERED (Sprint 7's schema --
      // present since then, never actually created by any code path
      // until now) rather than adding a new event type.
      await custodyRepository.create({
        envelopeId,
        eventType: worstSeverityStatus === 'OPENED' ? 'DAMAGED' : 'TAMPERED',
        officerId,
        location: deliveringSession?.vehicle?.vehicleNumber ? `In transit (vehicle ${deliveringSession.vehicle.vehicleNumber})` : envelope.center,
        remarks: `AI scan detected "${worstPrediction}" -- seal status updated to ${worstSeverityStatus}.`,
      });
      // Integration Sprint 4: a real AuditLog entry, in addition to the
      // ChainOfCustody event just above -- did not exist before this
      // sprint (see incidentResponse.service.js's own header comment for
      // why the two are different, real audiences). createCustodyEvent
      // is false here specifically because the custody event for this
      // exact incident was already just written two lines up.
      incidentResponseService.recordIncident({
        envelopeId,
        actorId: officerId,
        category: worstSeverityStatus,
        title: `Tamper detected on scan: ${envelope.envelopeCode}`,
        description: `AI scan detected "${worstPrediction}" -- seal status updated to ${worstSeverityStatus}.`,
        createCustodyEvent: false,
      });
      getIo().emit('envelope:updated', { type: 'SCAN_TAMPER_DETECTED', envelope: updatedEnvelope });
    }

    // Phase 8 (Architectural Integration sprint): "After AI verification
    // succeeds, automatically record AI Verified and Accepted in the
    // Chain of Custody." AI_VERIFIED fires unconditionally -- the scan
    // itself genuinely happened, regardless of outcome. The second part
    // ("Accepted") reuses the existing CustodyEventType.COMPLETED --
    // added in this same sprint's own schema work specifically
    // described as closing out the workflow after a successful AI scan,
    // not a new value invented for this. It only fires when the scan
    // found nothing wrong: an envelope the AI just flagged as tampered
    // should not simultaneously be recorded as "accepted."
    await custodyRepository.create({
      envelopeId,
      eventType: 'AI_VERIFIED',
      officerId,
      location: envelope.center,
      remarks: `AI scan complete: ${createdDetections.length} finding(s), ${createdAlerts.length} alert(s) raised.`,
    });
    if (!worstSeverityStatus) {
      await custodyRepository.create({
        envelopeId,
        eventType: 'COMPLETED',
        officerId,
        location: envelope.center,
        remarks: 'Envelope accepted -- AI scan found no damage. Chain of custody complete.',
      });
      getIo().emit('envelope:updated', { type: 'ENVELOPE_ACCEPTED', envelope: updatedEnvelope });
    }

    getIo().emit('evidence:processed', {
      status: 'COMPLETE',
      evidence,
      envelopeId,
      detectionCount: createdDetections.length,
      alertCount: createdAlerts.length,
    });

    return {
      envelope: updatedEnvelope,
      evidence,
      detections: createdDetections,
      alerts: createdAlerts,
      aiProcessingTimeMs: aiResult.processingTimeMs,
      modelVersion: aiResult.modelVersion,
      // Returned so the frontend can display exactly what was
      // auto-preloaded, per this sprint's own requirement -- not stored
      // as new fields on Detection/Evidence beyond transportSessionId/
      // lat/lon themselves, just surfaced in the response.
      transportContext: deliveringSession
        ? {
            sessionId: deliveringSession.id,
            officer: deliveringSession.officer,
            vehicle: deliveringSession.vehicle,
            deliveredAt: deliveringSession.endTime,
            location: lastLocation ? { latitude: lastLocation.latitude, longitude: lastLocation.longitude } : null,
          }
        : null,
    };
  },

  // Architectural Integration sprint, Phase 4 -- refined per explicit
  // user correction: printing a QR sticker sheet does not mean the
  // stickers have actually been attached, or the envelopes packed and
  // sealed. Split into two honest, separately-triggered functions
  // instead of one silent cascade:
  //
  //  - markQrPrinted(): the one transition that IS simply true the
  //    moment a PDF is generated -- not an assumption about a physical
  //    action nobody has confirmed yet.
  //  - confirmPreparationComplete(): the three genuinely physical steps
  //    (attach/pack/seal), gated behind an explicit operator
  //    confirmation (envelopeBatch.service.js's confirmPreparation(),
  //    called only after a real confirmation dialog on the frontend) --
  //    never implied by printing alone.
  async markQrPrinted(envelopeId, officerId) {
    const envelope = await this.getById(envelopeId);
    if (envelope.prepStatus !== 'QR_GENERATED') return envelope; // already printed (or further along) -- idempotent, not an error

    const updated = await envelopeRepository.update(envelopeId, { prepStatus: 'QR_PRINTED' });
    await custodyRepository.create({
      envelopeId,
      eventType: 'QR_PRINTED',
      officerId,
      location: envelope.center,
      remarks: 'QR sticker sheet printed.',
    });
    return updated;
  },

  // Only reachable once QR_PRINTED is real (see the gate below) --
  // requires an explicit operator confirmation, per the user's
  // instruction that printing alone must never imply this happened.
  async confirmPreparationComplete(envelopeId, officerId) {
    const envelope = await this.getById(envelopeId);
    if (envelope.prepStatus !== 'QR_PRINTED') return envelope; // not yet printed, or already confirmed -- idempotent either way, not an error

    const stages = [
      { status: 'QR_ATTACHED', eventType: 'QR_ATTACHED', remarks: 'QR sticker attached to envelope (operator confirmed).' },
      { status: 'PACKED', eventType: 'PACKED', remarks: 'Question papers packed into envelope (operator confirmed).' },
      { status: 'SEALED', eventType: 'SEALED', remarks: 'Envelope sealed (operator confirmed).' },
    ];

    for (const stage of stages) {
      await envelopeRepository.update(envelopeId, { prepStatus: stage.status });
      await custodyRepository.create({
        envelopeId,
        eventType: stage.eventType,
        officerId,
        location: envelope.center,
        remarks: stage.remarks,
      });
    }

    // READY_FOR_DISPATCH is the gate Phase 5 checks -- deliberately no
    // dedicated custody event for this specific transition (unlike the
    // 3 stages above): it's the natural consequence of SEALED being the
    // last real preparation action, not a distinct action of its own.
    const finalEnvelope = await envelopeRepository.update(envelopeId, { prepStatus: 'READY_FOR_DISPATCH' });
    getIo().emit('envelope:updated', { type: 'READY_FOR_DISPATCH', envelope: finalEnvelope });
    return finalEnvelope;
  },
};
