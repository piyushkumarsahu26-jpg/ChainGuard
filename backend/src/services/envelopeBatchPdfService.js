// Business logic for Phase 3 (Printing) -- generates one print-ready
// PDF containing every QR sticker in a batch, laid out in a grid with
// cut guides. Reuses each envelope's already-generated QR PNG
// (utils/qrcode.util.js, unchanged) rather than re-rendering QR images
// -- this file only composes existing files into a document. The grid
// math itself lives in utils/stickerSheetLayout.util.js (real, tested
// separately) and is reused here, not duplicated.
import fs from 'fs';
import path from 'path';
import PDFDocument from 'pdfkit';
import { envelopeBatchRepository } from '../repositories/envelopeBatch.repository.js';
import { ApiError } from '../utils/apiError.js';
import { PAGE_MARGIN, CELL_WIDTH, CELL_HEIGHT, layoutGrid } from '../utils/stickerSheetLayout.util.js';

const QR_SIZE = 110; // reduced from 130 -- see stickerSheetLayout.util.js's ROWS comment for why

// "Centre Name (short form)" -- a plain, honest truncation, not a
// derived abbreviation (this project has no data to reliably abbreviate
// e.g. "Government Engineering College" -> "GEC" without guessing).
// Long enough to still be genuinely identifying on a small sticker.
function shortForm(text, maxLength = 26) {
  if (!text || text.length <= maxLength) return text || '';
  return text.slice(0, maxLength - 1) + '…';
}

export const envelopeBatchPdfService = {
  // Returns a real, finished Buffer -- callers stream it to the
  // response themselves (the controller), keeping this function
  // testable independent of Express req/res.
  async generateStickerSheet(batchId) {
    const batch = await envelopeBatchRepository.findById(batchId);
    if (!batch) throw ApiError.notFound('Envelope batch not found');
    if (!batch.envelopes || batch.envelopes.length === 0) {
      throw ApiError.badRequest('This batch has no envelopes to print');
    }

    const doc = new PDFDocument({ size: 'LETTER', margin: PAGE_MARGIN });
    const chunks = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    const finished = new Promise((resolve, reject) => {
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
    });

    doc
      .fontSize(14)
      .text(`QR Sticker Sheet — ${batch.examination.examName} (${batch.examination.centre})`, { align: 'center' })
      .fontSize(9)
      .fillColor('#555555')
      .text(`Subject: ${batch.examination.subject}  ·  Exam Date: ${batch.examination.examDate.toDateString()}  ·  Batch: ${batch.id}  ·  ${batch.envelopes.length} envelope(s)`, { align: 'center' })
      .fillColor('#000000')
      .moveDown(1);

    // The real placement math, computed once, tested separately
    // (tests/stickerSheetLayout.util.test.js) -- this loop only draws
    // at the coordinates it's given, it doesn't compute them itself.
    const placements = layoutGrid(batch.envelopes.length, doc.y);
    let currentPage = 1;

    for (const placement of placements) {
      if (placement.page !== currentPage) {
        doc.addPage();
        currentPage = placement.page;
      }

      const { cellX, cellY } = placement;
      const envelope = batch.envelopes[placement.index];

      // Cut guide -- a real, visible rectangle around each sticker, not
      // a decorative flourish; this is what "print-ready... cut and
      // attach" actually needs to be usable with scissors.
      doc.rect(cellX + 4, cellY + 4, CELL_WIDTH - 8, CELL_HEIGHT - 8).dash(2, { space: 2 }).strokeColor('#999999').stroke();
      doc.undash();

      const qrX = cellX + (CELL_WIDTH - QR_SIZE) / 2;
      const qrY = cellY + 10;
      const absoluteImagePath = path.resolve(process.cwd(), envelope.qrImagePath || '');
      if (envelope.qrImagePath && fs.existsSync(absoluteImagePath)) {
        doc.image(absoluteImagePath, qrX, qrY, { width: QR_SIZE, height: QR_SIZE });
      } else {
        // Never silently produce a blank sticker for a real envelope --
        // a missing QR file is a real problem worth being visible on the
        // printed sheet itself, not just in a server log no one reading
        // the sheet will see.
        doc.fontSize(8).fillColor('#cc0000').text('QR IMAGE MISSING', qrX, qrY + QR_SIZE / 2, { width: QR_SIZE, align: 'center' }).fillColor('#000000');
      }

      doc
        .fontSize(8)
        .font('Helvetica-Bold')
        .text(envelope.envelopeCode, cellX + 4, qrY + QR_SIZE + 5, { width: CELL_WIDTH - 8, align: 'center' })
        .font('Helvetica')
        .fontSize(6.5)
        .fillColor('#333333')
        .text(shortForm(batch.examination.centre), cellX + 4, qrY + QR_SIZE + 16, { width: CELL_WIDTH - 8, align: 'center' })
        .text(batch.examination.subject, cellX + 4, qrY + QR_SIZE + 25, { width: CELL_WIDTH - 8, align: 'center' })
        .text(batch.examination.examDate.toDateString(), cellX + 4, qrY + QR_SIZE + 34, { width: CELL_WIDTH - 8, align: 'center' })
        .fillColor('#000000');
    }

    doc.end();
    return finished;
  },
};
