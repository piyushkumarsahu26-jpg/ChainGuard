// Business logic for generating summary/audit reports.
//
// Sprint 8, Part 11: until this sprint, generate() was an honest stub
// (its own original comment said "In a full implementation this would
// query aggregate data...") -- it created a database row with a title
// and nothing else. This now computes real content for 5 report types,
// reusing the exact same services the rest of this project's UI already
// calls for the same figures (dashboardService, systemHealthService,
// predictiveIntelligenceService) -- no new aggregation logic duplicated
// here, this file only orchestrates calls to those.
//
// File generation (an actual PDF/CSV, per this project's filePath field)
// remains out of scope for this pass -- content is real, structured JSON
// that the frontend renders directly; filePath stays null, same as
// every report row before this sprint, until a document-rendering pass
// is specifically requested.
import { reportRepository } from '../repositories/report.repository.js';
import { getPagination, buildPaginationMeta } from '../utils/pagination.util.js';
import { ApiError } from '../utils/apiError.js';
import { dashboardService } from './dashboard.service.js';
import { systemHealthService } from './systemHealth.service.js';
import { predictiveIntelligenceService } from './predictiveIntelligence.service.js';
import { prisma } from '../config/db.js';

const REPORT_TYPES = ['EXECUTIVE', 'SECURITY', 'TRANSPORT_SUMMARY', 'AI_SUMMARY', 'OFFICER_SUMMARY'];

async function buildExecutiveReport() {
  const summary = await dashboardService.getSummary();
  return { reportType: 'EXECUTIVE', summary };
}

async function buildSecurityReport() {
  const [openAlerts, criticalAlerts, highRisk] = await Promise.all([
    prisma.alert.count({ where: { status: 'OPEN' } }),
    prisma.alert.count({ where: { status: 'OPEN', severity: 'CRITICAL' } }),
    predictiveIntelligenceService.getHighRiskEnvelopes(20),
  ]);
  const alertsByCategory = await prisma.alert.groupBy({ by: ['category'], _count: { category: true } });
  return { reportType: 'SECURITY', openAlerts, criticalAlerts, alertsByCategory, highRiskEnvelopes: highRisk };
}

async function buildTransportSummary() {
  const [totalSessions, completedSessions, cancelledSessions, delayProne, deviationProne] = await Promise.all([
    prisma.transportSession.count(),
    prisma.transportSession.count({ where: { status: 'COMPLETED' } }),
    prisma.transportSession.count({ where: { status: 'CANCELLED' } }),
    predictiveIntelligenceService.getLikelyDelayedRoutes(),
    predictiveIntelligenceService.getVehiclesLikelyToDeviate(),
  ]);
  return { reportType: 'TRANSPORT_SUMMARY', totalSessions, completedSessions, cancelledSessions, delayProneRoutes: delayProne, deviationProneVehicles: deviationProne };
}

async function buildAiSummary() {
  const aiHealth = await systemHealthService.getAiHealth();
  const detectionsByClass = await prisma.detection.groupBy({ by: ['prediction'], _count: { prediction: true }, _avg: { confidence: true } });
  return { reportType: 'AI_SUMMARY', ...aiHealth, detectionsByClass };
}

async function buildOfficerSummary() {
  const activeOfficers = await predictiveIntelligenceService.getMostActiveOfficers(20);
  return { reportType: 'OFFICER_SUMMARY', activeOfficers };
}

const BUILDERS = {
  EXECUTIVE: buildExecutiveReport,
  SECURITY: buildSecurityReport,
  TRANSPORT_SUMMARY: buildTransportSummary,
  AI_SUMMARY: buildAiSummary,
  OFFICER_SUMMARY: buildOfficerSummary,
};

export const reportService = {
  async generate({ title, type, filters, generatedById }) {
    let content = null;
    if (BUILDERS[type]) {
      content = await BUILDERS[type]();
    }
    // A type outside the 5 new ones (e.g. this project's pre-existing
    // "INCIDENT"/"DAILY_SUMMARY"/"ENVELOPE_AUDIT" examples from the
    // original schema comment) still creates a valid row with no content
    // -- exactly the old behavior, unchanged, for backward compatibility.

    const report = await reportRepository.create({ title, type, filters, content, generatedById });
    return report;
  },

  async getById(id) {
    const report = await reportRepository.findById(id);
    if (!report) throw ApiError.notFound('Report not found');
    return report;
  },

  async list(query) {
    const { page, limit, skip } = getPagination(query);
    const where = {};
    if (query.type) where.type = query.type;

    const [items, total] = await Promise.all([
      reportRepository.list({ skip, take: limit, where }),
      reportRepository.count(where),
    ]);
    return { items, meta: buildPaginationMeta({ page, limit, total }) };
  },
};

export const AVAILABLE_REPORT_TYPES = REPORT_TYPES;
