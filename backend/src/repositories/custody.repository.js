// Data-access layer for ChainOfCustody.
import { prisma } from '../config/db.js';

export const custodyRepository = {
  create: (data) => prisma.chainOfCustody.create({ data }),
  update: (id, data) => prisma.chainOfCustody.update({ where: { id }, data }),

  // Sprint 7 — the single source of truth for "does this envelope have
  // an open, unconfirmed handover right now". eventType: 'HANDOVER' +
  // confirmed: false is exactly and only what initiateHandover() creates,
  // and exactly what acceptHandover() looks for and then flips to true —
  // so "most recent unconfirmed HANDOVER row" is unambiguous even though
  // the table is append-only and never mutated for any other purpose.
  findPendingHandover: (envelopeId) =>
    prisma.chainOfCustody.findFirst({
      where: { envelopeId, eventType: 'HANDOVER', confirmed: false },
      orderBy: { timestamp: 'desc' },
    }),

  listPendingForOfficer: (toOfficerId) =>
    prisma.chainOfCustody.findMany({
      where: { toOfficerId, eventType: 'HANDOVER', confirmed: false },
      orderBy: { timestamp: 'desc' },
      include: {
        envelope: { select: { id: true, envelopeCode: true, exam: true, center: true } },
        officer: { select: { id: true, name: true, role: true } },
      },
    }),

  listByEnvelope: (envelopeId) =>
    prisma.chainOfCustody.findMany({
      where: { envelopeId },
      orderBy: { timestamp: 'asc' },
      include: { officer: { select: { id: true, name: true, role: true } }, toOfficer: { select: { id: true, name: true, role: true } } },
    }),
  list: ({ skip, take, where }) =>
    prisma.chainOfCustody.findMany({
      skip,
      take,
      where,
      orderBy: { timestamp: 'desc' },
      include: {
        officer: { select: { id: true, name: true, role: true } },
        envelope: { select: { id: true, envelopeCode: true } },
      },
    }),
  count: (where) => prisma.chainOfCustody.count({ where }),
};
