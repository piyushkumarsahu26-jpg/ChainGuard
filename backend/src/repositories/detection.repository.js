// Data-access layer for Detection.
import { prisma } from '../config/db.js';

export const detectionRepository = {
  create: (data) => prisma.detection.create({ data }),
  findById: (id) =>
    prisma.detection.findUnique({
      where: { id },
      include: { camera: true, envelope: { select: { id: true, envelopeCode: true, center: true } } },
    }),
  list: ({ skip, take, where }) =>
    prisma.detection.findMany({
      skip,
      take,
      where,
      orderBy: { timestamp: 'desc' },
      include: {
        camera: { select: { id: true, name: true } },
        envelope: { select: { id: true, envelopeCode: true } },
      },
    }),
  count: (where) => prisma.detection.count({ where }),

  // --- Analytics aggregations -----------------------------------------
  // Real counts/averages over stored Detection rows. These return empty
  // arrays until the AI service (Phase 3) is producing detections — that's
  // correct behavior, not a bug; the frontend renders an EmptyState for it.

  countByMonth: () =>
    prisma.$queryRaw`
      SELECT to_char(date_trunc('month', "timestamp"), 'YYYY-MM') AS month,
             COUNT(*)::int AS count
      FROM "detections"
      GROUP BY 1
      ORDER BY 1 ASC
    `,

  countByPrediction: () =>
    prisma.detection.groupBy({
      by: ['prediction'],
      _count: { _all: true },
      orderBy: { _count: { prediction: 'desc' } },
    }),

  avgConfidenceByDay: (sinceDays = 30) =>
    prisma.$queryRaw`
      SELECT to_char(date_trunc('day', "timestamp"), 'YYYY-MM-DD') AS day,
             ROUND(AVG("confidence")::numeric, 4) AS "avgConfidence"
      FROM "detections"
      WHERE "timestamp" >= NOW() - (${sinceDays} || ' days')::interval
      GROUP BY 1
      ORDER BY 1 ASC
    `,
};
