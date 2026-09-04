// Tests for config/env.js's resolveCookieSecure -- the fix for a real
// bug found during the Final Verification Sprint's security audit:
// cookie.secure previously defaulted to false unless COOKIE_SECURE=true
// was explicitly set, and .env.example itself shipped with
// COOKIE_SECURE=false hardcoded -- meaning a real deployment copying
// that file as-is would send the refresh-token cookie over plain HTTP
// in production with no warning, even after this fix, unless
// .env.example's own default was also corrected (it was).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveCookieSecure } from '../src/config/env.js';

test('resolveCookieSecure: defaults to true in production with no explicit override', () => {
  assert.equal(resolveCookieSecure('production', null), true);
  assert.equal(resolveCookieSecure('production', undefined), true);
});

test('resolveCookieSecure: defaults to false in development with no explicit override', () => {
  assert.equal(resolveCookieSecure('development', null), false);
});

test('resolveCookieSecure: defaults to false when NODE_ENV is unset entirely', () => {
  assert.equal(resolveCookieSecure(undefined, null), false);
  assert.equal(resolveCookieSecure('', null), false);
});

test('resolveCookieSecure: an explicit COOKIE_SECURE=true overrides development default', () => {
  assert.equal(resolveCookieSecure('development', 'true'), true);
});

test('resolveCookieSecure: an explicit COOKIE_SECURE=false overrides production default', () => {
  // Allowed -- an operator can deliberately choose this for a real
  // reason -- but this is the exact override .env.example must never
  // ship pre-set, which was the actual bug.
  assert.equal(resolveCookieSecure('production', 'false'), false);
});

test('resolveCookieSecure: only the exact string "true" is treated as true, matching how every env var in this file is parsed', () => {
  assert.equal(resolveCookieSecure('development', 'TRUE'), false);
  assert.equal(resolveCookieSecure('development', '1'), false);
  assert.equal(resolveCookieSecure('development', 'yes'), false);
});
