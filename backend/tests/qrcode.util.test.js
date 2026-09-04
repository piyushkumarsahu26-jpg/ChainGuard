// Tests for utils/qrcode.util.js's generateEnvelopeQr — genuinely
// testable without a database (real file I/O only), unlike
// custody.service.js's methods, which are DB-orchestration end to end
// (same category as gps.service.js's later methods — see
// docs/chainguard-sprint6-geofencing-report.md for that established
// precedent: DB-heavy service code isn't unit-tested in isolation here,
// pure/file-only logic is).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs/promises';
import { generateEnvelopeQr } from '../src/utils/qrcode.util.js';

test('generateEnvelopeQr returns a qrCode token containing the envelope code', async () => {
  const { qrCode } = await generateEnvelopeQr('TEST-ENV-0001');
  assert.match(qrCode, /^CHAINGUARD-TEST-ENV-0001-/);
});

test('generateEnvelopeQr produces a unique token on every call, even for the same envelope code', async () => {
  const first = await generateEnvelopeQr('TEST-ENV-0002');
  const second = await generateEnvelopeQr('TEST-ENV-0002');
  assert.notEqual(first.qrCode, second.qrCode);
});

// Final Verification Sprint fix: envelopeCode is used to build a file
// path (path.join(uploadDir, `${envelopeCode}.png`)) with no
// sanitization before this fix. Not currently reachable with untrusted
// input (envelope.service.js's create() always generates it itself),
// but the function itself should reject anything that looks like a
// path traversal attempt regardless of who calls it or how.
test('generateEnvelopeQr rejects an envelopeCode containing path traversal sequences', async () => {
  await assert.rejects(() => generateEnvelopeQr('../../etc/passwd'));
  await assert.rejects(() => generateEnvelopeQr('..\\..\\windows\\system32'));
  await assert.rejects(() => generateEnvelopeQr('foo/bar'));
  await assert.rejects(() => generateEnvelopeQr('foo\\bar'));
});

test('generateEnvelopeQr still accepts a normal, real envelope code', async () => {
  // Regression guard alongside the rejection tests above -- confirms
  // the fix didn't become overly strict and start rejecting legitimate
  // codes too.
  const { qrCode } = await generateEnvelopeQr('ENV-1234567890-ABCDEF');
  assert.match(qrCode, /^CHAINGUARD-ENV-1234567890-ABCDEF-/);
});

test('generateEnvelopeQr writes a real, non-empty PNG file at the returned path', async () => {
  const { qrImagePath } = await generateEnvelopeQr('TEST-ENV-0003');
  const fullPath = qrImagePath.startsWith('/') ? qrImagePath : `${process.cwd()}/${qrImagePath}`;
  const stat = await fs.stat(fullPath);
  assert.ok(stat.size > 0, 'expected a non-empty file');

  const buffer = await fs.readFile(fullPath);
  // PNG magic bytes — confirms this is a real, valid PNG, not just a
  // non-empty file that happens to exist.
  assert.equal(buffer[0], 0x89);
  assert.equal(buffer.toString('ascii', 1, 4), 'PNG');
});
