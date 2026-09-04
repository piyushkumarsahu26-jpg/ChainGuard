// Business logic for cross-cutting analytics. Every figure here is a real
// aggregation over stored rows — nothing is fabricated or hardcoded. Charts
// backed by these endpoints will legitimately show empty/sparse data until
// the AI service (Phase 3) is producing a steady stream of detections; that
// is correct behavior for a system with no synthetic data injection.
import { detectionRepository } from '../repositories/detection.repository.js';
import { alertRepository } from '../repositories/alert.repository.js';
import { cameraService } from './camera.service.js';
import { prisma } from '../config/db.js';

// QR Verification & Digital Authentication sprint (Phase 8) -- category
// values that are unambiguously QR-related (added this same sprint,
// migration 20260806070000). ROUTE_DEVIATION is deliberately excluded
// from the QR-specific "route violations" figure below and reported
// separately with that ambiguity stated: it's shared with the
// continuous GPS deviation check (Sprint 6), so a total count under
// that category can't be cleanly attributed to QR-scan-time checks
// alone versus ongoing transport monitoring.
const QR_ALERT_CATEGORIES = ['INVALID_QR', 'SIGNATURE_FAILURE', 'DUPLICATE_SCAN', 'EXPIRED_QR', 'UNKNOWN_ENVELOPE', 'WRONG_CENTRE'];

export const analyticsService = {
  async getScansByMonth() {
    const rows = await detectionRepository.countByMonth();
    // BigInt/Prisma raw results serialize counts as strings in some drivers;
    // normalize to numbers so the frontend never has to guess the type.
    return rows.map((r) => ({ month: r.month, scans: Number(r.count) }));
  },

  async getTamperBreakdown() {
    const rows = await detectionRepository.countByPrediction();
    return rows.map((r) => ({ name: r.prediction, value: r._count._all }));
  },

  async getConfidenceTrend(days = 30) {
    const rows = await detectionRepository.avgConfidenceByDay(days);
    return rows.map((r) => ({
      day: r.day,
      avgConfidence: Number(r.avgConfidence) * 100, // stored as 0-1, display as %
    }));
  },

  async getCenterRisk() {
    const rows = await alertRepository.countByEnvelopeCenter();
    return rows.map((r) => ({ center: r.center, incidents: Number(r.incidents) }));
  },

  // Reuses the existing camera service/repository rather than querying
  // cameras a second, independent way — this is a live status snapshot,
  // not a fabricated uptime percentage (no history table exists for that).
  async getCameraStatus() {
    const { items } = await cameraService.list({ limit: 100 });
    return items.map((c) => ({ id: c.id, name: c.name, status: c.status }));
  },

  // QR Verification & Digital Authentication sprint (Phase 8). Every
  // figure below is a real count over ChainOfCustody/Alert -- no
  // separate "QR scan log" table was created to support this; the same
  // rows the QR Verification page's own timeline/Alert Center already
  // show are what this aggregates.
  async getQrAnalytics() {
    const [scanCount, verifiedCount, categoryGroups, routeViolationCount, dailyRows, officerRows] = await Promise.all([
      prisma.chainOfCustody.count({ where: { eventType: 'QR_SCAN' } }),
      prisma.chainOfCustody.count({ where: { eventType: 'VERIFIED' } }),
      prisma.alert.groupBy({ by: ['category'], _count: { category: true }, where: { category: { in: QR_ALERT_CATEGORIES } } }),
      // Best-effort: route-violation alerts whose title matches the scan-
      // time check's own wording (raiseQrAlert's checkScanLocation call),
      // distinguishing them from the continuous GPS deviation check's
      // alerts, which use a different title. Not a perfect signal --
      // see the module comment on why ROUTE_DEVIATION can't be split
      // cleanly by category alone.
      prisma.alert.count({ where: { category: 'ROUTE_DEVIATION', title: { startsWith: 'Route violation at scan' } } }),
      prisma.$queryRaw`
        SELECT DATE_TRUNC('day', "timestamp") AS day, COUNT(*)::int AS count
        FROM chain_of_custody
        WHERE "eventType" IN ('QR_SCAN', 'VERIFIED')
        GROUP BY day ORDER BY day DESC LIMIT 30
      `,
      prisma.chainOfCustody.groupBy({
        by: ['officerId'],
        _count: { officerId: true },
        where: { eventType: { in: ['QR_SCAN', 'VERIFIED'] } },
        orderBy: { _count: { officerId: 'desc' } },
        take: 10,
      }),
    ]);

    const categoryCounts = Object.fromEntries(QR_ALERT_CATEGORIES.map((c) => [c, 0]));
    for (const g of categoryGroups) categoryCounts[g.category] = g._count.category;

    const officerIds = officerRows.map((r) => r.officerId);
    const officers = officerIds.length
      ? await prisma.user.findMany({ where: { id: { in: officerIds } }, select: { id: true, name: true, role: true } })
      : [];
    const officerById = new Map(officers.map((o) => [o.id, o]));

    const failedVerifications = categoryCounts.INVALID_QR + categoryCounts.SIGNATURE_FAILURE + categoryCounts.EXPIRED_QR + categoryCounts.UNKNOWN_ENVELOPE + categoryCounts.WRONG_CENTRE;
    // A QR_SCAN/VERIFIED custody row only ever gets created on the
    // success path (resolveQrOrThrow throws before either is reached on
    // any failure) -- so these two counts and failedVerifications are
    // already disjoint, real totals, not overlapping sets needing any
    // subtraction between them.
    const successfulVerifications = scanCount + verifiedCount;

    return {
      totalScans: successfulVerifications + failedVerifications,
      successfulVerifications,
      failedVerifications,
      duplicateScans: categoryCounts.DUPLICATE_SCAN,
      tamperedAttempts: categoryCounts.SIGNATURE_FAILURE,
      routeViolations: routeViolationCount,
      dailyActivity: dailyRows.map((r) => ({ day: r.day, count: Number(r.count) })),
      officerPerformance: officerRows.map((r) => ({
        officer: officerById.get(r.officerId) || null,
        scanCount: r._count.officerId,
      })),
    };
  },
};
