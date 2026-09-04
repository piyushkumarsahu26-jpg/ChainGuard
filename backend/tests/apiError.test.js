import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ApiError } from '../src/utils/apiError.js';

test('ApiError.notFound sets statusCode 404', () => {
  const err = ApiError.notFound('Not here');
  assert.equal(err.statusCode, 404);
  assert.equal(err.message, 'Not here');
});

test('ApiError.unauthorized defaults message', () => {
  const err = ApiError.unauthorized();
  assert.equal(err.statusCode, 401);
  assert.equal(err.message, 'Unauthorized');
});
