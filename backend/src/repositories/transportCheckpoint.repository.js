import { prisma } from '../config/db.js';

export const transportCheckpointRepository = {
  create: (data) => prisma.transportCheckpoint.create({ data }),
  listForSession: (sessionId) =>
    prisma.transportCheckpoint.findMany({ where: { sessionId }, orderBy: { reachedAt: 'asc' } }),
  namesReachedForSession: async (sessionId) => {
    const rows = await prisma.transportCheckpoint.findMany({
      where: { sessionId },
      select: { checkpointName: true },
    });
    return new Set(rows.map((r) => r.checkpointName));
  },
};
