// Data-access layer for Alert.
import { prisma } from '../config/db.js';

export const alertRepository = {
  create: (data) => prisma.alert.create({ data }),
  findById: (id) =>
    prisma.alert.findUnique({
      where: { id },
      include: { camera: true, detection: true, envelope: true, resolvedBy: true },
    }),
  list: ({ skip, take, where }) =>
    prisma.alert.findMany({
      skip,
      take,
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        camera: { select: { id: true, name: true } },
        envelope: { select: { id: true, envelopeCode: true } },
      },
    }),
  count: (where) => prisma.alert.count({ where }),
  update: (id, data) => prisma.alert.update({ where: { id }, data }),
  resolve: (id, { resolvedById }) =>
    prisma.alert.update({
      where: { id },
      data: { status: 'RESOLVED', resolvedById, resolvedTime: new Date() },
    }),

  // Alert counts grouped by the exam center of the linked envelope. Not
  // every alert has an envelopeId (camera-only alerts don't), so this is
  // necessarily a partial view — an inner join is correct here, not a bug.
  countByEnvelopeCenter: () =>
    prisma.$queryRaw`
      SELECT e."center" AS center, COUNT(a.*)::int AS incidents
      FROM "alerts" a
      INNER JOIN "envelopes" e ON e."id" = a."envelopeId"
      GROUP BY e."center"
      ORDER BY incidents DESC
    `,
};
