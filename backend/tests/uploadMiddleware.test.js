// Tests for middleware/upload.middleware.js's extensionForMimeType --
// the fix for a real vulnerability found during the Final Verification
// Sprint's security audit: the saved file's extension previously came
// from file.originalname (fully client-controlled, never validated),
// letting a client pass the mimetype allowlist while choosing an
// arbitrary extension for the actual (potentially malicious) content.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extensionForMimeType } from '../src/middleware/upload.middleware.js';

test('extensionForMimeType: every allowed mimetype maps to its own real extension', () => {
  assert.equal(extensionForMimeType('image/jpeg'), '.jpg');
  assert.equal(extensionForMimeType('image/png'), '.png');
  assert.equal(extensionForMimeType('image/webp'), '.webp');
  assert.equal(extensionForMimeType('video/mp4'), '.mp4');
  assert.equal(extensionForMimeType('application/pdf'), '.pdf');
});

test('extensionForMimeType: an unrecognized mimetype never fabricates an extension', () => {
  // In real use fileFilter rejects these before extensionForMimeType is
  // ever reached -- this asserts the fallback itself is still safe on
  // its own, not just safe because something else happens to gate it.
  assert.equal(extensionForMimeType('text/html'), '');
  assert.equal(extensionForMimeType('image/svg+xml'), '');
  assert.equal(extensionForMimeType('application/x-php'), '');
  assert.equal(extensionForMimeType(''), '');
  assert.equal(extensionForMimeType(undefined), '');
});

test('extensionForMimeType: the result never depends on anything but the mimetype argument itself (no path from originalname)', () => {
  // Regression guard for the exact vulnerability: this function takes
  // only a mimetype, never a filename -- there is no argument here an
  // attacker-controlled originalname could flow through even if this
  // function were called differently elsewhere.
  assert.equal(extensionForMimeType.length, 1);
});
