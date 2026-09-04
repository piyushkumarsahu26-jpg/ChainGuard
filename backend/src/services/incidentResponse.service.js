// Integration Sprint 4: one shared incident-response function, called
// from both the AI/detection path (detection.service.js) and the
// transport/GPS anomaly path (gps.service.js's raiseAlert()) -- the two
// places in this project that create an Alert. Before this sprint,
// neither path wrote anything to AuditLog, and only the Scanner's own
// tamper-detection flow (envelope.service.js, Integration Sprint 3)
// wrote to ChainOfCustody -- transport anomalies had no audit trail at
// all beyond the bare Alert row.
//
// Deliberately NOT called from envelope.service.js's own scan()-specific
// tamper handling -- that method already creates exactly one correct
// ChainOfCustody event for the whole detection batch (Integration Sprint
// 3). Calling this from inside detectionService.create() too, for every
// individual detection in that same batch, would create duplicate
// custody events for one real event. This service's `createCustodyEvent`
// parameter exists specifically so each caller states plainly whether
// custody-timeline coverage already exists elsewhere for it, rather than
// this function guessing.
import { auditLogRepository } from '../repositories/auditLog.repository.js';
import { custodyRepository } from '../repositories/custody.repository.js';
import { logger } from '../config/logger.js';

export const incidentResponseService = {
  /**
   * @param {object} params
   * @param {string|null} params.envelopeId
   * @param {string|null} params.actorId - the officer/system account attributed to this incident, if any
   * @param {string} params.category - the Alert's own category (e.g. 'ROUTE_DEVIATION', or the raw prediction class for AI incidents)
   * @param {string} params.title
   * @param {string} params.description
   * @param {boolean} [params.createCustodyEvent=false] - see module comment; only true for callers that don't already create their own custody event for this same incident
   * @param {string} [params.custodyEventType='DISCREPANCY'] - which CustodyEventType to use if createCustodyEvent is true
   * @param {string} [params.location] - ChainOfCustody.location is a required field; callers with real context (e.g. a vehicle number) should pass it, otherwise falls back to a generic label rather than failing the write
   */
  async recordIncident({ envelopeId, actorId, category, title, description, createCustodyEvent = false, custodyEventType = 'DISCREPANCY', location }) {
    try {
      await auditLogRepository.create({
        action: 'INCIDENT_RECORDED',
        actorId: actorId || null,
        metadata: { envelopeId: envelopeId || null, category, title },
      });
    } catch (err) {
      // An audit-trail write failing should never block the real alert
      // that already exists by the time this runs -- logged, not thrown.
      logger.error(`incidentResponseService: failed to write AuditLog entry: ${err.message}`);
    }

    if (createCustodyEvent && envelopeId && actorId) {
      try {
        await custodyRepository.create({
          envelopeId,
          eventType: custodyEventType,
          officerId: actorId,
          location: location || 'In transit',
          remarks: description,
        });
      } catch (err) {
        logger.error(`incidentResponseService: failed to write ChainOfCustody event: ${err.message}`);
      }
    }
  },
};
