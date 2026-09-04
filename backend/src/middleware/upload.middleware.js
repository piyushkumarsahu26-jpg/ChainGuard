// Multer configuration for evidence/detection image uploads.
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { randomUUID } from 'crypto';
import { env } from '../config/env.js';
import { ApiError } from '../utils/apiError.js';

const uploadRoot = path.resolve(process.cwd(), env.upload.dir, 'evidence');
fs.mkdirSync(uploadRoot, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadRoot),
  filename: (req, file, cb) => {
    // Final Verification Sprint fix: the extension now comes from the
    // validated mimetype, not file.originalname (fully client-
    // controlled, and never checked against anything). Previously an
    // attacker could pass fileFilter by claiming mimetype: image/jpeg
    // while setting originalname to e.g. "xss.svg" and uploading real
    // SVG/script content -- the saved file kept the attacker-chosen
    // .svg extension regardless of what was actually validated, and
    // express.static() serves Content-Type based on that extension.
    // extensionForMimeType() is the single source of truth for the
    // extension a given validated mimetype is allowed to produce.
    const ext = extensionForMimeType(file.mimetype);
    cb(null, `${randomUUID()}${ext}`);
  },
});

const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'application/pdf'];

// One extension per allowed mimetype -- deliberately not derived from
// file.originalname (see the fix comment above for why that was unsafe).
const mimeTypeExtension = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'video/mp4': '.mp4',
  'application/pdf': '.pdf',
};
export function extensionForMimeType(mimetype) {
  return mimeTypeExtension[mimetype] || ''; // unreachable in practice -- fileFilter rejects anything not in allowedMimeTypes before this ever runs, but never fabricate an extension for something unrecognized
}

function fileFilter(req, file, cb) {
  if (!allowedMimeTypes.includes(file.mimetype)) {
    return cb(ApiError.badRequest(`Unsupported file type: ${file.mimetype}`));
  }
  cb(null, true);
}

export const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: env.upload.maxSizeMb * 1024 * 1024 },
});
