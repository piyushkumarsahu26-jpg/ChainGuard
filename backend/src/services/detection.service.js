// Business logic for AI Detection ingestion. Two callers, both real as of
// Sprint AI-4B: the FastAPI AI service (live/prerecorded feed detections,
// cameraId set, envelopeId usually absent) and the on-demand Scanner flow
// in envelope.service.js (a manual photo upload -- envelopeId set,
// cameraId absent, and as of Integration Sprint 3, transportSessionId/
// latitude/longitude set too when a real transport session is behind the
// scan). See detection.validator.js for the "at least one of
// cameraId/envelopeId" rule enforced before this function ever runs.
import { detectionRepository } from '../repositories/detection.repository.js';
import { alertRepository } from '../repositories/alert.repository.js';
import { getPagination, buildPaginationMeta } from '../utils/pagination.util.js';
import { getIo } from '../config/socket.js';
import { isTamperClass, severityForDetection } from '../utils/damageClass.util.js';
import { incidentResponseService } from './incidentResponse.service.js';

// Predictions at/above this confidence auto-generate an alert -- but see
// isTamperClass() below: Integration Sprint 3 fixed a real bug here. This
// threshold used to be the *only* check, meaning a confident SAFE/SEALED
// detection (no damage at all) would still raise a "suspicious activity"
// alert. "Generate alerts for tamper detections" means what it says --
// the class has to actually represent damage, not just be confidently
// classified as anything.
const AUTO_ALERT_CONFIDENCE_THRESHOLD = 0.75;

export const detectionService = {
  async create({ cameraId, envelopeId, prediction, confidence, boundingBox, imagePath, transportSessionId, latitude, longitude }) {
    const detection = await detectionRepository.create({
      cameraId: cameraId || null,
      envelopeId: envelopeId || null,
      prediction,
      confidence,
      boundingBox,
      imagePath,
      transportSessionId: transportSessionId || null,
      latitude: latitude ?? null,
      longitude: longitude ?? null,
    });

    getIo().emit('detection:new', { detection });

    let alert = null;
    if (confidence >= AUTO_ALERT_CONFIDENCE_THRESHOLD && isTamperClass(prediction)) {
      alert = await alertRepository.create({
        severity: severityForDetection(prediction, confidence),
        status: 'OPEN',
        title: `Tamper detected: ${prediction}`,
        description: `AI system flagged "${prediction}" with ${(confidence * 100).toFixed(1)}% confidence.`,
        detectionId: detection.id,
        cameraId: cameraId || null,
        envelopeId: envelopeId || null,
      });
      getIo().emit('alert:new', { alert });

      // Integration Sprint 4: a real AuditLog entry for every tamper
      // incident -- did not exist before this sprint. Deliberately
      // createCustodyEvent: false -- envelope.service.js's scan() already
      // writes exactly one correct ChainOfCustody event for the whole
      // detection batch this item belongs to (Integration Sprint 3);
      // writing a second one here, per individual detection, would
      // duplicate that same real event.
      incidentResponseService.recordIncident({
        envelopeId,
        actorId: null, // an AI detection has no human actor; envelope.service.js's own audit/custody entries already carry the scanning officer
        category: prediction,
        title: `Tamper detected: ${prediction}`,
        description: `AI system flagged "${prediction}" with ${(confidence * 100).toFixed(1)}% confidence (detection ${detection.id}).`,
        createCustodyEvent: false,
      });
    }

    return { detection, alert };
  },

  async getById(id) {
    return detectionRepository.findById(id);
  },

  async list(query) {
    const { page, limit, skip } = getPagination(query);
    const where = {};
    if (query.cameraId) where.cameraId = query.cameraId;
    if (query.envelopeId) where.envelopeId = query.envelopeId;
    if (query.prediction) where.prediction = { contains: query.prediction, mode: 'insensitive' };

    const [items, total] = await Promise.all([
      detectionRepository.list({ skip, take: limit, where }),
      detectionRepository.count(where),
    ]);
    return { items, meta: buildPaginationMeta({ page, limit, total }) };
  },
};
