// Data-access layer for Envelope.
import { prisma } from '../config/db.js';

export const envelopeRepository = {
  create: (data) => prisma.envelope.create({ data }),
  findById: (id) =>
    prisma.envelope.findUnique({
      where: { id },
      include: { createdBy: { select: { id: true, name: true, email: true } }, examination: true, batch: true },
    }),
  findByCode: (envelopeCode) => prisma.envelope.findUnique({ where: { envelopeCode } }),
  findByQrCode: (qrCode) =>
    prisma.envelope.findUnique({
      where: { qrCode },
      include: { examination: true, batch: true },
    }),
  list: ({ skip, take, where }) =>
    prisma.envelope.findMany({
      skip,
      take,
      where,
      orderBy: { createdAt: 'desc' },
      include: { createdBy: { select: { id: true, name: true } } },
    }),
  count: (where) => prisma.envelope.count({ where }),
  update: (id, data) => prisma.envelope.update({ where: { id }, data }),
  delete: (id) => prisma.envelope.delete({ where: { id } }),

  // Distinct exam centers that actually have envelopes — powers the
  // Reports filter dropdown instead of a hardcoded list.
  distinctCenters: () =>
    prisma.envelope.findMany({
      distinct: ['center'],
      select: { center: true },
      orderBy: { center: 'asc' },
    }),
};
