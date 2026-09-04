import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hashPassword, comparePassword } from '../src/utils/password.util.js';

test('hashPassword produces a bcrypt hash, not the plaintext', async () => {
  const hash = await hashPassword('CorrectHorseBatteryStaple1!');
  assert.notEqual(hash, 'CorrectHorseBatteryStaple1!');
  assert.match(hash, /^\$2[aby]\$/); // bcrypt hash prefix
});

test('comparePassword returns true for the correct password', async () => {
  const hash = await hashPassword('CorrectHorseBatteryStaple1!');
  const matches = await comparePassword('CorrectHorseBatteryStaple1!', hash);
  assert.equal(matches, true);
});

test('comparePassword returns false for an incorrect password', async () => {
  const hash = await hashPassword('CorrectHorseBatteryStaple1!');
  const matches = await comparePassword('WrongPassword!', hash);
  assert.equal(matches, false);
});
