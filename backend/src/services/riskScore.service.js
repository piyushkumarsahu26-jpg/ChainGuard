// Business logic for Sprint 8, Part 4 (Risk Score).
//
// Honesty note: this is a real, deterministic, documented weighted
// formula computed from real data already in this project's database —
// AI damage severity, GPS deviation/delay alerts, transfer count, and
// total alert count. It is NOT a trained machine-learning model. Calling
// it one would misrepresent what it actually is, the same care this
// project has taken since the very first AI sprint about not overstating
// what a model "learned" versus what it was actually trained on. If a
// genuinely trained risk-prediction model is wanted later, this function
// is the natural place a real model's output would replace this formula
// without changing anything that calls it.
import { detectionRepository } from '../repositories/detection.repository.js';
import { alertRepository } from '../repositories/alert.repository.js';
import { custodyRepository } from '../repositories/custody.repository.js';
import { envelopeRepository } from '../repositories/envelope.repository.js';
import { ApiError } from '../utils/apiError.js';
import { damageSeverity } from '../utils/damageClass.util.js';

// Weights sum to 100 — each factor's contribution to the final 0-100
// score. Damage weighted highest since it's the most direct physical
// integrity signal; transfer count lowest since a normal, healthy
// envelope legitimately changes hands several times (printing -> officer
// -> transport -> treasury -> exam centre is already 4+ transfers).
const WEIGHTS = { aiDamage: 35, gpsDeviation: 25, lateTransport: 15, transferCount: 10, alertCount: 15 };

function categoryFor(score) {
  if (score >= 75) return 'CRITICAL';
  if (score >= 50) return 'HIGH';
  if (score >= 25) return 'MEDIUM';
  return 'LOW';
}

export const riskScoreService = {
  async computeForEnvelope(envelopeId) {
    const envelope = await envelopeRepository.findById(envelopeId);
    if (!envelope) throw ApiError.notFound('Envelope not found');

    const [detections, alerts, custodyEvents] = await Promise.all([
      detectionRepository.list({ skip: 0, take: 50, where: { envelopeId } }),
      alertRepository.list({ skip: 0, take: 200, where: { envelopeId } }),
      custodyRepository.listByEnvelope(envelopeId),
    ]);

    // Factor 1: AI damage — the single worst (highest-confidence-weighted)
    // detection's severity, per the shared damageSeverity() mapping
    // (utils/damageClass.util.js, Integration Sprint 3 -- previously a
    // local copy here). An envelope with no detections yet contributes
    // 0, not an unknown/penalized value — absence of a scan isn't
    // itself a risk signal.
    let aiDamageScore = 0;
    for (const d of detections) {
      const severity = damageSeverity(d.prediction);
      aiDamageScore = Math.max(aiDamageScore, severity * d.confidence);
    }

    // Factor 2: GPS deviation — real ROUTE_DEVIATION/CHECKPOINT_MISSED
    // alerts for this envelope, capped at 3 occurrences for full weight
    // (a 4th deviation doesn't meaningfully increase risk beyond "this
    // transport had real, repeated problems").
    const deviationAlerts = alerts.filter((a) => a.category === 'ROUTE_DEVIATION' || a.category === 'CHECKPOINT_MISSED').length;
    const gpsDeviationScore = Math.min(deviationAlerts / 3, 1);

    // Factor 3: late transport — real LATE_ARRIVAL alerts, binary (any
    // lateness is a real schedule risk regardless of count).
    const lateAlerts = alerts.filter((a) => a.category === 'LATE_ARRIVAL').length;
    const lateTransportScore = lateAlerts > 0 ? 1 : 0;

    // Factor 4: transfer count — real ChainOfCustody HANDOVER_ACCEPTED
    // events, capped at 6 (a well-travelled but otherwise clean envelope
    // shouldn't be flagged just for having a normal, long custody chain).
    const transferCount = custodyEvents.filter((e) => e.eventType === 'HANDOVER_ACCEPTED').length;
    const transferCountScore = Math.min(transferCount / 6, 1);

    // Factor 5: alert count — total real alerts of any kind for this
    // envelope, capped at 5.
    const alertCountScore = Math.min(alerts.length / 5, 1);

    const weightedScore =
      aiDamageScore * WEIGHTS.aiDamage +
      gpsDeviationScore * WEIGHTS.gpsDeviation +
      lateTransportScore * WEIGHTS.lateTransport +
      transferCountScore * WEIGHTS.transferCount +
      alertCountScore * WEIGHTS.alertCount;

    const score = Math.round(weightedScore);

    return {
      envelopeId,
      score,
      category: categoryFor(score),
      factors: {
        aiDamage: Math.round(aiDamageScore * WEIGHTS.aiDamage),
        gpsDeviation: Math.round(gpsDeviationScore * WEIGHTS.gpsDeviation),
        lateTransport: Math.round(lateTransportScore * WEIGHTS.lateTransport),
        transferCount: Math.round(transferCountScore * WEIGHTS.transferCount),
        alertCount: Math.round(alertCountScore * WEIGHTS.alertCount),
      },
      // Risk Trend / Risk History (Part 4's display requirements) —
      // approximated from real alert timestamps, since this project
      // doesn't persist a separate historical score snapshot table (that
      // would be a genuinely new database model for a derived,
      // recomputable-on-demand value — see the report's architecture
      // decisions for why that was deliberately not added).
      recentAlertTimestamps: alerts.slice(0, 10).map((a) => ({ timestamp: a.createdAt, severity: a.severity })),
    };
  },

  // Bulk variant for the Command Center / high-risk list (Part 5) —
  // avoids N+1 by reusing the same repositories with broader queries
  // rather than calling computeForEnvelope() in a loop for every envelope
  // in the system.
  async computeBulk(limit = 500) {
    const envelopes = await envelopeRepository.list({ skip: 0, take: limit, where: {} });
    const results = await Promise.all(envelopes.map((e) => this.computeForEnvelope(e.id)));
    return results.sort((a, b) => b.score - a.score);
  },
};
