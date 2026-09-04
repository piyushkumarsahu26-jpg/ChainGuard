import { envelopeBatchService } from '../services/envelopeBatch.service.js';
import { envelopeBatchPdfService } from '../services/envelopeBatchPdfService.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendSuccess } from '../utils/apiResponse.js';

// Phase 2: one atomic operation creates the batch record and every
// envelope (each with its own real, signed QR) -- see
// envelopeBatch.service.js's own header comment for why this project's
// architecture treats "envelope batch" and "QR batch" as inseparable.
export const generateBatch = asyncHandler(async (req, res) => {
  const result = await envelopeBatchService.generateBatch({ ...req.body, generatedById: req.user.id });
  sendSuccess(res, { statusCode: 201, data: result, message: `Generated ${result.envelopes.length} envelope(s) with signed QR codes` });
});

export const getBatch = asyncHandler(async (req, res) => {
  const batch = await envelopeBatchService.getBatch(req.params.id);
  sendSuccess(res, { data: batch });
});

// The explicit operator confirmation this sprint's own correction
// requires -- printing alone never implies this; the frontend shows a
// real confirmation dialog before ever calling this endpoint.
export const confirmPreparation = asyncHandler(async (req, res) => {
  const result = await envelopeBatchService.confirmPreparation(req.params.id, req.user.id);
  sendSuccess(res, { data: result, message: `${result.readyCount} of ${result.envelopeCount} envelope(s) now Ready for Dispatch` });
});

export const listBatchesForExamination = asyncHandler(async (req, res) => {
  const batches = await envelopeBatchService.listForExamination(req.params.examinationId);
  sendSuccess(res, { data: batches });
});

// Phase 3: the deliberate, separate PDF export action -- re-runnable at
// any time after the batch exists, without regenerating any QR. The
// *first* successful call is also what triggers Phase 4's automatic
// preparation cascade (envelopeBatch.service.js's recordPrint());
// repeated calls only update print statistics, never duplicate custody
// events -- the user's explicit instruction.
export const getBatchPdf = asyncHandler(async (req, res) => {
  const pdfBuffer = await envelopeBatchPdfService.generateStickerSheet(req.params.id);
  await envelopeBatchService.recordPrint(req.params.id, req.user.id);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="qr-stickers-${req.params.id}.pdf"`);
  res.send(pdfBuffer);
});
