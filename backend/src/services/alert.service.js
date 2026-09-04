// Business logic for Alert CRUD and resolution workflow.
import { alertRepository } from '../repositories/alert.repository.js';
import { getPagination, buildPaginationMeta } from '../utils/pagination.util.js';
import { ApiError } from '../utils/apiError.js';
import { getIo } from '../config/socket.js';

export const alertService = {
  async create(data) {
    const alert = await alertRepository.create(data);
    getIo().emit('alert:new', { alert });
    return alert;
  },

  async getById(id) {
    const alert = await alertRepository.findById(id);
    if (!alert) throw ApiError.notFound('Alert not found');
    return alert;
  },

  async list(query) {
    const { page, limit, skip } = getPagination(query);
    const where = {};
    if (query.status) where.status = query.status;
    if (query.severity) where.severity = query.severity;

    const [items, total] = await Promise.all([
      alertRepository.list({ skip, take: limit, where }),
      alertRepository.count(where),
    ]);
    return { items, meta: buildPaginationMeta({ page, limit, total }) };
  },

  async update(id, data) {
    await this.getById(id);
    return alertRepository.update(id, data);
  },

  async resolve(id, resolvedById) {
    await this.getById(id);
    const resolved = await alertRepository.resolve(id, { resolvedById });
    getIo().emit('alert:new', { alert: resolved, type: 'RESOLVED' });
    return resolved;
  },
};
