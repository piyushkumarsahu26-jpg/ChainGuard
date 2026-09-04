// Business logic for Examination Setup (Architectural Integration
// sprint, Phase 1). Deliberately minimal: this creates exam metadata
// only. It does not generate QR codes, does not create envelopes, does
// not touch transport or GPS -- Phase 1's own spec is explicit about
// this boundary, and Phase 2 (envelopeBatch.service.js) is the only
// thing that reads an Examination to actually generate envelopes.
import { examinationRepository } from '../repositories/examination.repository.js';
import { userRepository } from '../repositories/user.repository.js';
import { getPagination, buildPaginationMeta } from '../utils/pagination.util.js';
import { ApiError } from '../utils/apiError.js';

export const examinationService = {
  async create({ state, city, district, centre, examName, subject, examDate, examTime, session, envelopeCount, officerId, createdById }) {
    const officer = await userRepository.findById(officerId);
    if (!officer) throw ApiError.notFound('Officer not found');
    // No new "Security Officer" role was introduced (the user's own
    // decision) -- any existing role can be assigned responsibility for
    // an examination's envelopes, matching how TransportSession.officerId
    // already accepts any authenticated officer without a role-specific
    // check of its own.

    return examinationRepository.create({
      state,
      city,
      district: district || null,
      centre,
      examName,
      subject: subject || '',
      examDate: new Date(examDate),
      examTime,
      session: session || null,
      envelopeCount: envelopeCount ?? 0,
      officerId,
      createdById,
    });
  },

  async getById(id) {
    const examination = await examinationRepository.findById(id);
    if (!examination) throw ApiError.notFound('Examination not found');
    return examination;
  },

  async list(query) {
    const { page, limit, skip } = getPagination(query);
    const where = {};
    if (query.centre) where.centre = { contains: query.centre, mode: 'insensitive' };
    if (query.state) where.state = { contains: query.state, mode: 'insensitive' };

    const [items, total] = await Promise.all([
      examinationRepository.list({ skip, take: limit, where }),
      examinationRepository.count(where),
    ]);
    return { items, meta: buildPaginationMeta({ page, limit, total }) };
  },

  async update(id, data) {
    await this.getById(id); // 404s cleanly if missing, matching envelopeService.update()'s own pattern
    const payload = { ...data };
    if (payload.examDate) payload.examDate = new Date(payload.examDate);
    return examinationRepository.update(id, payload);
  },
};
