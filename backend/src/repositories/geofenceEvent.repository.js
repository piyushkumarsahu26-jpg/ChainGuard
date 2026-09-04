import { prisma } from '../config/db.js';

export const geofenceEventRepository = {
  create: (data) => prisma.geofenceEvent.create({ data }),

  listForSession: (sessionId) =>
    prisma.geofenceEvent.findMany({ where: { sessionId }, orderBy: { timestamp: 'asc' } }),
};
