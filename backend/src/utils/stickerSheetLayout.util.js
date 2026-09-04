// Pure layout math for the QR sticker sheet (Phase 3). Extracted from
// envelopeBatchPdfService.js (which can't be imported standalone in
// this sandbox -- it transitively pulls in config/db.js's PrismaClient)
// so this genuinely pure geometry has real, permanent tests. Two real
// bugs were caught tracing this exact math by hand while building it:
// applying gridTop only to row 0 (rows 1-3 on page 1 would have
// overlapped the header), and using a fixed row count that overflowed
// page 1's last row past the page boundary once the header's real
// height was accounted for. Both are why this file exists as its own
// tested unit rather than trusted inline.
export const PAGE_MARGIN = 36;
export const COLS = 3;
// Reduced from 4 to 3 (Architectural Integration sprint refinement):
// each sticker now carries 4 lines of human-readable metadata beneath
// the QR (envelope ID, centre, subject, exam date), not just 2 -- 4
// rows didn't leave enough vertical room per cell for that; 3 does,
// comfortably, verified below.
export const ROWS = 3;
export const PAGE_WIDTH = 612;
export const PAGE_HEIGHT = 792;
export const CELL_WIDTH = (PAGE_WIDTH - PAGE_MARGIN * 2) / COLS;
export const CELL_HEIGHT = (PAGE_HEIGHT - PAGE_MARGIN * 2) / ROWS;

// How many full rows actually fit starting from a given vertical
// position on the page (page 1's usable height is reduced by the
// header; every later page starts fresh at PAGE_MARGIN).
export function rowsThatFit(gridTop) {
  return Math.max(0, Math.floor((PAGE_HEIGHT - PAGE_MARGIN - gridTop) / CELL_HEIGHT));
}

// Given a flat list of N items and a starting gridTop for page 1,
// returns the (col, row, page, cellX, cellY) for every item -- the same
// placement loop envelopeBatchPdfService.js runs, as a pure function so
// its result can be asserted on directly.
export function layoutGrid(itemCount, firstPageGridTop) {
  const placements = [];
  let col = 0;
  let row = 0;
  let page = 1;
  let currentGridTop = firstPageGridTop;
  let rowsOnThisPage = rowsThatFit(currentGridTop);

  for (let i = 0; i < itemCount; i++) {
    if (row >= rowsOnThisPage) {
      page++;
      row = 0;
      col = 0;
      currentGridTop = PAGE_MARGIN;
      rowsOnThisPage = ROWS;
    }

    const cellX = PAGE_MARGIN + col * CELL_WIDTH;
    const cellY = currentGridTop + row * CELL_HEIGHT;
    placements.push({ index: i, page, col, row, cellX, cellY, cellBottom: cellY + CELL_HEIGHT });

    col++;
    if (col >= COLS) {
      col = 0;
      row++;
    }
  }

  return placements;
}
