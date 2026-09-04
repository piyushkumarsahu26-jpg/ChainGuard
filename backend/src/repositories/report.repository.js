// Data-access layer for Report.
import { prisma } from '../config/db.js';

export const reportRepository = {
  create: (data) => prisma.report.create({ data }),
  findById: (id) => prisma.report.findUnique({ where: { id } }),
  list: ({ skip, take, where }) =>
    prisma.report.findMany({ skip, take, where, orderBy: { createdAt: 'desc' } }),
  count: (where) => prisma.report.count({ where }),
};
