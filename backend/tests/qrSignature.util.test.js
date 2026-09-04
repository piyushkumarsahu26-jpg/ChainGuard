import { test } from 'node:test';
import assert from 'node:assert/strict';
import { signQrPayload, verifyQrSignature, buildSignedQrContent, decodeQrContent, QR_PAYLOAD_VERSION } from '../src/utils/qrSignature.util.js';

const SAMPLE = { v: QR_PAYLOAD_VERSION, envelopeCode: 'CG-2026-0001', qrCode: 'CHAINGUARD-CG-2026-0001-abc', createdAt: '2026-08-06T00:00:00.000Z', nonce: 'deadbeef' };

test('signQrPayload is deterministic for the same payload', () => {
  assert.equal(signQrPayload(SAMPLE), signQrPayload({ ...SAMPLE }));
});

test('signQrPayload does not depend on key insertion order', () => {
  const reordered = { nonce: SAMPLE.nonce, createdAt: SAMPLE.createdAt, qrCode: SAMPLE.qrCode, envelopeCode: SAMPLE.envelopeCode, v: SAMPLE.v };
  assert.equal(signQrPayload(SAMPLE), signQrPayload(reordered));
});

test('a real signature verifies successfully', () => {
  const sig = signQrPayload(SAMPLE);
  assert.equal(verifyQrSignature(SAMPLE, sig), true);
});

test('changing any single field invalidates the signature -- this is the actual "cannot forge by reusing the envelope ID" guarantee', () => {
  const sig = signQrPayload(SAMPLE);
  for (const field of ['envelopeCode', 'qrCode', 'createdAt', 'nonce']) {
    const tampered = { ...SAMPLE, [field]: SAMPLE[field] + '-tampered' };
    assert.equal(verifyQrSignature(tampered, sig), false, `expected signature to fail after tampering with ${field}`);
  }
});

test('a signature from a different secret does not verify (simulates a forged QR with a guessed/copied envelope ID)', () => {
  // Can't easily swap env.qrSigningSecret mid-test without reaching into
  // the module's own import of env -- instead, construct a garbage
  // signature of the right shape/length and confirm it's rejected,
  // which is the actual behavior a forged signature would hit.
  const sig = signQrPayload(SAMPLE);
  const forged = sig.slice(0, -2) + (sig.slice(-2) === '00' ? '11' : '00');
  assert.equal(verifyQrSignature(SAMPLE, forged), false);
});

test('verifyQrSignature rejects a missing or malformed signature rather than throwing', () => {
  assert.equal(verifyQrSignature(SAMPLE, null), false);
  assert.equal(verifyQrSignature(SAMPLE, ''), false);
  assert.equal(verifyQrSignature(SAMPLE, 'not-hex-!!'.repeat(10)), false);
  assert.equal(verifyQrSignature(SAMPLE, 'short'), false);
});

test('buildSignedQrContent produces content that decodeQrContent recognizes as validly signed', () => {
  const content = buildSignedQrContent({ envelopeCode: 'CG-2026-0099', qrCode: 'CHAINGUARD-CG-2026-0099-xyz', createdAt: new Date().toISOString() });
  const decoded = decodeQrContent(content);
  assert.equal(decoded.format, 'signed');
  assert.equal(decoded.signatureValid, true);
  assert.equal(decoded.envelopeCode, 'CG-2026-0099');
});

test('buildSignedQrContent generates a different nonce (and therefore signature) on every call, even for the same envelope', () => {
  const args = { envelopeCode: 'CG-1', qrCode: 'CHAINGUARD-CG-1-a', createdAt: '2026-01-01T00:00:00.000Z' };
  const first = JSON.parse(buildSignedQrContent(args));
  const second = JSON.parse(buildSignedQrContent(args));
  assert.notEqual(first.nonce, second.nonce);
  assert.notEqual(first.sig, second.sig);
});

test('decodeQrContent recognizes the pre-sprint legacy plain-string format as a distinct, valid case -- not "invalid"', () => {
  const decoded = decodeQrContent('CHAINGUARD-CG-2026-0001-abc123def456');
  assert.equal(decoded.format, 'legacy');
  assert.equal(decoded.qrCode, 'CHAINGUARD-CG-2026-0001-abc123def456');
});

test('decodeQrContent rejects empty, garbage, and structurally-incomplete content without throwing', () => {
  assert.equal(decodeQrContent('').format, 'invalid');
  assert.equal(decodeQrContent('not json and not a legacy code').format, 'invalid');
  assert.equal(decodeQrContent('{"v":1}').format, 'invalid'); // missing required fields
  assert.equal(decodeQrContent(null).format, 'invalid');
  assert.equal(decodeQrContent(undefined).format, 'invalid');
});

test('decodeQrContent detects a tampered JSON payload (a field edited after signing) as signed-but-invalid, not silently valid', () => {
  const content = buildSignedQrContent({ envelopeCode: 'CG-1', qrCode: 'CHAINGUARD-CG-1-a', createdAt: '2026-01-01T00:00:00.000Z' });
  const parsed = JSON.parse(content);
  parsed.envelopeCode = 'CG-attacker-substituted'; // simulates forging a new QR that reuses a copied signature but a different envelope
  const decoded = decodeQrContent(JSON.stringify(parsed));
  assert.equal(decoded.format, 'signed');
  assert.equal(decoded.signatureValid, false);
});

test('decodeQrContent rejects an unsupported/future version number', () => {
  const content = buildSignedQrContent({ envelopeCode: 'CG-1', qrCode: 'CHAINGUARD-CG-1-a', createdAt: '2026-01-01T00:00:00.000Z' });
  const parsed = JSON.parse(content);
  parsed.v = 999;
  const decoded = decodeQrContent(JSON.stringify(parsed));
  assert.equal(decoded.format, 'invalid');
});
