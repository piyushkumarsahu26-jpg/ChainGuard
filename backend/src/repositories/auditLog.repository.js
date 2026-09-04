// Data-access layer for AuditLog. No business logic here — only Prisma calls.
import { prisma } from '../config/db.js';

const includeUserSummaries = {
  actor: { select: { id: true, name: true, email: true, role: true } },
  targetUser: { select: { id: true, name: true, email: true, role: true } },
};

export const auditLogRepository = {
  create: (data) => prisma.auditLog.create({ data }),

  list: ({ skip, take, where }) =>
    prisma.auditLog.findMany({
      skip,
      take,
      where,
      orderBy: { createdAt: 'desc' },
      include: includeUserSummaries,
    }),

  count: (where) => prisma.auditLog.count({ where }),
};
