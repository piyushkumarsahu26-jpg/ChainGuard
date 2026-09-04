// Business logic for Camera CRUD and heartbeat/status management.
import { cameraRepository } from '../repositories/camera.repository.js';
import { getPagination, buildPaginationMeta } from '../utils/pagination.util.js';
import { ApiError } from '../utils/apiError.js';
import { getIo } from '../config/socket.js';

export const cameraService = {
  async create(data) {
    return cameraRepository.create(data);
  },

  async getById(id) {
    const camera = await cameraRepository.findById(id);
    if (!camera) throw ApiError.notFound('Camera not found');
    return camera;
  },

  async list(query) {
    const { page, limit, skip } = getPagination(query);
    const where = {};
    if (query.status) where.status = query.status;

    const [items, total] = await Promise.all([
      cameraRepository.list({ skip, take: limit, where }),
      cameraRepository.count(where),
    ]);
    return { items, meta: buildPaginationMeta({ page, limit, total }) };
  },

  async update(id, data) {
    await this.getById(id);
    return cameraRepository.update(id, data);
  },

  async remove(id) {
    await this.getById(id);
    await cameraRepository.delete(id);
  },

  async heartbeat(id, status) {
    const camera = await this.getById(id);
    const updated = await cameraRepository.updateHeartbeat(id, status);
    if (status === 'OFFLINE' && camera.status !== 'OFFLINE') {
      getIo().emit('camera:offline', { camera: updated });
    }
    return updated;
  },
};
