/**
 * sheetPdf.js — prints a quiz's bubble sheets (one per learner, plus blank sheets) as a PDF.
 * Vector drawing at exact millimetre sizes from layout.js, so the reader finds every bubble.
 */

import qrcode from 'qrcode-generator';
import { sheetLayout, pageCells, cutStackOrder, sheetCode, BUBBLE_PAPERS } from './layout.js';
import { pdfSafe } from '../generators/pdfFromSpec.js';

const PT = 72 / 25.4;

/** The QR modules for a learner code: a square boolean grid (version 1, medium error correction). */
export function qrModules(text) {
  const qr = qrcode(1, 'M');
  qr.addData(text, 'Alphanumeric');
  qr.make();
  const n = qr.getModuleCount();
  return Array.from({ length: n }, (_, r) => Array.from({ length: n }, (__, c) => qr.isDark(r, c)));
}

/** Every sheet in list order: learners first, then blank sheets (number 0). */
export function sheetsOf(quiz) {
  const learners = (quiz.learners || []).map((l) => ({ number: l.n, name: l.name, lrn: l.lrn || '' }));
  const blanks = Array.from({ length: Math.max(0, Number(quiz.blanks) || 0) }, () => ({ number: 0, name: '', lrn: '' }));
  return [...learners, ...blanks];
}

/**
 * quiz: { setId, title, section?, items, choices, paper, perPage, learners: [{ n, name, lrn }], blanks? }
 * → Uint8Array (PDF)
 */
export async function buildBubbleSheetsPdf(quiz) {
  const layout = sheetLayout(quiz);
  if (!layout.ok) throw new Error(layout.error);
  const sheets = sheetsOf(quiz);
  if (!sheets.length) throw new Error('There are no learners or blank sheets to print.');
  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib');
  const doc = await PDFDocument.create();
  doc.setTitle(pdfSafe(`${quiz.title} - bubble sheets`));
  doc.setCreator('KaTuroDesk');
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const paper = BUBBLE_PAPERS[quiz.paper];
  const cells = pageCells(quiz.paper, quiz.perPage);
  const order = cutStackOrder(sheets.length, quiz.perPage);
  const black = rgb(0, 0, 0);
  const ink = rgb(0.2, 0.2, 0.2);
  const faint = rgb(0.6, 0.6, 0.6);

  const fit = (f, text, size, maxMm) => {
    let s = pdfSafe(text);
    while (s && f.widthOfTextAtSize(s, size) / PT > maxMm) s = s.slice(0, -1);
    return s.length < pdfSafe(text).length ? `${s.slice(0, -1).trimEnd()}.` : s;
  };

  order.forEach((slots, pageIndex) => {
    const page = doc.addPage([paper.width * PT, paper.height * PT]);
    const Y = (mm) => (paper.height - mm) * PT; // page millimetres (top-left origin) -> PDF points
    const text = (s, x, y, size, f = font, color = ink) => page.drawText(s, { x: x * PT, y: Y(y), size, font: f, color });

    // Cut lines between sheets.
    if (quiz.perPage > 1) {
      const xs = new Set(cells.map((c) => c.x).filter((x) => x > cells[0].x));
      const ys = new Set(cells.map((c) => c.y).filter((y) => y > cells[0].y));
      for (const x of xs) page.drawLine({ start: { x: x * PT, y: Y(3) }, end: { x: x * PT, y: Y(paper.height - 3) }, thickness: 0.5, color: faint, dashArray: [4, 3] });
      for (const y of ys) page.drawLine({ start: { x: 3 * PT, y: Y(y) }, end: { x: (paper.width - 3) * PT, y: Y(y) }, thickness: 0.5, color: faint, dashArray: [4, 3] });
    }
    text(fit(font, `${quiz.title} - page ${pageIndex + 1} of ${order.length}${quiz.perPage > 1 ? ' - cut along the dashed lines and stack the piles in order (top-left first)' : ''}`, 6, paper.width - 12), 6, paper.height - 2.2, 6, font, faint);

    slots.forEach((sheetIndex, pos) => {
      if (sheetIndex === null) return;
      const sheet = sheets[sheetIndex];
      const cell = cells[pos];
      const m = layout.marker;
      const ox = cell.x + layout.pad + m / 2; // frame origin on the page
      const oy = cell.y + layout.pad + m / 2;
      const P = (x, y) => [ox + x, oy + y];

      // Corner markers.
      for (const [cx, cy] of [[0, 0], [layout.frame.w, 0], [layout.frame.w, layout.frame.h], [0, layout.frame.h]]) {
        const [px, py] = P(cx - m / 2, cy + m / 2);
        page.drawRectangle({ x: px * PT, y: Y(py), width: m * PT, height: m * PT, color: black });
      }

      // Learner code.
      const mods = qrModules(sheetCode(quiz.setId, sheet.number));
      const mod = layout.qr.size / mods.length;
      mods.forEach((row, r) => row.forEach((dark, c) => {
        if (!dark) return;
        const [px, py] = P(layout.qr.x + c * mod, layout.qr.y + (r + 1) * mod);
        page.drawRectangle({ x: px * PT, y: Y(py), width: mod * PT + 0.05, height: mod * PT + 0.05, color: black });
      }));

      // Name lines.
      const h = layout.header;
      const size = h.font;
      const [hx, hy] = P(h.x, h.y);
      const line = (i) => hy + h.line * (i + 0.8);
      text(fit(bold, quiz.title, size, h.w), hx, line(0), size, bold, black);
      let nameLine = `Name: ${sheet.name}`;
      if (!sheet.name) {
        nameLine = 'Name: ';
        while (bold.widthOfTextAtSize(`${nameLine}_`, size) / PT <= h.w) nameLine += '_';
      }
      text(fit(bold, nameLine, size, h.w), hx, line(1), size, bold, black);
      const idLine = [sheet.lrn ? `LRN: ${sheet.lrn}` : sheet.number ? '' : 'LRN: ____________', sheet.number ? `No. ${sheet.number}` : '', quiz.section || ''].filter(Boolean).join('   ');
      text(fit(font, idLine, size, h.w), hx, line(2), size);
      if (h.lines > 3) text(fit(font, 'Shade one circle fully for each item.', size * 0.92, h.w), hx, line(3), size * 0.92, font, faint);

      // Item numbers and bubbles.
      const numSize = layout.tier.font;
      for (const n of layout.numbers) {
        const s = `${n.item}.`;
        const [px, py] = P(n.x - font.widthOfTextAtSize(s, numSize) / PT, n.y + numSize * 0.3528 * 0.35);
        text(s, px, py, numSize, font, black);
      }
      const letterSize = (layout.bubbles[0].r * 2 * 0.62) / 0.3528;
      for (const b of layout.bubbles) {
        const [px, py] = P(b.x, b.y);
        page.drawCircle({ x: px * PT, y: Y(py), size: b.r * PT, borderColor: ink, borderWidth: 0.6 });
        const w = bold.widthOfTextAtSize(b.letter, letterSize) / PT;
        text(b.letter, px - w / 2, py + letterSize * 0.3528 * 0.36, letterSize, bold, faint);
      }
    });
  });
  return doc.save();
}
