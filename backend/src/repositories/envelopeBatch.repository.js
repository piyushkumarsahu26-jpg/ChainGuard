// Data-access layer for EnvelopeBatch (Architectural Integration
// sprint, Phase 2/7 -- the user's own "introduce an Envelope Batch
// concept" decision). No business logic here.
import { prisma } from '../config/db.js';

export const envelopeBatchRepository = {
  create: (data) => prisma.envelopeBatch.create({ data }),
  findById: (id) =>
    prisma.envelopeBatch.findUnique({
      where: { id },
      include: {
        examination: true,
        generatedBy: { select: { id: true, name: true, email: true } },
        envelopes: true,
      },
    }),
  listByExamination: (examinationId) =>
    prisma.envelopeBatch.findMany({
      where: { examinationId },
      orderBy: { createdAt: 'desc' },
      include: { generatedBy: { select: { id: true, name: true } }, envelopes: { select: { id: true } } },
    }),
  update: (id, data) => prisma.envelopeBatch.update({ where: { id }, data }),
};
