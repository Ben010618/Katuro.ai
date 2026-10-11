import { describe, it, expect } from 'vitest';
import {
  sheetLayout, capacities, cutStackOrder, paperCount, sheetCode, parseSheetCode, newSetId, MAX_ITEMS, BUBBLE_PAPERS, PER_PAGE,
} from './layout';
import { qrModules, sheetsOf, buildBubbleSheetsPdf } from './sheetPdf';
import { readSheet, homography } from './reader';

/**
 * A pretend phone photo of a filled-in sheet: the layout drawn in millimetres, seen
 * through a perspective (tilted phone), with uneven light, noise and a background.
 * marks: { item: letter | [letters] | { letter, gray } }
 */
function photo(layout, { code, marks = {}, corners, width = 900, height = 1250, rotate180 = false }) {
  const F = layout.frame;
  const m = layout.marker;
  const toFrame = homography(corners, [[0, 0], [F.w, 0], [F.w, F.h], [0, F.h]]);
  const mods = qrModules(code);
  const mod = layout.qr.size / mods.length;
  const shade = new Map();
  for (const [item, v] of Object.entries(marks)) {
    for (const one of [].concat(v)) {
      const letter = typeof one === 'string' ? one : one.letter;
      shade.set(`${item}:${letter}`, typeof one === 'string' ? 70 : one.gray);
    }
  }
  const hash = new Map();
  for (const b of layout.bubbles) {
    for (const dx of [-1, 0, 1]) for (const dy of [-1, 0, 1]) {
      const k = `${Math.floor(b.x / 3) + dx},${Math.floor(b.y / 3) + dy}`;
      if (!hash.has(k)) hash.set(k, []);
      hash.get(k).push(b);
    }
  }
  const ink = (x, y) => {
    if (x < -m / 2 - 3 || y < -m / 2 - 3 || x > F.w + m / 2 + 3 || y > F.h + m / 2 + 3) return 110; // table
    for (const [cx, cy] of [[0, 0], [F.w, 0], [F.w, F.h], [0, F.h]]) if (Math.abs(x - cx) <= m / 2 && Math.abs(y - cy) <= m / 2) return 20;
    const q = layout.qr;
    if (x >= q.x && y >= q.y && x < q.x + q.size && y < q.y + q.size) return mods[Math.floor((y - q.y) / mod)][Math.floor((x - q.x) / mod)] ? 20 : 238;
    for (const b of hash.get(`${Math.floor(x / 3)},${Math.floor(y / 3)}`) || []) {
      const d = Math.hypot(x - b.x, y - b.y);
      const s = shade.get(`${b.item}:${b.letter}`);
      if (s !== undefined && d <= b.r * 0.9) return s;
      if (Math.abs(d - b.r) <= 0.13) return 70;
    }
    return 238;
  };
  const gray = new Uint8Array(width * height);
  let seed = 7;
  const noise = () => { seed = (seed * 16807) % 2147483647; return (seed / 2147483647 - 0.5) * 14; };
  for (let py = 0; py < height; py += 1) {
    for (let px = 0; px < width; px += 1) {
      const [x, y] = toFrame(px + 0.5, py + 0.5);
      const light = 0.75 + 0.25 * (px / width);
      gray[py * width + px] = Math.max(0, Math.min(255, ink(x, y) * light + noise()));
    }
  }
  if (rotate180) gray.reverse();
  return { gray, width, height };
}

const tilted = [[120, 140], [790, 95], [830, 1150], [70, 1110]];

describe('bubble sheet layout', () => {
  it('every paper and sheets-per-page choice fits its items inside the corner markers, clear of the name lines and the QR code', () => {
    for (const paper of Object.keys(BUBBLE_PAPERS)) for (const choices of [4, 5]) for (const perPage of PER_PAGE) {
      const cap = capacities(paper, choices)[perPage];
      expect(cap, `${paper} ${perPage}`).toBeGreaterThanOrEqual(perPage === 8 ? 14 : 34);
      const L = sheetLayout({ paper, perPage, items: cap, choices });
      expect(L.ok).toBe(true);
      expect(L.bubbles).toHaveLength(cap * choices);
      for (const b of L.bubbles) {
        expect(b.x - b.r).toBeGreaterThan(L.marker / 2);
        expect(b.x + b.r).toBeLessThan(L.frame.w - L.marker / 2);
        expect(b.y - b.r).toBeGreaterThan(L.header.y + L.header.h);
        expect(b.y + b.r).toBeLessThan(L.frame.h - L.marker / 2);
      }
      expect(L.header.x + L.header.w).toBeLessThan(L.qr.x);
      expect(sheetLayout({ paper, perPage, items: cap + 1, choices }).ok).toBe(false);
    }
  });

  it('A4 holds 4 sheets of up to 38 items; too many items or a bad setting is explained, not printed', () => {
    expect(capacities('a4', 4)).toEqual({ 1: 100, 2: 95, 4: 38, 8: 24 });
    expect(sheetLayout({ paper: 'a4', perPage: 4, items: 39, choices: 4 }).error).toMatch(/holds up to 38 items/);
    expect(sheetLayout({ paper: 'a4', perPage: 1, items: MAX_ITEMS + 1, choices: 4 }).error).toMatch(/most is 100/);
    expect(sheetLayout({ paper: 'a4', perPage: 4, items: 0, choices: 4 }).ok).toBe(false);
    expect(sheetLayout({ paper: 'a4', perPage: 3, items: 10, choices: 4 }).ok).toBe(false);
    expect(sheetLayout({ paper: 'a4', perPage: 4, items: 10, choices: 3 }).ok).toBe(false);
  });

  it('cut-and-stack order puts the class list back in order after cutting; paper count', () => {
    // 10 sheets, 4 per page → 3 pages; pile 1 (top-left of every page) holds sheets 0,1,2…
    const order = cutStackOrder(10, 4);
    expect(order).toEqual([[0, 3, 6, 9], [1, 4, 7, null], [2, 5, 8, null]]);
    const piles = [0, 1, 2, 3].flatMap((pos) => order.map((page) => page[pos]).filter((x) => x !== null));
    expect(piles).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(paperCount(10, 4)).toBe(3);
    expect(paperCount(40, 8)).toBe(5);
  });

  it('learner codes', () => {
    const id = newSetId(() => 0.5);
    expect(id).toMatch(/^[A-Z2-9]{6}$/);
    expect(sheetCode('ABC234', 7)).toBe('KT1:ABC234:007');
    expect(parseSheetCode('KT1:ABC234:007')).toEqual({ setId: 'ABC234', number: 7 });
    expect(parseSheetCode('KT1:abc234:007')).toBeNull();
    expect(parseSheetCode('hello')).toBeNull();
  });

  it('prints one page per 4 sheets with learners first, then blank sheets', async () => {
    const quiz = { setId: 'ABC234', title: 'Science Quiz 1', section: 'Grade 7 - Rizal', items: 30, choices: 4, paper: 'a4', perPage: 4, learners: [{ n: 1, name: 'Dela Cruz, Ana', lrn: '123456789012' }, { n: 2, name: 'Peñafrancia, Ben', lrn: '' }], blanks: 3 };
    expect(sheetsOf(quiz).map((s) => s.number)).toEqual([1, 2, 0, 0, 0]);
    const pdf = await buildBubbleSheetsPdf(quiz);
    const { PDFDocument } = await import('pdf-lib');
    const doc = await PDFDocument.load(pdf);
    expect(doc.getPageCount()).toBe(2);
    expect(doc.getPage(0).getSize().width).toBeCloseTo((210 * 72) / 25.4, 1);
    await expect(buildBubbleSheetsPdf({ ...quiz, items: 60 })).rejects.toThrow(/do not fit/);
    await expect(buildBubbleSheetsPdf({ ...quiz, learners: [], blanks: 0 })).rejects.toThrow(/no learners/);
  });
});

describe('reading a photo of a sheet', () => {
  const layout = sheetLayout({ paper: 'a4', perPage: 4, items: 30, choices: 4 });
  const accept = (c) => parseSheetCode(c)?.setId === 'ABC234';
  const marks = { 1: 'A', 2: 'B', 3: 'C', 4: 'D', 5: 'A', 7: ['B', 'C'], 8: { letter: 'D', gray: 185 }, 30: 'D' };

  it('a tilted photo in uneven light: learner code, answers, blanks, two marks and a light mark', () => {
    const res = readSheet(photo(layout, { code: 'KT1:ABC234:012', marks, corners: tilted }), layout, { accept });
    expect(res.ok).toBe(true);
    expect(res.code).toBe('KT1:ABC234:012');
    expect([1, 2, 3, 4, 5, 30].map((i) => res.answers[i])).toEqual(['A', 'B', 'C', 'D', 'A', 'D']);
    expect(res.answers[6]).toBe('');
    expect(res.answers[7]).toBe('?');
    expect(res.notes[7]).toBe('two marks');
    expect(res.answers[8]).toBe('?');
    expect(res.notes[8]).toBe('light mark');
    expect(Object.values(res.answers).filter((a) => a === '')).toHaveLength(30 - 8);
  });

  it('upside down reads the same', () => {
    const res = readSheet(photo(layout, { code: 'KT1:ABC234:012', marks, corners: tilted, rotate180: true }), layout, { accept });
    expect(res.code).toBe('KT1:ABC234:012');
    expect(res.answers[1]).toBe('A');
    expect(res.answers[30]).toBe('D');
  });

  it("a sheet from another quiz is read, but its learner code is not accepted", () => {
    const res = readSheet(photo(layout, { code: 'KT1:ZZZ999:004', marks, corners: tilted }), layout, { accept });
    expect(res.ok).toBe(true);
    expect(res.code).toBeNull();
  });

  it('a sheet printed with a different layout is refused, never scored', () => {
    const other = sheetLayout({ paper: 'a4', perPage: 4, items: 10, choices: 5 });
    const res = readSheet(photo(other, { code: 'KT1:ABC234:003', marks: {}, corners: tilted }), layout, { accept });
    expect(res.ok).toBe(false);
  });

  it('a photo without a sheet is refused', () => {
    const width = 400;
    const height = 500;
    const gray = new Uint8Array(width * height).fill(200);
    for (let i = 0; i < 4000; i += 1) gray[(i * 7919) % gray.length] = 30;
    expect(readSheet({ gray, width, height }, layout, { accept })).toEqual({ ok: false, error: 'corners' });
  });
});
