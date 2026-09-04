// QR Verification & Digital Authentication sprint (Phase 1).
//
// Pure functions, deliberately no database or Express dependency here --
// keeps this independently testable (this project's own established
// pattern for exactly this reason, e.g. utils/geo.util.js,
// utils/damageClass.util.js) and keeps the actual cryptographic
// operation in one small, auditable place rather than inlined into a
// service file.
//
// Design: the QR's scanned content is a JSON envelope
// { v, envelopeId, envelopeCode, qrCode, createdAt, nonce, sig }. `sig`
// is an HMAC-SHA256 over a *canonical* (fixed key order, so signing and
// verifying always serialize identically regardless of how the object
// was constructed) JSON string of every field except itself, keyed by
// QR_SIGNING_SECRET. `qrCode` -- the same opaque random token this
// project has always stored on Envelope and looked up by -- is included
// inside the signed payload, not replaced by it: the existing lookup
// mechanism (envelopeRepository.findByQrCode) is completely unchanged,
// this adds a verifiable layer on top of it, not a second one instead
// of it.
import crypto from 'crypto';
import { env } from '../config/env.js';

export const QR_PAYLOAD_VERSION = 1;

// Fixed field order -- the whole reason this needs to be a named
// function rather than JSON.stringify(payload) directly, since object
// key order in JS is insertion order and two different call sites could
// otherwise build the same logical payload in a different order and
// produce two different (but equally "correct") signatures.
//
// Deliberately no envelopeId (the database UUID) in this payload: QR
// generation happens before the envelope row is inserted (see
// envelope.service.js's create() -- the QR must exist to be stored
// *on* that same insert), so the id genuinely doesn't exist yet at
// signing time. envelopeCode is generated upfront and is already
// guaranteed unique, so it's sufficient on its own to identify which
// envelope a QR belongs to; verification looks the real row up by
// qrCode exactly as it always has.
function canonicalPayloadString({ v, envelopeCode, qrCode, createdAt, nonce }) {
  return JSON.stringify({ v, envelopeCode, qrCode, createdAt, nonce });
}

export function signQrPayload(payload) {
  const message = canonicalPayloadString(payload);
  return crypto.createHmac('sha256', env.qrSigningSecret).update(message).digest('hex');
}

export function verifyQrSignature(payload, signature) {
  if (!signature || typeof signature !== 'string') return false;
  const expected = signQrPayload(payload);
  // Constant-time comparison -- a signature check is exactly the kind of
  // comparison where a naive === (which can return faster on an early
  // mismatching byte) leaks timing information useful to an attacker
  // trying to forge one. Both buffers must be equal length for
  // timingSafeEqual to run at all, checked first.
  const expectedBuf = Buffer.from(expected, 'hex');
  const givenBuf = Buffer.from(signature, 'hex');
  if (expectedBuf.length !== givenBuf.length) return false;
  return crypto.timingSafeEqual(expectedBuf, givenBuf);
}

// Builds the full, signed QR content string for a newly-created envelope.
// This is what actually gets encoded into the QR image (see
// utils/qrcode.util.js) -- a signed JSON envelope, not the bare
// `CHAINGUARD-{code}-{uuid}` string this project used before this
// sprint.
export function buildSignedQrContent({ envelopeCode, qrCode, createdAt }) {
  const nonce = crypto.randomBytes(12).toString('hex');
  const basePayload = { v: QR_PAYLOAD_VERSION, envelopeCode, qrCode, createdAt, nonce };
  const sig = signQrPayload(basePayload);
  return JSON.stringify({ ...basePayload, sig });
}

// Parses whatever a scanner actually read. Three real outcomes, not two
// -- a QR issued by this system before this sprint is not "invalid," it
// is a real, valid, *unsigned* legacy QR, and treating every one of
// them as tampered on this sprint's very first deploy would be a
// backward-compatibility break, not a security improvement.
export function decodeQrContent(rawText) {
  if (typeof rawText !== 'string' || rawText.length === 0) {
    return { format: 'invalid', reason: 'Empty or non-text QR content' };
  }

  // Legacy format check first -- cheap, and avoids trying (and failing)
  // to JSON.parse a plain string unnecessarily.
  if (rawText.startsWith('CHAINGUARD-') && !rawText.trim().startsWith('{')) {
    return { format: 'legacy', qrCode: rawText };
  }

  let parsed;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    return { format: 'invalid', reason: 'QR content is not valid signed JSON or a recognized legacy code' };
  }

  const { v, envelopeCode, qrCode, createdAt, nonce, sig } = parsed || {};
  if (v !== QR_PAYLOAD_VERSION || !envelopeCode || !qrCode || !createdAt || !nonce || !sig) {
    return { format: 'invalid', reason: 'Signed QR payload is missing required fields' };
  }

  const signatureValid = verifyQrSignature({ v, envelopeCode, qrCode, createdAt, nonce }, sig);
  return { format: 'signed', qrCode, envelopeCode, createdAt, nonce, signatureValid };
}
