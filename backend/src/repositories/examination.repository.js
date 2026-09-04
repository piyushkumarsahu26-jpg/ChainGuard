// Data-access layer for Examination (Architectural Integration sprint,
// Phase 1). No business logic here -- only Prisma calls, matching every
// other repository in this project.
import { prisma } from '../config/db.js';

const withContext = {
  officer: { select: { id: true, name: true, email: true, role: true } },
  createdBy: { select: { id: true, name: true, email: true } },
};

export const examinationRepository = {
  create: (data) => prisma.examination.create({ data, include: withContext }),
  findById: (id) =>
    prisma.examination.findUnique({
      where: { id },
      include: { ...withContext, batches: true, envelopes: { select: { id: true, envelopeCode: true, prepStatus: true } } },
    }),
  list: ({ skip, take, where }) =>
    prisma.examination.findMany({
      skip,
      take,
      where,
      orderBy: { examDate: 'desc' },
      include: withContext,
    }),
  count: (where) => prisma.examination.count({ where }),
  update: (id, data) => prisma.examination.update({ where: { id }, data, include: withContext }),
};
