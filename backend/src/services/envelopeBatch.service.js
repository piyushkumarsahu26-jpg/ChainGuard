// Business logic for Phase 2 (QR Generation as Batch Generation) --
// the user's own architectural decision: "Generate Envelope Batch" and
// "Generate QR Batch" are one atomic operation here, since this
// project's Envelope has always required a QR the instant it exists
// (Envelope.qrCode is non-nullable, unique, generated in the same step
// since Phase 1 of this whole project) -- decoupling them would mean
// touching a field every other module already assumes is always
// present. What genuinely is a separate, deliberate action (per the
// user's explicit instruction) is PDF export -- see
// envelopeBatchPdf.service.js.
import { examinationRepository } from '../repositories/examination.repository.js';
import { envelopeBatchRepository } from '../repositories/envelopeBatch.repository.js';
import { envelopeService } from './envelope.service.js';
import { ApiError } from '../utils/apiError.js';

export const envelopeBatchService = {
  async generateBatch({ examinationId, count, generatedById }) {
    const examination = await examinationRepository.findById(examinationId);
    if (!examination) throw ApiError.notFound('Examination not found');
    if (!count || count < 1) throw ApiError.badRequest('count must be at least 1');
    if (count > 500) throw ApiError.badRequest('count cannot exceed 500 in a single batch'); // a sane upper bound -- not requested explicitly, but an unbounded loop of real QR-signing + file-writing work per request is a real resource-exhaustion risk worth a stated limit

    const batch = await envelopeBatchRepository.create({
      examinationId,
      count,
      generatedById,
    });

    // Sequential, not Promise.all -- each envelope's creation includes
    // real file I/O (writing its QR PNG, utils/qrcode.util.js) and two
    // custody-event writes; running 500 of these fully in parallel would
    // be a real, avoidable spike against the same database and
    // filesystem this whole request is already using. envelope.service.
    // js's own create() is reused unmodified per envelope, not
    // duplicated.
    const envelopes = [];
    for (let i = 0; i < count; i++) {
      const envelope = await envelopeService.create({
        exam: examination.examName,
        subject: examination.subject,
        center: examination.centre,
        createdById: generatedById,
        examinationId,
        batchId: batch.id,
      });
      envelopes.push(envelope);
    }

    return { batch, envelopes };
  },

  async getBatch(id) {
    const batch = await envelopeBatchRepository.findById(id);
    if (!batch) throw ApiError.notFound('Envelope batch not found');
    return batch;
  },

  async listForExamination(examinationId) {
    const examination = await examinationRepository.findById(examinationId);
    if (!examination) throw ApiError.notFound('Examination not found');
    return envelopeBatchRepository.listByExamination(examinationId);
  },

  // Phase 3/4 refinement: print metadata is tracked separately from
  // ChainOfCustody. The *first* successful print is what marks
  // QR_PRINTED true for each envelope (envelope.service.js's
  // markQrPrinted -- see its own comment for why this is honest to do
  // automatically, unlike the steps after it). "Repeated printing
  // should update print statistics rather than creating duplicate
  // custody events" is exactly what printCount === 0 vs > 0
  // distinguishes below.
  async recordPrint(batchId, triggeringOfficerId) {
    const batch = await this.getBatch(batchId);
    const isFirstPrint = batch.printCount === 0;

    if (isFirstPrint) {
      // Sequential, same reasoning as generateBatch() -- each of these
      // is a real custody-event write, not something to fire 25+ of
      // concurrently against the same tables.
      for (const envelope of batch.envelopes) {
        await envelopeService.markQrPrinted(envelope.id, triggeringOfficerId);
      }
    }

    const now = new Date();
    await envelopeBatchRepository.update(batchId, {
      printCount: { increment: 1 },
      firstPrintedAt: isFirstPrint ? now : undefined,
      lastPrintedAt: now,
    });

    return { isFirstPrint, envelopeCount: batch.envelopes.length };
  },

  // New: the explicit, separate operator confirmation this sprint's own
  // correction asked for -- "printing QR stickers should not
  // automatically imply attach/pack/seal happened." Only reachable
  // (per envelope.service.js's confirmPreparationComplete()) once
  // QR_PRINTED is real; called only after the frontend's own
  // confirmation dialog, never as a silent side effect of printing.
  async confirmPreparation(batchId, triggeringOfficerId) {
    const batch = await this.getBatch(batchId);
    const results = [];
    for (const envelope of batch.envelopes) {
      const updated = await envelopeService.confirmPreparationComplete(envelope.id, triggeringOfficerId);
      results.push(updated);
    }
    return { envelopeCount: results.length, readyCount: results.filter((e) => e.prepStatus === 'READY_FOR_DISPATCH').length };
  },
};
