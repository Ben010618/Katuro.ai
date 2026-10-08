/**
 * scanConvert.js — a PDF (or a photo of a document) turned into an editable Word or Excel
 * file that keeps its tables.
 *   PDFs with a text layer: by code (exact words; tables found from aligned columns).
 *   Scans and photos: the caller's AI transcribes each page into blocks (headings,
 *   paragraphs, tables); this module only checks and tidies what comes back.
 */

const clean = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();

/** Splits a text line into cells where the gap between pieces is wide (a column gap). */
function cellsOf(line) {
  const cells = [];
  let cur = null;
  for (const it of line.items) {
    const charW = it.w / Math.max(1, it.str.length);
    if (cur && it.x - (cur.x + cur.w) <= Math.max(8, charW * 1.8)) {
      cur.text += (it.x - (cur.x + cur.w) > charW * 0.25 ? ' ' : '') + it.str;
      cur.w = it.x + it.w - cur.x;
    } else {
      cur = { x: it.x, w: it.w, text: it.str };
      cells.push(cur);
    }
  }
  return cells.map((c) => ({ ...c, text: clean(c.text) })).filter((c) => c.text);
}

/**
 * Blocks from the text layer of a PDF.
 *   pages: from pdfForm.pageLines → [{ blocks }]
 * Three or more lines in a row with three or more aligned cells become a table.
 */
export function textLayerBlocks(pages) {
  const blocks = [];
  pages.forEach((page, pi) => {
    if (pi > 0) blocks.push({ type: 'pageBreak' });
    const lines = page.lines.map((l) => ({ ...l, cells: cellsOf(l), h: Math.max(...l.items.map((i) => i.h)) }));
    const body = [...lines.map((l) => l.h)].sort((a, b) => a - b)[Math.floor(lines.length / 2)] || 11;
    let i = 0;
    while (i < lines.length) {
      // A run of tabular lines (similar number of cells).
      let j = i;
      while (j < lines.length && lines[j].cells.length >= 3 && Math.abs(lines[j].cells.length - lines[i].cells.length) <= 1) j += 1;
      if (j - i >= 3) {
        const run = lines.slice(i, j);
        const widest = run.reduce((a, b) => (b.cells.length > a.cells.length ? b : a));
        const anchors = widest.cells.map((c) => c.x);
        const rows = run.map((l) => {
          const row = anchors.map(() => '');
          for (const c of l.cells) {
            let k = 0;
            anchors.forEach((x, n) => { if (Math.abs(x - c.x) < Math.abs(anchors[k] - c.x)) k = n; });
            row[k] = row[k] ? `${row[k]} ${c.text}` : c.text;
          }
          return row;
        });
        blocks.push({ type: 'table', columns: rows[0], rows: rows.slice(1) });
        i = j;
        continue;
      }
      const l = lines[i];
      const text = clean(l.cells.map((c) => c.text).join(l.cells.length > 1 ? '\t' : ' ').replace(/\t/g, '    '));
      if (text) {
        const heading = l.h >= body * 1.25 || (text.length <= 60 && text === text.toUpperCase() && /[A-Z]{3,}/.test(text));
        // Lines of one paragraph (same size, close together) are joined.
        const prev = blocks[blocks.length - 1];
        const gap = i > 0 ? lines[i - 1].y - l.y : Infinity;
        if (!heading && prev?.type === 'paragraph' && !prev.heading && gap <= l.h * 1.6 && !/[.:!?]$/.test(prev.text)) prev.text = `${prev.text} ${text}`;
        else blocks.push(heading ? { type: 'heading', level: l.h >= body * 1.6 ? 1 : 2, text } : { type: 'paragraph', text });
      }
      i += 1;
    }
  });
  return blocks;
}

/** Checks and tidies blocks from the AI: known types only, rectangular tables, no empty text. */
export function tidyBlocks(raw) {
  const out = [];
  for (const b of Array.isArray(raw) ? raw : []) {
    const type = String(b?.type || '').toLowerCase();
    if (type === 'heading' || type === 'paragraph') {
      const text = clean(b.text);
      if (text) out.push(type === 'heading' ? { type, level: Math.min(3, Math.max(1, Number(b.level) || 2)), text } : { type, text });
    } else if (type === 'table') {
      const columns = (Array.isArray(b.columns) ? b.columns : []).map(clean);
      const rows = (Array.isArray(b.rows) ? b.rows : []).filter(Array.isArray).map((r) => r.map(clean));
      const width = Math.max(columns.length, ...rows.map((r) => r.length), 0);
      if (!width || (!rows.length && !columns.some(Boolean))) continue;
      const pad = (r) => [...r, ...Array(width - r.length).fill('')];
      out.push({ type, columns: pad(columns.length ? columns : rows.shift() || []), rows: rows.map(pad) });
    } else if (type === 'pagebreak') {
      if (out.length && out[out.length - 1].type !== 'pageBreak') out.push({ type: 'pageBreak' });
    }
  }
  while (out.length && out[out.length - 1].type === 'pageBreak') out.pop();
  return out;
}

/** "[unclear]" marks the AI left where it could not read the scan. */
export const unclearCount = (blocks) => JSON.stringify(blocks).split('[unclear]').length - 1;

/** Numbers stored as text in table cells become numbers (for Excel). */
export const cellValue = (v) => (/^-?\d+(\.\d+)?$/.test(String(v).trim()) && !/^0\d/.test(String(v).trim()) ? Number(v) : v);
