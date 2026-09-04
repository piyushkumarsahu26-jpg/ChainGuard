import { prisma } from '../config/db.js';
import { Prisma } from '@prisma/client';

export const gpsLocationRepository = {
  create: (data) => prisma.gPSLocation.create({ data }),

  latestForSession: (sessionId) =>
    prisma.gPSLocation.findFirst({ where: { sessionId }, orderBy: { timestamp: 'desc' } }),

  // Final Verification Sprint fix (Performance Audit): the latest
  // location for *several* sessions at once, in one query -- added
  // because gps.service.js's getDashboardStats() was calling
  // latestForSession() once per active session in a loop, a real N+1
  // query pattern on a frequently-polled dashboard endpoint. DISTINCT
  // ON (sessionId) ... ORDER BY timestamp DESC is the standard Postgres
  // way to get exactly one "latest per group" row per session without
  // fetching every location row for every session just to reduce them
  // in memory afterward. Prisma.join() is Prisma's own safe way to
  // interpolate a variable-length list into a raw query's IN (...)
  // clause -- still fully parameterized, same as every other $queryRaw
  // use in this codebase.
  latestForSessions: (sessionIds) => {
    if (!sessionIds || sessionIds.length === 0) return Promise.resolve([]);
    // Prisma.join() has a documented failure mode with exactly one
    // array element (github.com/prisma/prisma/issues/18367, confirmed
    // by search before relying on this) -- a single active session is
    // an entirely normal, common case here, not a rare edge worth
    // ignoring. Falls back to a plain equality check for that one case.
    if (sessionIds.length === 1) {
      return prisma.$queryRaw`
        SELECT DISTINCT ON ("sessionId") *
        FROM "gps_locations"
        WHERE "sessionId" = ${sessionIds[0]}
        ORDER BY "sessionId", "timestamp" DESC
      `;
    }
    return prisma.$queryRaw`
      SELECT DISTINCT ON ("sessionId") *
      FROM "gps_locations"
      WHERE "sessionId" IN (${Prisma.join(sessionIds)})
      ORDER BY "sessionId", "timestamp" DESC
    `;
  },

  historyForSession: (sessionId) =>
    prisma.gPSLocation.findMany({ where: { sessionId }, orderBy: { timestamp: 'asc' } }),

  // Used for the "vehicle stopped >5min" alert check — the most recent
  // point where the vehicle was genuinely moving, so elapsed time since
  // then can be compared against the current (stopped) reading.
  mostRecentMovingPoint: (sessionId, speedThreshold = 1) =>
    prisma.gPSLocation.findFirst({
      where: { sessionId, speed: { gt: speedThreshold } },
      orderBy: { timestamp: 'desc' },
    }),
};
