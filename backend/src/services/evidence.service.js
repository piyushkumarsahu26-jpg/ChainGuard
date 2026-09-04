// Business logic for Evidence — orphaned since Phase 1 (repository existed,
// nothing called it). Sprint AI-4B wires it up as the storage layer for
// both manually-uploaded evidence and AI-scan evidence.
import { createHash } from 'crypto';
import { readFile } from 'fs/promises';
import { evidenceRepository } from '../repositories/evidence.repository.js';
import { getPagination, buildPaginationMeta } from '../utils/pagination.util.js';
import { ApiError } from '../utils/apiError.js';

async function computeFileHash(filePath) {
  const buffer = await readFile(filePath);
  return createHash('sha256').update(buffer).digest('hex');
}

export const evidenceService = {
  async create({ filePath, fileType, envelopeId, alertId, description, transportSessionId }) {
    const hash = await computeFileHash(filePath);
    return evidenceRepository.create({
      filePath,
      fileType,
      envelopeId: envelopeId || null,
      alertId: alertId || null,
      description: description || null,
      transportSessionId: transportSessionId || null,
      hash,
    });
  },

  async getById(id) {
    const evidence = await evidenceRepository.findById(id);
    if (!evidence) throw ApiError.notFound('Evidence not found');
    return evidence;
  },

  async list(query) {
    const { page, limit, skip } = getPagination(query);
    const where = {};
    if (query.envelopeId) where.envelopeId = query.envelopeId;
    if (query.alertId) where.alertId = query.alertId;

    const [items, total] = await Promise.all([
      evidenceRepository.list({ skip, take: limit, where }),
      evidenceRepository.count(where),
    ]);
    return { items, meta: buildPaginationMeta({ page, limit, total }) };
  },
};
