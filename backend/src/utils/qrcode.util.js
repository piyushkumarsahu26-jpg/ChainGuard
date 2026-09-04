// QR code generation helpers for Envelope tracking.
import QRCode from 'qrcode';
import { randomUUID } from 'crypto';
import path from 'path';
import fs from 'fs/promises';
import { env } from '../config/env.js';
import { buildSignedQrContent } from './qrSignature.util.js';

// Generates a unique QR payload/token for an envelope and writes a PNG
// image to the uploads directory. Returns { qrCode, qrImagePath }.
//
// QR Verification & Digital Authentication sprint: `qrCode` itself --
// the opaque random token stored on Envelope and looked up by
// envelopeRepository.findByQrCode(), completely unchanged -- is now
// wrapped in a signed JSON envelope (utils/qrSignature.util.js) before
// being encoded into the actual QR *image*. The database lookup
// mechanism is identical to before this sprint; what changed is that
// the printed/scanned artifact now carries a verifiable signature
// alongside that token, not instead of it.
export async function generateEnvelopeQr(envelopeCode) {
  // Final Verification Sprint fix: this envelopeCode is currently
  // always system-generated (envelope.service.js's create(), the only
  // caller, builds it as ENV-{timestamp}-{random} and never accepts it
  // from a request), so this isn't exploitable today -- but the
  // function itself shouldn't depend on that being true forever.
  // Rejecting anything containing a path separator or traversal
  // sequence here means this stays safe even if a future caller passes
  // something less trusted.
  if (/[/\\]|\.\./.test(envelopeCode)) {
    throw new Error(`Invalid envelopeCode for QR generation: ${envelopeCode}`);
  }

  const qrCode = `CHAINGUARD-${envelopeCode}-${randomUUID()}`;
  const uploadDir = path.resolve(process.cwd(), env.upload.dir, 'qrcodes');
  await fs.mkdir(uploadDir, { recursive: true });

  const fileName = `${envelopeCode}.png`;
  const filePath = path.join(uploadDir, fileName);

  const signedContent = buildSignedQrContent({
    envelopeCode,
    qrCode,
    createdAt: new Date().toISOString(),
  });

  await QRCode.toFile(filePath, signedContent, {
    errorCorrectionLevel: 'H',
    width: 400,
  });

  const qrImagePath = path.join(env.upload.dir, 'qrcodes', fileName).replace(/\\/g, '/');
  return { qrCode, qrImagePath };
}
