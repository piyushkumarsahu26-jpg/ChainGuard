// Data-access layer for Evidence.
import { prisma } from '../config/db.js';

export const evidenceRepository = {
  create: (data) => prisma.evidence.create({ data }),
  findById: (id) => prisma.evidence.findUnique({ where: { id } }),
  list: ({ skip, take, where }) => prisma.evidence.findMany({ skip, take, where, orderBy: { createdAt: 'desc' } }),
  count: (where) => prisma.evidence.count({ where }),
};
