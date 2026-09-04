// Tests for utils/damageClass.util.js -- Integration Sprint 3's shared
// classification, extracted from riskScore.service.js (Sprint 8) so it's
// defined once and reused, not duplicated, across risk scoring, alert
// generation, and seal-status updates. Pure functions, no database.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { damageSeverity, isTamperClass, sealStatusForPrediction, severityForDetection } from '../src/utils/damageClass.util.js';

test('damageSeverity: SAFE and SEALED (the two models this project has used) are both zero', () => {
  assert.equal(damageSeverity('SAFE'), 0);
  assert.equal(damageSeverity('SEALED'), 0);
  assert.equal(damageSeverity('sealed'), 0); // case-insensitive, matching the lowercase-model precedent
});

test('damageSeverity: every real damage class is strictly greater than zero', () => {
  for (const cls of ['TAPED', 'PARTIAL_DAMAGE', 'OPENED', 'CRUSHED', 'TORN']) {
    assert.ok(damageSeverity(cls) > 0, `expected ${cls} > 0`);
  }
});

test('damageSeverity: an unrecognized class defaults to 0, not undefined/NaN', () => {
  assert.equal(damageSeverity('SOMETHING_UNEXPECTED'), 0);
  assert.equal(damageSeverity(null), 0);
  assert.equal(damageSeverity(undefined), 0);
});

test('isTamperClass: matches the sign of damageSeverity exactly for every class', () => {
  for (const cls of ['SAFE', 'SEALED', 'TAPED', 'PARTIAL_DAMAGE', 'OPENED', 'CRUSHED', 'TORN', 'UNKNOWN']) {
    assert.equal(isTamperClass(cls), damageSeverity(cls) > 0, `mismatch for ${cls}`);
  }
});

test('sealStatusForPrediction: SAFE/SEALED means no change (null)', () => {
  assert.equal(sealStatusForPrediction('SAFE'), null);
  assert.equal(sealStatusForPrediction('SEALED'), null);
});

test('sealStatusForPrediction: OPENED maps to OPENED specifically, not TAMPERED', () => {
  assert.equal(sealStatusForPrediction('OPENED'), 'OPENED');
});

test('sealStatusForPrediction: every other real damage class maps to TAMPERED', () => {
  for (const cls of ['TAPED', 'PARTIAL_DAMAGE', 'CRUSHED', 'TORN']) {
    assert.equal(sealStatusForPrediction(cls), 'TAMPERED', `expected TAMPERED for ${cls}`);
  }
});

test('sealStatusForPrediction: an unrecognized class means no change, not a crash', () => {
  assert.equal(sealStatusForPrediction('SOMETHING_UNEXPECTED'), null);
});

// --- Integration Sprint 4: severityForDetection ---

test('severityForDetection: TORN (severity 1.0) at high confidence is CRITICAL', () => {
  assert.equal(severityForDetection('TORN', 0.9), 'CRITICAL'); // 1.0 * 0.9 = 0.9 >= 0.8
});

test('severityForDetection: TAPED (severity 0.4) at the same high confidence is only MEDIUM, not CRITICAL', () => {
  // This is the exact real bug this sprint fixed: before, both TORN and
  // TAPED at 0.9 confidence would have scored identically (confidence-only
  // logic). Now they genuinely differ, reflecting real severity.
  assert.equal(severityForDetection('TAPED', 0.9), 'MEDIUM'); // 0.4 * 0.9 = 0.36 < 0.5
});

test('severityForDetection: a class/confidence combination in the middle band is HIGH', () => {
  assert.equal(severityForDetection('OPENED', 0.9), 'HIGH'); // 0.7 * 0.9 = 0.63, between 0.5 and 0.8
});

test('severityForDetection: the exact boundaries are inclusive as documented (>=0.8 CRITICAL, >=0.5 HIGH)', () => {
  // CRUSHED has severity 0.85; construct confidences that land exactly on
  // the documented thresholds to confirm they're inclusive, not exclusive.
  const confidenceForExactly = (targetCombined) => targetCombined / damageSeverity('CRUSHED');
  assert.equal(severityForDetection('CRUSHED', confidenceForExactly(0.8)), 'CRITICAL');
  assert.equal(severityForDetection('CRUSHED', confidenceForExactly(0.5)), 'HIGH');
});

test('severityForDetection: severity strictly increases with confidence for a fixed class', () => {
  const low = severityForDetection('TORN', 0.3);
  const high = severityForDetection('TORN', 0.95);
  const rank = { MEDIUM: 0, HIGH: 1, CRITICAL: 2 };
  assert.ok(rank[high] >= rank[low], `expected ${high} >= ${low} in severity rank`);
});
