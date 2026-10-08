/**
 * docDiff.js — what changed between two versions of a document, by code only.
 *   Text (Word, PowerPoint, PDF, plain text): paragraphs are lined up, changed paragraphs are
 *   compared word by word, and a Word file with real tracked changes (Accept / Reject in
 *   Word's Review tab) is made, plus a list of changes.
 *   Excel: cell by cell, with the changed cells marked in a copy of the newer workbook.
 */
import { toUint8, interop, unescapeXml } from './shared.js';

const unesc = unescapeXml;
const clean = (s) => String(s || '').replace(/\s+/g, ' ').trim();

/** The paragraphs of a Word or PowerPoint file, in reading order (table cells one by one). */
export async function officeParagraphs(bytes, kind) {
  const PizZip = interop(await import('pizzip'));
  const zip = new PizZip(toUint8(bytes));
  const ns = kind === 'pptx' ? 'a' : 'w';
  const parts = kind === 'pptx'
    ? Object.keys(zip.files).filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n)).sort((a, b) => a.localeCompare(b, 'en', { numeric: true }))
    : ['word/document.xml'];
  const out = [];
  const pRe = new RegExp(`<${ns}:p[ >](?:(?!<${ns}:p[ >])[\\s\\S])*?<\\/${ns}:p>`, 'g');
  const tRe = new RegExp(`<${ns}:t(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${ns}:t>|<${ns}:tab\\/>`, 'g');
  for (const [si, name] of parts.entries()) {
    const xml = zip.file(name)?.asText() || '';
    for (const m of xml.matchAll(pRe)) {
      const text = clean([...m[0].matchAll(tRe)].map((t) => (t[0].endsWith('tab/>') ? '\t' : unesc(t[1]))).join(''));
      if (text) out.push(kind === 'pptx' ? { text, where: `slide ${si + 1}` } : { text });
    }
  }
  return out;
}

/** Longest common subsequence pairs of two lists (by equality of key). */
function lcsPairs(a, b, key = (x) => x) {
  const n = a.length;
  const m = b.length;
  if (n * m > 6e6) {
    // Very long documents: match identical items in order (fast, slightly less exact).
    const pairs = [];
    let j = 0;
    for (let i = 0; i < n && j < m; i += 1) {
      const k = b.slice(j, j + 200).findIndex((y) => key(y) === key(a[i]));
      if (k >= 0) { pairs.push([i, j + k]); j += k + 1; }
    }
    return pairs;
  }
  const dp = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) dp[i][j] = key(a[i]) === key(b[j]) ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  }
  const pairs = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (key(a[i]) === key(b[j])) { pairs.push([i, j]); i += 1; j += 1; } else if (dp[i + 1][j] >= dp[i][j + 1]) i += 1; else j += 1;
  }
  return pairs;
}

/** Word-by-word changes inside one paragraph: [{ type: 'same'|'del'|'ins', text }]. */
export function diffWords(a, b) {
  const ta = a.split(/(\s+)/).filter(Boolean);
  const tb = b.split(/(\s+)/).filter(Boolean);
  const pairs = lcsPairs(ta, tb);
  const out = [];
  const push = (type, text) => { if (!text) return; const last = out[out.length - 1]; if (last && last.type === type) last.text += text; else out.push({ type, text }); };
  let i = 0;
  let j = 0;
  for (const [pi, pj] of [...pairs, [ta.length, tb.length]]) {
    push('del', ta.slice(i, pi).join(''));
    push('ins', tb.slice(j, pj).join(''));
    if (pi < ta.length) push('same', ta[pi]);
    i = pi + 1;
    j = pj + 1;
  }
  return out;
}

const similarity = (a, b) => {
  const wa = a.toLowerCase().split(/\s+/);
  const wb = new Set(b.toLowerCase().split(/\s+/));
  const common = wa.filter((w) => wb.has(w)).length;
  return (2 * common) / Math.max(1, wa.length + wb.size);
};

/**
 * Paragraph changes between two versions.
 * → [{ type: 'same'|'del'|'ins'|'mod', a?, b?, words?, where? }]
 */
export function diffParagraphs(oldParas, newParas) {
  const A = oldParas.map((p) => (typeof p === 'string' ? { text: p } : p));
  const B = newParas.map((p) => (typeof p === 'string' ? { text: p } : p));
  const pairs = lcsPairs(A, B, (p) => p.text);
  const ops = [];
  let i = 0;
  let j = 0;
  for (const [pi, pj] of [...pairs, [A.length, B.length]]) {
    const dels = A.slice(i, pi);
    const ins = B.slice(j, pj);
    // A removed paragraph next to an added one that is mostly the same = an edited paragraph.
    while (dels.length || ins.length) {
      if (dels.length && ins.length && similarity(dels[0].text, ins[0].text) >= 0.5) {
        const d = dels.shift();
        const n = ins.shift();
        ops.push({ type: 'mod', a: d.text, b: n.text, words: diffWords(d.text, n.text), where: n.where || d.where });
      } else if (dels.length && (!ins.length || dels.length >= ins.length)) {
        const d = dels.shift();
        ops.push({ type: 'del', a: d.text, where: d.where });
      } else {
        const n = ins.shift();
        ops.push({ type: 'ins', b: n.text, where: n.where });
      }
    }
    if (pi < A.length) ops.push({ type: 'same', a: A[pi].text, b: B[pj].text, where: B[pj].where });
    i = pi + 1;
    j = pj + 1;
  }
  return ops;
}

/** A Word file of the newer version with every change as a real tracked change. */
export async function buildRedlineDocx(ops, { title, author = 'KaTuroDesk', date = new Date() } = {}) {
  const d = await import('docx');
  const { Document, Packer, Paragraph, TextRun, InsertedTextRun, DeletedTextRun } = d;
  let id = 1;
  const iso = date.toISOString().replace(/\.\d+Z$/, 'Z');
  const ins = (text) => new InsertedTextRun({ text, id: id++, author, date: iso });
  const del = (text) => new DeletedTextRun({ text, id: id++, author, date: iso });
  const children = [];
  if (title) children.push(new Paragraph({ children: [new TextRun({ text: title, bold: true, size: 26 })], spacing: { after: 200 } }));
  for (const op of ops) {
    let runs;
    if (op.type === 'same') runs = [new TextRun(op.b)];
    else if (op.type === 'ins') runs = [ins(op.b)];
    else if (op.type === 'del') runs = [del(op.a)];
    else runs = op.words.map((w) => (w.type === 'same' ? new TextRun(w.text) : w.type === 'ins' ? ins(w.text) : del(w.text)));
    children.push(new Paragraph({ children: runs, spacing: { after: 120 } }));
  }
  const doc = new Document({
    creator: author,
    styles: { default: { document: { run: { font: 'Arial', size: 22 } } } },
    features: { trackRevisions: true },
    sections: [{ properties: { page: { size: { width: 12240, height: 18720 }, margin: { top: 720, bottom: 720, left: 864, right: 864 } } }, children }],
  });
  return toUint8(await Packer.toArrayBuffer(doc));
}

/* ── Excel ─────────────────────────────────────────────────────────────── */

const shown = (v) => {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'object') {
    if (Array.isArray(v.richText)) return v.richText.map((r) => r.text).join('');
    if (v.text !== undefined) return String(v.text);
    if ('result' in v) return shown(v.result);
    if (v.error) return String(v.error);
    return '';
  }
  return String(v);
};
const formulaOf = (v) => (v && typeof v === 'object' && (v.formula || v.sharedFormula)) || '';

/**
 * Cell-by-cell changes between two workbooks (sheets matched by name).
 * → { changes: [{ sheet, cell, before, after, formulaChanged }], addedSheets, removedSheets }
 */
export function diffWorkbooks(wbOld, wbNew) {
  const changes = [];
  const oldNames = wbOld.worksheets.map((w) => w.name);
  const newNames = wbNew.worksheets.map((w) => w.name);
  for (const ws of wbNew.worksheets) {
    const before = wbOld.getWorksheet(ws.name);
    if (!before) continue;
    const addrs = new Set();
    for (const s of [before, ws]) s.eachRow({ includeEmpty: false }, (row) => row.eachCell({ includeEmpty: false }, (c) => { if (!c.isMerged || c.master === c) addrs.add(c.address); }));
    for (const addr of addrs) {
      const a = before.getCell(addr).value;
      const b = ws.getCell(addr).value;
      const sa = shown(a);
      const sb = shown(b);
      const fa = formulaOf(a);
      const fb = formulaOf(b);
      if (sa !== sb || fa !== fb) changes.push({ sheet: ws.name, cell: addr, before: sa, after: sb, formulaChanged: fa !== fb });
    }
  }
  const order = (c) => { const m = c.cell.match(/^([A-Z]+)(\d+)$/); return [Number(m[2]), m[1].length, m[1]]; };
  changes.sort((x, y) => (x.sheet !== y.sheet ? newNames.indexOf(x.sheet) - newNames.indexOf(y.sheet) : (() => { const [r1, l1, c1] = order(x); const [r2, l2, c2] = order(y); return r1 - r2 || l1 - l2 || c1.localeCompare(c2); })()));
  return { changes, addedSheets: newNames.filter((n) => !oldNames.includes(n)), removedSheets: oldNames.filter((n) => !newNames.includes(n)) };
}

/** Marks the changed cells in the newer workbook: yellow, with a note of the old value. */
export function markWorkbook(wbNew, changes) {
  for (const c of changes) {
    const cell = wbNew.getWorksheet(c.sheet).getCell(c.cell);
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF2A8' } };
    cell.note = `Was: ${c.before === '' ? '(empty)' : c.before}${c.formulaChanged ? ' (formula changed)' : ''}`;
  }
}
