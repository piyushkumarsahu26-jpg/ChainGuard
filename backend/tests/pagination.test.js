import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getPagination, buildPaginationMeta } from '../src/utils/pagination.util.js';

test('getPagination applies defaults', () => {
  const { page, limit, skip } = getPagination({});
  assert.equal(page, 1);
  assert.equal(limit, 20);
  assert.equal(skip, 0);
});

test('getPagination caps limit at 100', () => {
  const { limit } = getPagination({ limit: '500' });
  assert.equal(limit, 100);
});

test('buildPaginationMeta computes totalPages', () => {
  const meta = buildPaginationMeta({ page: 1, limit: 10, total: 25 });
  assert.equal(meta.totalPages, 3);
});
