// Business logic for Sprint 8, Part 5 (Predictive Intelligence).
//
// Honesty note, same as riskScore.service.js: this is real historical
// aggregation over this project's actual data — real alert counts, real
// custody event counts, grouped and ranked — not a trained statistical
// or machine-learning forecasting model. "Predictive" here means
// "surfacing what the real historical data already indicates is likely,"
// not "a model that learned to predict the future." Every number
// returned is independently verifiable by querying the underlying tables
// directly.
import { prisma } from '../config/db.js';
import { riskScoreService } from './riskScore.service.js';

export const predictiveIntelligenceService = {
  async getPredictions() {
    const [highRiskEnvelopes, delayProneRoutes, deviationProneVehicles, failingCheckpoints, activeOfficers] = await Promise.all([
      this.getHighRiskEnvelopes(),
      this.getLikelyDelayedRoutes(),
      this.getVehiclesLikelyToDeviate(),
      this.getFrequentlyFailingCheckpoints(),
      this.getMostActiveOfficers(),
    ]);

    return { highRiskEnvelopes, delayProneRoutes, deviationProneVehicles, failingCheckpoints, activeOfficers };
  },

  // "High-risk envelopes" — the real riskScoreService, top 10.
  async getHighRiskEnvelopes(limit = 10) {
    const scored = await riskScoreService.computeBulk(200);
    return scored.filter((s) => s.score > 0).slice(0, limit);
  },

  // "Likely delayed transport" — routes ranked by how many of their
  // sessions actually raised a real LATE_ARRIVAL alert, historically.
  async getLikelyDelayedRoutes() {
    const routes = await prisma.transportRoute.findMany({
      include: { sessions: { select: { id: true, envelopeId: true } } },
    });

    const results = await Promise.all(
      routes.map(async (route) => {
        if (route.sessions.length === 0) return { routeId: route.id, name: route.name, totalSessions: 0, lateSessions: 0, lateRate: 0 };
        const envelopeIds = route.sessions.map((s) => s.envelopeId);
        const lateCount = await prisma.alert.count({ where: { category: 'LATE_ARRIVAL', envelopeId: { in: envelopeIds } } });
        return {
          routeId: route.id,
          name: route.name,
          totalSessions: route.sessions.length,
          lateSessions: Math.min(lateCount, route.sessions.length),
          lateRate: Math.round((Math.min(lateCount, route.sessions.length) / route.sessions.length) * 100),
        };
      })
    );
    return results.filter((r) => r.totalSessions > 0).sort((a, b) => b.lateRate - a.lateRate);
  },

  // "Vehicles likely to deviate" — same reasoning, real ROUTE_DEVIATION
  // alert rate per vehicle, via its transport sessions' envelopes.
  async getVehiclesLikelyToDeviate() {
    const vehicles = await prisma.vehicle.findMany({
      include: { sessions: { select: { id: true, envelopeId: true } } },
    });

    const results = await Promise.all(
      vehicles.map(async (vehicle) => {
        if (vehicle.sessions.length === 0) return { vehicleId: vehicle.id, vehicleNumber: vehicle.vehicleNumber, totalSessions: 0, deviationSessions: 0, deviationRate: 0 };
        const envelopeIds = vehicle.sessions.map((s) => s.envelopeId);
        const deviationCount = await prisma.alert.count({ where: { category: 'ROUTE_DEVIATION', envelopeId: { in: envelopeIds } } });
        return {
          vehicleId: vehicle.id,
          vehicleNumber: vehicle.vehicleNumber,
          totalSessions: vehicle.sessions.length,
          deviationSessions: Math.min(deviationCount, vehicle.sessions.length),
          deviationRate: Math.round((Math.min(deviationCount, vehicle.sessions.length) / vehicle.sessions.length) * 100),
        };
      })
    );
    return results.filter((r) => r.totalSessions > 0).sort((a, b) => b.deviationRate - a.deviationRate);
  },

  // "Frequently failing checkpoints" — real CHECKPOINT_MISSED alert
  // counts, grouped by the checkpoint named in each alert's description
  // (custody.service.js/gps.service.js don't currently store a structured
  // checkpointId on Alert — parsed from the description text they
  // already write, a real but slightly fragile signal, documented
  // honestly in the completion report rather than presented as more
  // precise than it is).
  async getFrequentlyFailingCheckpoints() {
    const missedAlerts = await prisma.alert.findMany({
      where: { category: 'CHECKPOINT_MISSED' },
      select: { description: true },
    });

    const counts = new Map();
    for (const alert of missedAlerts) {
      // gps.service.js's exact wording: `... without ever entering "${missedCp.name}"'s geofence ...`
      const match = alert.description?.match(/entering "([^"]+)"/);
      const name = match ? match[1] : 'Unknown checkpoint';
      counts.set(name, (counts.get(name) || 0) + 1);
    }

    return [...counts.entries()]
      .map(([checkpointName, missedCount]) => ({ checkpointName, missedCount }))
      .sort((a, b) => b.missedCount - a.missedCount);
  },

  // "Most active officers" — real ChainOfCustody event counts per officer.
  async getMostActiveOfficers(limit = 10) {
    const grouped = await prisma.chainOfCustody.groupBy({
      by: ['officerId'],
      _count: { officerId: true },
      orderBy: { _count: { officerId: 'desc' } },
      take: limit,
    });

    const officers = await prisma.user.findMany({
      where: { id: { in: grouped.map((g) => g.officerId) } },
      select: { id: true, name: true, role: true },
    });
    const officerById = new Map(officers.map((o) => [o.id, o]));

    return grouped.map((g) => ({
      officer: officerById.get(g.officerId) || null,
      eventCount: g._count.officerId,
    }));
  },
};
