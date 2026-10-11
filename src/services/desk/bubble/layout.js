/**
 * layout.js — where everything sits on a KaTuro bubble sheet. Pure code, in millimetres.
 *
 * The sheet maker (sheetPdf.js) and the photo reader (reader.js) both use THIS file, so a
 * bubble is read exactly where it was printed. Layout version 1 must never change once
 * sheets are printed: a new design gets a new version number, and old quizzes keep theirs.
 *
 * Frame coordinates: the origin is the centre of the top-left corner marker, x to the
 * right, y down. The four corner markers' centres are (0,0), (W,0), (W,H), (0,H).
 */

export const LAYOUT_VERSION = 1;
export const MAX_ITEMS = 100;
export const CHOICE_SETS = { 4: ['A', 'B', 'C', 'D'], 5: ['A', 'B', 'C', 'D', 'E'] };

export const BUBBLE_PAPERS = {
  a4: { label: 'A4', width: 210, height: 297 },
  letter: { label: 'Short bond (8.5 × 11 in)', width: 215.9, height: 279.4 },
  long: { label: 'Long bond (8.5 × 13 in)', width: 215.9, height: 330.2 },
  legal: { label: 'Legal (8.5 × 14 in)', width: 215.9, height: 355.6 },
};

export const PER_PAGE = [1, 2, 4, 8];
const GRID = { 1: [1, 1], 2: [1, 2], 4: [2, 2], 8: [2, 4] }; // [columns, rows] of sheets on a page
const PAGE_MARGIN = 6; // printers cannot print at the very edge
const CELL_PAD = 4; // white space between a cut line and the sheet's markers

// Sizes by how small the sheet is. marker = corner square side, bubble = circle diameter,
// pitch = distance between choices, row = distance between items, num = item-number width.
const TIERS = {
  large: { marker: 7, bubble: 5, pitch: 6.6, row: 6.6, num: 8, colGap: 4, qr: 20, font: 9 },
  medium: { marker: 6, bubble: 4.4, pitch: 5.8, row: 5.6, num: 7, colGap: 3.5, qr: 16, font: 8 },
  small: { marker: 5, bubble: 3.6, pitch: 4.7, row: 4.6, num: 5.5, colGap: 2.5, qr: 14, font: 6.5 },
};
const tierFor = (perPage) => (perPage === 1 ? TIERS.large : perPage === 8 ? TIERS.small : TIERS.medium);
const PT_MM = 0.3528;

/** The page split into sheet cells: [{ x, y, w, h }] in page millimetres, top-left first, row by row. */
export function pageCells(paper, perPage) {
  const p = BUBBLE_PAPERS[paper];
  const [cols, rows] = GRID[perPage] || [];
  if (!p || !cols) return [];
  const w = (p.width - 2 * PAGE_MARGIN) / cols;
  const h = (p.height - 2 * PAGE_MARGIN) / rows;
  const cells = [];
  for (let r = 0; r < rows; r += 1) for (let c = 0; c < cols; c += 1) cells.push({ x: PAGE_MARGIN + c * w, y: PAGE_MARGIN + r * h, w, h });
  return cells;
}

/**
 * The full geometry of one sheet.
 * → { ok: true, frame: { w, h }, tier, header, qr, bubbles: [{ item, choice, letter, x, y, r }],
 *     numbers: [{ item, x, y }], capacity, cell } or { ok: false, error, capacity }
 */
export function sheetLayout({ paper = 'a4', perPage = 4, items, choices = 4 } = {}) {
  const cells = pageCells(paper, perPage);
  const letters = CHOICE_SETS[choices];
  if (!cells.length) return { ok: false, error: 'Choose a paper size and how many sheets go on one page.', capacity: 0 };
  if (!letters) return { ok: false, error: 'Choices must be A to D or A to E.', capacity: 0 };
  const t = tierFor(perPage);
  const cell = cells[0];
  const m = t.marker;
  const contentW = cell.w - 2 * CELL_PAD;
  const contentH = cell.h - 2 * CELL_PAD;
  const frame = { w: contentW - m, h: contentH - m };

  // Header: name lines on the left, the learner's QR code on the right.
  const line = t.font * PT_MM * 1.45;
  const lines = perPage === 8 ? 3 : 4;
  const headerH = Math.max(t.qr, lines * line) + 2;
  const top = -m / 2;
  const qr = { x: frame.w - m / 2 - 2 - t.qr, y: top, size: t.qr };
  const header = { x: m / 2 + 2.5, y: top, w: qr.x - (m / 2 + 2.5) - 3, h: headerH, line, lines, font: t.font };

  // Answer grid between the header and the bottom markers.
  const gy0 = top + headerH + 2;
  const gy1 = frame.h - m / 2 - 1.5;
  const gx0 = m / 2 + 1;
  const gx1 = frame.w - m / 2 - 1;
  const colW = t.num + choices * t.pitch + t.colGap;
  const maxRows = Math.floor((gy1 - gy0) / t.row);
  const maxCols = Math.floor((gx1 - gx0 + t.colGap) / colW);
  const capacity = Math.max(0, Math.min(MAX_ITEMS, maxRows * maxCols));
  const n = Number(items);
  if (!Number.isInteger(n) || n < 1) return { ok: false, error: 'Enter the number of items (1 or more).', capacity };
  if (n > MAX_ITEMS) return { ok: false, error: `The most is ${MAX_ITEMS} items.`, capacity };
  if (n > capacity) {
    return { ok: false, error: `${n} items do not fit when ${perPage} sheet${perPage > 1 ? 's' : ''} share a page. This size holds up to ${capacity} items. Use fewer sheets per page or a bigger paper.`, capacity };
  }
  const cols = Math.ceil(n / maxRows);
  const rows = Math.ceil(n / cols);
  const gridW = cols * colW - t.colGap;
  const x0 = gx0 + (gx1 - gx0 - gridW) / 2;
  const bubbles = [];
  const numbers = [];
  for (let i = 0; i < n; i += 1) {
    const cx = x0 + Math.floor(i / rows) * colW;
    const cy = gy0 + (i % rows) * t.row + t.row / 2;
    numbers.push({ item: i + 1, x: cx + t.num - 1.2, y: cy });
    letters.forEach((letter, c) => bubbles.push({ item: i + 1, choice: c, letter, x: cx + t.num + c * t.pitch + t.pitch / 2, y: cy, r: t.bubble / 2 }));
  }
  return { ok: true, version: LAYOUT_VERSION, paper, perPage, items: n, choices, frame, tier: t, marker: m, header, qr, bubbles, numbers, capacity, cell, pad: CELL_PAD };
}

/** The most items each "sheets per page" choice holds, for the settings screen. */
export function capacities(paper, choices) {
  return Object.fromEntries(PER_PAGE.map((k) => [k, sheetLayout({ paper, perPage: k, items: 1, choices }).capacity]));
}

/**
 * Cut-and-stack order: with k sheets per page and P pages, place learner (pos * P + page)
 * at position `pos` of page `page`. Cut the whole stack at once, put pile 1 on pile 2 and
 * so on, and the sheets come out in class-list order.
 * → pages: [[sheetIndex | null, …k], …P]
 */
export function cutStackOrder(count, perPage) {
  const pages = Math.max(1, Math.ceil(count / perPage));
  return Array.from({ length: pages }, (_, page) => Array.from({ length: perPage }, (__, pos) => {
    const i = pos * pages + page;
    return i < count ? i : null;
  }));
}

/** Sheets of paper needed. */
export const paperCount = (count, perPage) => Math.ceil(Math.max(0, count) / perPage);

// ── The learner code printed in the QR code ─────────────────────
// "KT1:<set>:<nnn>" — set = 6 letters/digits naming this quiz, nnn = the learner's number
// in the list (000 = a blank sheet). Only QR "alphanumeric" characters, so it stays small.
const SET_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function newSetId(random = Math.random) {
  let s = '';
  for (let i = 0; i < 6; i += 1) s += SET_CHARS[Math.floor(random() * SET_CHARS.length)];
  return s;
}

export function sheetCode(setId, number) {
  return `KT1:${setId}:${String(number).padStart(3, '0')}`;
}

/** → { setId, number } or null. */
export function parseSheetCode(text) {
  const m = String(text || '').trim().match(/^KT1:([A-Z0-9]{6}):(\d{3})$/);
  return m ? { setId: m[1], number: Number(m[2]) } : null;
}
