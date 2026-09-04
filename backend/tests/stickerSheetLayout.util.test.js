// Tests for utils/stickerSheetLayout.util.js. Pure geometry, no
// database -- the same math independently verified by generating a real
// 30-envelope PDF and checking its actual page count during
// construction; these are the permanent, re-runnable version of that
// same verification.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rowsThatFit, layoutGrid, PAGE_MARGIN, PAGE_HEIGHT, CELL_HEIGHT, ROWS } from '../src/utils/stickerSheetLayout.util.js';

test('rowsThatFit: a fresh page (gridTop = PAGE_MARGIN) fits the full row count', () => {
  assert.equal(rowsThatFit(PAGE_MARGIN), ROWS);
});

test('rowsThatFit: a page with a header eating real vertical space fits fewer rows', () => {
  // Regression guard for the exact bug found while building this: using
  // a fixed ROWS constant regardless of gridTop overflowed the last row
  // off the bottom of page 1 once a real header's height was involved.
  const headerGridTop = 73; // roughly what the real header in envelopeBatchPdfService.js produces
  const fitted = rowsThatFit(headerGridTop);
  assert.ok(fitted < ROWS, `expected fewer than ${ROWS} rows to fit below a real header, got ${fitted}`);
  assert.equal(fitted, 2); // verified via direct computation after ROWS was reduced to 3 for the 4-line metadata sticker refinement
});

test('layoutGrid: no cell ever extends past the page boundary, on any page', () => {
  // The exact assertion the live-generated 30-envelope PDF's numbers
  // satisfied (maxBottomSeen === 756 === PAGE_HEIGHT - PAGE_MARGIN)
  // during construction -- now checked for every placement, not just
  // the last one, and across several different header heights.
  for (const headerGridTop of [40, 73, 100, 150]) {
    const placements = layoutGrid(37, headerGridTop);
    for (const p of placements) {
      assert.ok(p.cellBottom <= PAGE_HEIGHT - PAGE_MARGIN + 0.01, `placement ${p.index} on page ${p.page} overflows: cellBottom=${p.cellBottom}`);
    }
  }
});

test('layoutGrid: rows 1-3 on page 1 use the same gridTop as row 0, not the plain margin', () => {
  // Regression guard for the *other* real bug found while building
  // this: an earlier version only applied the header-adjusted gridTop
  // to row 0, so rows 1-3 on page 1 would have been drawn too high,
  // overlapping the header.
  const headerGridTop = 100;
  const placements = layoutGrid(12, headerGridTop);
  const page1Rows = [...new Set(placements.filter((p) => p.page === 1).map((p) => p.row))].sort();
  for (const row of page1Rows) {
    const expectedY = headerGridTop + row * CELL_HEIGHT;
    const actual = placements.find((p) => p.page === 1 && p.row === row).cellY;
    assert.equal(actual, expectedY, `row ${row} on page 1 should start at ${expectedY}, got ${actual}`);
  }
});

test('layoutGrid: 30 envelopes with a real header span exactly 4 pages at the reduced 3-row layout (verified via direct computation, not assumed)', () => {
  const placements = layoutGrid(30, 73);
  const pagesUsed = new Set(placements.map((p) => p.page));
  assert.equal(pagesUsed.size, 4);
  assert.equal(placements.length, 30);
});

test('layoutGrid: every envelope index appears exactly once, none skipped or duplicated', () => {
  const placements = layoutGrid(47, 73);
  const indices = placements.map((p) => p.index).sort((a, b) => a - b);
  assert.deepEqual(indices, Array.from({ length: 47 }, (_, i) => i));
});

test('layoutGrid: a page after the first always starts at PAGE_MARGIN, not the header offset', () => {
  const placements = layoutGrid(20, 73);
  const page2FirstRow = placements.find((p) => p.page === 2 && p.row === 0);
  assert.equal(page2FirstRow.cellY, PAGE_MARGIN);
});
