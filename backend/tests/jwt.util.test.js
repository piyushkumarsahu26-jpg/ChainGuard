// Tests for utils/jwt.util.js -- found during the Final Verification
// Sprint's security audit to have no prior test coverage despite being
// the entire basis of authentication. Standalone-testable: env.js has
// no Prisma dependency.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import { signAccessToken, signRefreshToken, verifyAccessToken, verifyRefreshToken } from '../src/utils/jwt.util.js';
import { env } from '../src/config/env.js';

test('signAccessToken/verifyAccessToken: real round trip preserves payload', () => {
  const token = signAccessToken({ id: 'user-1', role: 'ADMINISTRATOR', email: 'a@b.com' });
  const decoded = verifyAccessToken(token);
  assert.equal(decoded.id, 'user-1');
  assert.equal(decoded.role, 'ADMINISTRATOR');
  assert.equal(decoded.email, 'a@b.com');
});

test('signRefreshToken/verifyRefreshToken: real round trip preserves payload', () => {
  const token = signRefreshToken({ id: 'user-2' });
  const decoded = verifyRefreshToken(token);
  assert.equal(decoded.id, 'user-2');
});

test('verifyAccessToken: rejects a token signed with a different secret', () => {
  const forged = jwt.sign({ id: 'attacker', role: 'ADMINISTRATOR' }, 'wrong-secret-entirely', { algorithm: 'HS256' });
  assert.throws(() => verifyAccessToken(forged));
});

test('verifyAccessToken: rejects an expired token', () => {
  const expired = jwt.sign({ id: 'user-1' }, env.jwt.accessSecret, { algorithm: 'HS256', expiresIn: '-1s' });
  assert.throws(() => verifyAccessToken(expired), /expired/i);
});

test('verifyAccessToken: rejects a tampered payload even with a superficially valid structure', () => {
  const real = signAccessToken({ id: 'user-1', role: 'VIEWER' });
  const [header, , signature] = real.split('.');
  // Swap in a forged payload claiming an elevated role, keeping the
  // original (now-mismatched) signature -- exactly what an attacker
  // with no knowledge of the secret would try.
  const forgedPayload = Buffer.from(JSON.stringify({ id: 'user-1', role: 'ADMINISTRATOR' })).toString('base64url');
  const tampered = `${header}.${forgedPayload}.${signature}`;
  assert.throws(() => verifyAccessToken(tampered));
});

test('verifyAccessToken: rejects an alg:none token (confirms explicit algorithm pinning actually works, not just relying on library defaults)', () => {
  // Constructs a real alg:none JWT by hand -- jwt.sign() itself refuses
  // to produce one, so this simulates what a forged token would
  // actually look like on the wire.
  const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({ id: 'attacker', role: 'ADMINISTRATOR' })).toString('base64url');
  const noneToken = `${header}.${payload}.`;
  assert.throws(() => verifyAccessToken(noneToken));
});

test('verifyAccessToken: rejects a refresh token presented as an access token (different secrets)', () => {
  const refreshToken = signRefreshToken({ id: 'user-1' });
  assert.throws(() => verifyAccessToken(refreshToken));
});
