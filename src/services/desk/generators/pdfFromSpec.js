/**
 * pdfFromSpec.js — jsPDF fallback renderer for a DocumentSpec (used where Electron's
 * printToPDF of the HTML preview is unavailable, e.g. the web build).
 */

import { normalizeDocumentSpec, parseInlineRuns } from '../docSpec.js';
import { MARGIN_IN, pageInches, headerLines, choiceLetter, choiceLayout, isCompactSpec, answerKeyGroups, widthFractions, metaRows, toUint8, interop } from './shared.js';

const PT = 72;

// jsPDF's built-in fonts only cover WinAnsi; map common Unicode punctuation and drop the rest.
const MAP = { '\u2018': "'", '\u2019': "'", '\u201c': '"', '\u201d': '"', '\u2013': '-', '\u2014': '-', '\u2022': '-', '\u2026': '...', '\u00a0': ' ', '\u2702': '' };
export function pdfSafe(s) {
  return String(s ?? '')
    .replace(/[\u2018\u2019\u201c\u201d\u2013\u2014\u2022\u2026\u00a0\u2702]/g, (c) => MAP[c])
    .replace(/[^\n\t\x20-\x7e\u00a1-\u00ff]/g, '');
}

export async function buildPdf(rawSpec) {
  const spec = normalizeDocumentSpec(rawSpec);
  const { jsPDF } = await import('jspdf');
  const autoTableMod = await import('jspdf-autotable');
  const autoTable = autoTableMod.autoTable || interop(autoTableMod);

  const page = pageInches(spec);
  const W = page.width * PT;
  const H = page.height * PT;
  const doc = new jsPDF({ unit: 'pt', format: [page.landscape ? H : W, page.landscape ? W : H], orientation: page.landscape ? 'landscape' : 'portrait', compress: true });
  doc.setProperties({ title: pdfSafe(spec.title), creator: 'KaTuroDesk' });

  const left = MARGIN_IN.left * PT;
  const right = W - MARGIN_IN.right * PT;
  const top = MARGIN_IN.top * PT;
  const bottom = H - MARGIN_IN.bottom * PT;
  const maxW = right - left;
  let y = top;

  const lh = (size) => size * 1.3;
  const ensure = (h) => {
    if (y + h > bottom) {
      doc.addPage();
      y = top;
    }
  };
  const font = (bold, italic, size) => {
    doc.setFont('helvetica', bold && italic ? 'bolditalic' : bold ? 'bold' : italic ? 'italic' : 'normal');
    doc.setFontSize(size);
  };

  const centered = (text, { size = 11, bold = false, italic = false } = {}) => {
    font(bold, italic, size);
    for (const line of doc.splitTextToSize(pdfSafe(text), maxW)) {
      ensure(lh(size));
      doc.text(line, W / 2, y + size, { align: 'center' });
      y += lh(size);
    }
  };

  // Word-wrapped text with inline bold runs.
  const rich = (text, { x = left, width = maxW, size = 11, prefix = '', hang = 0, after = 6 } = {}) => {
    const words = [];
    if (prefix) words.push({ t: prefix, bold: false, glue: true });
    for (const r of parseInlineRuns(text)) {
      pdfSafe(r.text).split(/(\s+)/).forEach((w) => {
        if (w) words.push({ t: w, bold: r.bold, space: /^\s+$/.test(w) });
      });
    }
    const measure = (w) => {
      font(w.bold, false, size);
      return doc.getTextWidth(w.space ? ' ' : w.t);
    };
    let line = [];
    let lineW = 0;
    let first = true;
    const flush = () => {
      ensure(lh(size));
      let cx = x + (first ? 0 : hang);
      while (line.length && line[line.length - 1].space) line.pop();
      for (const w of line) {
        font(w.bold, false, size);
        if (!w.space) doc.text(w.t, cx, y + size);
        cx += measure(w);
      }
      y += lh(size);
      line = [];
      lineW = 0;
      first = false;
    };
    for (const w of words) {
      const avail = width - (first ? 0 : hang);
      if (w.space && !line.length) continue;
      const ww = measure(w);
      if (lineW + ww > avail && line.length) flush();
      if (w.space && !line.length) continue;
      line.push(w);
      lineW += ww;
    }
    if (line.length || first) flush();
    y += after;
  };

  const table = (head, body, { widths, headShade = true, bodyBold } = {}) => {
    autoTable(doc, {
      startY: y,
      margin: { left, right: W - right, top, bottom: H - bottom },
      head: head ? [head.map(pdfSafe)] : undefined,
      body: body.map((r) => r.map((c) => pdfSafe(String(c).replace(/\*\*/g, '')))),
      theme: 'grid',
      showHead: 'everyPage',
      styles: { font: 'helvetica', fontSize: 10, textColor: 0, lineColor: 0, lineWidth: 0.5, cellPadding: 3, overflow: 'linebreak' },
      headStyles: { fillColor: headShade ? [231, 230, 230] : 255, textColor: 0, fontStyle: 'bold', halign: 'center' },
      columnStyles: Object.fromEntries((widths || []).map((f, i) => [i, { cellWidth: f * maxW, ...(bodyBold?.includes(i) ? { fontStyle: 'bold', fillColor: [231, 230, 230] } : {}) }])),
    });
    y = doc.lastAutoTable.finalY + 10;
  };

  const lines = headerLines(spec.header);
  lines.forEach((l) => centered(l.text, { bold: l.bold, size: l.size === 'large' ? 14 : l.size === 'normal' ? 11 : 10 }));
  if (lines.length) {
    y += 3;
    doc.setLineWidth(1);
    doc.line(left, y, right, y);
    y += 10;
  }
  if (!spec.hideTitle) {
    centered(spec.title, { size: 14, bold: true });
    if (spec.subtitle) centered(spec.subtitle, { italic: true });
    y += 8;
  }

  if (spec.meta.length) {
    table(null, metaRows(spec.meta).map(([a, b]) => [a.label, a.value, b?.label || '', b?.value || '']), { widths: [0.18, 0.32, 0.18, 0.32], bodyBold: [0, 2] });
  }

  const compact = isCompactSpec(spec);
  for (const b of spec.blocks) {
    switch (b.type) {
      case 'heading': {
        const size = b.level === 1 ? 13 : b.level === 2 ? 12 : 11;
        y += b.level === 1 ? 8 : 5;
        ensure(lh(size) * 2);
        rich(`**${b.text.replace(/\*\*/g, '')}**`, { size, after: 3 });
        break;
      }
      case 'paragraph':
        rich(b.text, { after: 6 });
        break;
      case 'bullets':
        b.items.forEach((it, i) => rich(it, { x: left + 14, width: maxW - 14, prefix: b.ordered ? `${i + 1}. ` : '- ', hang: 12, after: 2 }));
        y += 4;
        break;
      case 'table': {
        const hasHead = b.columns.some((c) => c.trim());
        table(hasHead ? b.columns.map((c) => c.replace(/\*\*/g, '')) : null, b.rows, { widths: widthFractions(b.columns.length, b.widths) });
        break;
      }
      case 'questions':
        b.items.forEach((q, i) => {
          const gap = compact ? 3 : 6;
          const layout = choiceLayout(q.choices || []);
          const choiceLines = !q.choices ? 0 : layout === 'inline' ? 1 : layout === 'grid' ? Math.ceil(q.choices.length / 2) : Math.min(4, q.choices.length);
          ensure(lh(11) * (1 + choiceLines));
          rich(q.question, { prefix: `${(b.start || 1) + i}. `, hang: 16, after: q.choices ? 1 : gap });
          if (!q.choices) return;
          const cx = left + 20;
          const cw = maxW - 20;
          if (layout === 'stack') {
            q.choices.forEach((c, j) => rich(c, { x: cx + 8, width: cw - 8, prefix: `${choiceLetter(j)}. `, hang: 14, after: j === q.choices.length - 1 ? gap : 0 }));
            return;
          }
          const perLine = layout === 'inline' ? q.choices.length : 2;
          const colW = cw / perLine;
          for (let j = 0; j < q.choices.length; j += perLine) {
            const startY = y;
            let endY = y;
            q.choices.slice(j, j + perLine).forEach((c, k) => {
              y = startY;
              rich(c, { x: cx + k * colW, width: colW - 6, prefix: `${choiceLetter(j + k)}. `, hang: 14, after: 0 });
              endY = Math.max(endY, y);
            });
            y = endY;
          }
          y += gap;
        });
        break;
      case 'answerLines':
        doc.setLineWidth(0.5);
        for (let i = 0; i < b.count; i++) {
          ensure(20);
          y += 20;
          doc.line(left, y, right, y);
        }
        y += 8;
        break;
      case 'pageBreak':
        doc.addPage();
        y = top;
        break;
      case 'cutLine':
        ensure(24);
        y += 10;
        doc.setLineDashPattern([4, 3], 0);
        doc.setDrawColor(100);
        doc.setLineWidth(0.75);
        doc.line(left, y, right, y);
        doc.setLineDashPattern([], 0);
        doc.setDrawColor(0);
        font(false, false, 7);
        doc.setTextColor(100);
        doc.text('cut here', W / 2, y + 8, { align: 'center' });
        doc.setTextColor(0);
        y += 16;
        break;
      default:
        break;
    }
  }

  if (spec.signatures?.length) {
    const perRow = Math.min(3, spec.signatures.length);
    const colW = maxW / perRow;
    y += 16;
    for (let i = 0; i < spec.signatures.length; i += perRow) {
      ensure(80);
      spec.signatures.slice(i, i + perRow).forEach((s, j) => {
        const x = left + j * colW;
        const lineL = x + 8;
        const lineR = x + colW - 8;
        font(false, false, 11);
        doc.text(pdfSafe(s.label), x, y + 11);
        doc.setLineWidth(0.5);
        doc.line(lineL, y + 46, lineR, y + 46);
        font(true, false, 11);
        if (s.name) doc.text(pdfSafe(s.name.toUpperCase()), (lineL + lineR) / 2, y + 42, { align: 'center' });
        font(false, true, 10);
        if (s.role) doc.text(pdfSafe(s.role), (lineL + lineR) / 2, y + 58, { align: 'center' });
      });
      y += 76;
    }
  }

  const keys = answerKeyGroups(spec.blocks);
  if (keys.length) {
    doc.addPage();
    y = top;
    centered('Answer Key', { size: 14, bold: true });
    y += 6;
    for (const g of keys) {
      if (g.label) rich(`**${g.label}**`, { after: 2 });
      for (const a of g.answers) rich(`${a.number}. ${a.answer}`, { after: 0 });
      y += 6;
    }
  }

  return toUint8(doc.output('arraybuffer'));
}
