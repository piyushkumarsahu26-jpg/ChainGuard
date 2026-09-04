import { prisma } from '../config/db.js';

export const transportRouteRepository = {
  create: (data) => prisma.transportRoute.create({ data }),

  findById: (id) =>
    prisma.transportRoute.findUnique({
      where: { id },
      include: { checkpoints: { orderBy: { sequence: 'asc' } } },
    }),

  list: () =>
    prisma.transportRoute.findMany({
      include: { checkpoints: { orderBy: { sequence: 'asc' } } },
      orderBy: { name: 'asc' },
    }),
};

export const routeCheckpointRepository = {
  createMany: (routeId, checkpoints) =>
    prisma.routeCheckpoint.createMany({
      data: checkpoints.map((cp, i) => ({
        routeId,
        name: cp.name,
        latitude: cp.latitude,
        longitude: cp.longitude,
        sequence: cp.sequence ?? i,
        radiusMeters: cp.radiusMeters ?? 250,
      })),
    }),

  listForRoute: (routeId) =>
    prisma.routeCheckpoint.findMany({ where: { routeId }, orderBy: { sequence: 'asc' } }),
};
