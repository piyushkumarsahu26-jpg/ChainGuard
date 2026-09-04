import { auditLogRepository } from '../repositories/auditLog.repository.js';
import { getPagination, buildPaginationMeta } from '../utils/pagination.util.js';
import { logger } from '../config/logger.js';

export const auditLogService = {
  // Deliberately swallows its own errors. Audit logging is important, but
  // it must never be the reason a login, logout, or admin action fails —
  // a full disk or a transient DB hiccup on the audit_logs table shouldn't
  // take down authentication. Failures are still logged via the app logger
  // so they're visible in ops, just not surfaced to the caller.
  async record({ action, actorId = null, targetUserId = null, ipAddress = null, metadata = null }) {
    try {
      await auditLogRepository.create({ action, actorId, targetUserId, ipAddress, metadata });
    } catch (err) {
      logger.error(`Audit log write failed for action=${action}: ${err.message}`);
    }
  },

  async list(query) {
    const { page, limit, skip } = getPagination(query);
    const where = {};
    if (query.action) where.action = query.action;
    if (query.actorId) where.actorId = query.actorId;
    if (query.targetUserId) where.targetUserId = query.targetUserId;
    if (query.from || query.to) {
      where.createdAt = {};
      if (query.from) where.createdAt.gte = new Date(query.from);
      if (query.to) where.createdAt.lte = new Date(query.to);
    }

    const [items, total] = await Promise.all([
      auditLogRepository.list({ skip, take: limit, where }),
      auditLogRepository.count(where),
    ]);
    return { items, meta: buildPaginationMeta({ page, limit, total }) };
  },
};
