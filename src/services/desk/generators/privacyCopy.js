/**
 * privacyCopy.js — a copy of a file with the learners' details hidden (Data Privacy Act),
 * by code only: names become "Learner 1", "Learner 2", … (or initials / blank) and LRNs
 * are removed. Excel, CSV, Word, PowerPoint, and PDF (pages turned into pictures with the
 * details covered, so the hidden text cannot be copied back out).
 */
import { toUint8, interop } from './shared.js';

const LETTER = 'A-Za-zÑñÀ-ÿ';
const NAME_HEADER = /name|pangalan|learner|student|pupil/i;
const LRN_HEADER = /\blrn\b|learner'?s? reference/i;
const LAST_HEADER = /last\s*name|surname|apelyido/i;
const FIRST_HEADER = /first\s*name|given\s*name|pangalan/i;
const MIDDLE_HEADER = /middle\s*(name|initial)|m\.?\s*i\.?$/i;
const NOT_A_LEARNER = /^(male|female|boys?|girls?|total|average|prepared|checked|noted|approved|adviser|teacher|principal|lrn|name)\b/i;
const LRN_TEXT = /(?<!\d)\d{12}(?!\d)/g;

/** Extra columns a teacher can also hide (spreadsheets and tables). */
export const EXTRA_COLUMNS = {
  birthdate: /birth|kapanganakan|\bdob\b|\bage\b/i,
  address: /address|tirahan|barangay|purok|sitio|street/i,
  parents: /parent|guardian|mother|father|magulang|nanay|tatay/i,
  contact: /contact|phone|mobile|cellphone|cp\s*no|tel|e-?mail/i,
};

const text = (v) => (v === null || v === undefined ? '' : String(v)).replace(/\s+/g, ' ').trim();
const looksLikeName = (s) => new RegExp(`[${LETTER}]{2,}`).test(s) && !NOT_A_LEARNER.test(s) && !/\d{3,}/.test(s);

/**
 * Learners in table rows (a sheet, a CSV, a Word table).
 *   rows: [[cell text]] → [{ name, lrn, parts: { last, first, middle } }]
 * A single "Name" column, or separate Last / First / Middle name columns.
 */
export function learnersFromRows(rows) {
  // The heading row that yields the most learners (a title like "School Name: …" can match too).
  let best = { learners: [], header: -1, columns: {} };
  // "Label: value" lines (School Name: …) are titles, not headings; on a tie the later row wins.
  const heading = (v) => (NAME_HEADER.test(text(v)) || LAST_HEADER.test(text(v))) && !/:\s*\S/.test(text(v));
  rows.slice(0, 20).forEach((row, h) => {
    if (!(row || []).some(heading)) return;
    const res = learnersUnder(rows, h);
    if (res.learners.length && res.learners.length >= best.learners.length) best = res;
  });
  return best;
}

function learnersUnder(rows, h) {
  const found = [];
  const heads = (rows[h] || []).map(text);
  const col = (re) => heads.findIndex((v) => re.test(v));
  const last = col(LAST_HEADER);
  const first = last >= 0 ? heads.findIndex((v, i) => i !== last && FIRST_HEADER.test(v) && !LAST_HEADER.test(v)) : -1;
  const middle = last >= 0 ? col(MIDDLE_HEADER) : -1;
  const name = last >= 0 && first >= 0 ? -1 : heads.findIndex((v) => NAME_HEADER.test(v) && !LRN_HEADER.test(v));
  const lrnCol = col(LRN_HEADER);
  for (const row of rows.slice(h + 1)) {
    const cells = (row || []).map(text);
    let full;
    let parts = null;
    if (name >= 0) {
      full = cells[name].replace(/^\d{1,3}\s*[.)-]\s*/, '');
    } else if (last >= 0 && first >= 0) {
      parts = { last: cells[last], first: cells[first], middle: middle >= 0 ? cells[middle] : '' };
      full = parts.last && parts.first ? `${parts.last}, ${parts.first}${parts.middle ? ` ${parts.middle}` : ''}` : '';
    }
    if (!full || !looksLikeName(full)) continue;
    if (cells.some((v) => LRN_HEADER.test(v) || LAST_HEADER.test(v) || /^(learner'?s?\s+)?name$/i.test(v))) continue; // another heading row
    const lrn = lrnCol >= 0 ? (cells[lrnCol].match(/\d{12}/) || [''])[0] : (cells.join(' ').match(/(?<!\d)\d{12}(?!\d)/) || [''])[0];
    found.push({ name: full, lrn, parts });
  }
  return { learners: found, header: h, columns: { name, last, first, middle, lrn: lrnCol } };
}

/** Adds learners without duplicates (same LRN, or same name ignoring case/spacing). */
export function mergeLearners(...lists) {
  const out = [];
  const key = (s) => text(s).toLowerCase().replace(/[^a-zñ0-9]/g, '');
  for (const l of lists.flat()) {
    if (!l?.name) continue;
    const dup = out.find((o) => (l.lrn && o.lrn === l.lrn) || key(o.name) === key(l.name));
    if (dup) { if (!dup.lrn && l.lrn) dup.lrn = l.lrn; continue; }
    out.push({ ...l });
  }
  return out;
}

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The ways one name can appear: "Dela Cruz, Juan P.", "Juan P. Dela Cruz", "Juan Dela Cruz", "DELA CRUZ JUAN". */
export function nameVariants(name) {
  const t = text(name).replace(/^\d{1,3}\s*[.)-]\s*/, '');
  const tokens = (s) => s.split(/[\s,]+/).filter(Boolean);
  const isInitial = (w) => /^[A-Za-zÑñ]\.?$/.test(w);
  const variants = new Set([t]);
  const comma = t.indexOf(',');
  if (comma > 0) {
    const surname = t.slice(0, comma).trim();
    const given = tokens(t.slice(comma + 1));
    const givenNoMi = given.filter((w, i) => !(i > 0 && isInitial(w)));
    variants.add(`${given.join(' ')} ${surname}`);
    variants.add(`${givenNoMi.join(' ')} ${surname}`);
    variants.add(`${surname}, ${givenNoMi.join(' ')}`);
    variants.add(`${surname} ${given.join(' ')}`);
    variants.add(`${surname} ${givenNoMi.join(' ')}`);
  } else {
    const words = tokens(t);
    const noMi = words.filter((w, i) => !(i > 0 && i < words.length - 1 && isInitial(w)));
    variants.add(noMi.join(' '));
  }
  return [...variants].filter((v) => tokens(v).length >= 2 || v.length >= 4);
}

function variantPattern(v) {
  const words = v.split(/[\s,]+/).filter(Boolean);
  return words.map((w) => `${esc(w.replace(/\.$/, ''))}${/^[A-Za-zÑñ]\.?$/.test(w) ? '\\.?' : ''}`).join('[\\s,]+');
}

/**
 * The replacer for one file.
 *   learners: [{ name, lrn }]; mode: 'numbers' | 'initials' | 'blank'; hideNames, hideLrn
 * → { replace(str) → { text, count }, labelFor(i), find(str) → count, learners }
 */
export function buildMatcher(learners, { mode = 'numbers', hideNames = true, hideLrn = true } = {}) {
  const labels = learners.map((l, i) => {
    if (mode === 'blank') return '';
    if (mode === 'initials') {
      // First given name + surname: "Dela Cruz, Juan P." → "J.D.C."
      const t = text(l.name).replace(/^\d{1,3}\s*[.)-]\s*/, '');
      const comma = t.indexOf(',');
      const words = comma > 0
        ? [t.slice(comma + 1).trim().split(/\s+/)[0], ...t.slice(0, comma).trim().split(/\s+/)]
        : (() => { const w = t.split(/\s+/); return w.length > 1 ? [w[0], w[w.length - 1]] : w; })();
      return words.filter(Boolean).map((w) => `${w[0].toUpperCase()}.`).join('');
    }
    return `Learner ${i + 1}`;
  });
  const regexes = hideNames
    ? learners.map((l) => {
      const pats = nameVariants(l.name).sort((a, b) => b.length - a.length).map(variantPattern);
      return new RegExp(`(?<![${LETTER}])(?:${pats.join('|')})(?![${LETTER}])`, 'gi');
    })
    : [];
  // Longer names first, so "Ana Marie Cruz" is replaced before "Ana Cruz".
  const order = learners.map((l, i) => i).sort((a, b) => text(learners[b].name).length - text(learners[a].name).length);
  const lrnLabel = mode === 'blank' ? '' : '[LRN hidden]';
  function replace(str) {
    let out = String(str ?? '');
    let count = 0;
    for (const i of order) {
      out = out.replace(regexes[i], () => { count += 1; return labels[i]; });
    }
    if (hideLrn) out = out.replace(LRN_TEXT, () => { count += 1; return lrnLabel; });
    return { text: out, count };
  }
  return {
    learners,
    labels,
    mode,
    labelFor: (i) => labels[i],
    replace,
    find: (str) => replace(str).count,
    hideNames,
    hideLrn,
  };
}

/* ── Word / PowerPoint ─────────────────────────────────────────────────── */

const unesc = (s) => String(s).replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
const escXml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Rewrites each innermost paragraph whose text changes; its runs are joined into the first run. */
function rewriteParagraphs(xml, ns, fn) {
  const para = new RegExp(`<${ns}:p[ >](?:(?!<${ns}:p[ >])[\\s\\S])*?<\\/${ns}:p>`, 'g');
  const tRe = new RegExp(`<${ns}:t(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${ns}:t>`, 'g');
  let total = 0;
  const out = xml.replace(para, (p) => {
    const texts = [...p.matchAll(tRe)];
    if (!texts.length) return p;
    const joined = unesc(texts.map((m) => m[1]).join(''));
    const { text: next, count } = fn(joined);
    if (!count) return p;
    total += count;
    let first = true;
    return p.replace(tRe, () => {
      if (!first) return `<${ns}:t></${ns}:t>`;
      first = false;
      return `<${ns}:t xml:space="preserve">${escXml(next)}</${ns}:t>`;
    });
  });
  return { xml: out, count: total };
}

/** Plain text nodes (document properties: title, subject, keywords). */
function rewriteTextNodes(xml, fn) {
  let total = 0;
  const out = xml.replace(/>([^<>]+)</g, (m, t) => {
    const { text: next, count } = fn(unesc(t));
    if (!count) return m;
    total += count;
    return `>${escXml(next)}<`;
  });
  return { xml: out, count: total };
}

const WORD_PARTS = /^word\/(document|header\d*|footer\d*|footnotes|endnotes|comments)\.xml$/;
const SLIDE_PARTS = /^ppt\/(slides\/slide\d+|notesSlides\/notesSlide\d+|slideLayouts\/slideLayout\d+|slideMasters\/slideMaster\d+)\.xml$/;

/** Tables in a Word file as rows of cell text (to find the learners in it). */
export async function docxTables(bytes) {
  const PizZip = interop(await import('pizzip'));
  const xml = new PizZip(toUint8(bytes)).file('word/document.xml')?.asText() || '';
  const tables = [];
  for (const tbl of xml.match(/<w:tbl>[\s\S]*?<\/w:tbl>/g) || []) {
    tables.push((tbl.match(/<w:tr[ >][\s\S]*?<\/w:tr>/g) || []).map((tr) => (tr.match(/<w:tc>[\s\S]*?<\/w:tc>/g) || [])
      .map((tc) => unesc((tc.match(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g) || []).map((t) => t.replace(/<[^>]+>/g, '')).join('')))));
  }
  return tables;
}

/** Blanks the cells under extra headings (birthdate, address, …) in Word tables. */
function blankDocxTableColumns(xml, extraRes) {
  let count = 0;
  const heads = new Set();
  const cellText2 = (tc) => unesc((tc.match(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g) || []).map((t) => t.replace(/<[^>]+>/g, '')).join(''));
  const out = xml.replace(/<w:tbl>[\s\S]*?<\/w:tbl>/g, (tbl) => {
    const rows = tbl.match(/<w:tr[ >][\s\S]*?<\/w:tr>/g) || [];
    const h = rows.findIndex((tr) => (tr.match(/<w:tc>[\s\S]*?<\/w:tc>/g) || []).some((tc) => NAME_HEADER.test(cellText2(tc)) || LAST_HEADER.test(cellText2(tc))));
    if (h < 0) return tbl;
    const headCells = (rows[h].match(/<w:tc>[\s\S]*?<\/w:tc>/g) || []).map(cellText2);
    const cols = headCells.map((t, i) => (extraRes.some((re) => re.test(text(t))) ? i : -1)).filter((i) => i >= 0);
    if (!cols.length) return tbl;
    cols.forEach((i) => heads.add(text(headCells[i])));
    let next = tbl;
    for (const tr of rows.slice(h + 1)) {
      let i = -1;
      const blanked = tr.replace(/<w:tc>[\s\S]*?<\/w:tc>/g, (tc) => {
        i += 1;
        if (!cols.includes(i) || !cellText2(tc).trim()) return tc;
        count += 1;
        return tc.replace(/(<w:t(?:\s[^>]*)?>)[\s\S]*?(<\/w:t>)/g, '$1$2');
      });
      next = next.replace(tr, () => blanked);
    }
    return next;
  });
  return { xml: out, count, heads: [...heads] };
}

/**
 * Word (.docx) or PowerPoint (.pptx) copy with the details replaced.
 *   extra: { birthdate: true, … } — Word table columns to blank, by heading
 * → { bytes, count, extraColumns }
 */
export async function maskOfficeXml(bytes, matcher, kind, { extra = {} } = {}) {
  const PizZip = interop(await import('pizzip'));
  const zip = new PizZip(toUint8(bytes));
  const parts = kind === 'pptx' ? SLIDE_PARTS : WORD_PARTS;
  const ns = kind === 'pptx' ? 'a' : 'w';
  const extraRes = Object.entries(EXTRA_COLUMNS).filter(([k]) => extra[k]).map(([, re]) => re);
  const extraHeads = new Set();
  let count = 0;
  for (const name of Object.keys(zip.files)) {
    if (kind === 'docx' && name === 'word/document.xml' && extraRes.length) {
      const res = blankDocxTableColumns(zip.file(name).asText(), extraRes);
      res.heads.forEach((hd) => extraHeads.add(hd));
      count += res.count;
      if (res.count) zip.file(name, res.xml);
    }
    if (parts.test(name)) {
      const res = rewriteParagraphs(zip.file(name).asText(), ns, matcher.replace);
      count += res.count;
      if (res.count) zip.file(name, res.xml);
    } else if (name === 'docProps/core.xml' || name === 'docProps/app.xml') {
      const res = rewriteTextNodes(zip.file(name).asText(), matcher.replace);
      count += res.count;
      if (res.count) zip.file(name, res.xml);
    }
  }
  const out = toUint8(zip.generate({ type: 'uint8array', compression: 'DEFLATE' }));
  return { bytes: out, count, extraColumns: [...extraHeads] };
}

/** All visible text of a Word/PowerPoint file (to check nothing was left). */
export async function officeText(bytes, kind) {
  const PizZip = interop(await import('pizzip'));
  const zip = new PizZip(toUint8(bytes));
  const parts = kind === 'pptx' ? SLIDE_PARTS : WORD_PARTS;
  const ns = kind === 'pptx' ? 'a' : 'w';
  const paraEnd = new RegExp(`</${ns}:p>`, 'g');
  return Object.keys(zip.files).filter((n) => parts.test(n) || /^docProps\/(core|app)\.xml$/.test(n))
    .map((n) => unesc(zip.file(n).asText().replace(paraEnd, '\n').replace(/<[^>]+>/g, ' '))).join('\n');
}

/* ── Excel (ExcelJS workbook, changed in place) ────────────────────────── */

const cellText = (v) => {
  if (v === null || v === undefined) return '';
  if (typeof v === 'object') {
    if (Array.isArray(v.richText)) return v.richText.map((r) => r.text).join('');
    if (v.text !== undefined) return String(v.text);
    if (v.result !== undefined) return cellText(v.result);
    if (v instanceof Date) return '';
    return '';
  }
  return String(v);
};

/** Rows of cell text for every sheet (to find the learners). */
export function workbookRows(wb) {
  return wb.worksheets.map((ws) => {
    const rows = [];
    ws.eachRow({ includeEmpty: true }, (row, r) => {
      const cells = [];
      row.eachCell({ includeEmpty: true }, (cell, c) => { cells[c - 1] = cellText(cell.value); });
      rows[r - 1] = cells;
    });
    return { name: ws.name, rows: Array.from(rows, (r) => r || []) };
  });
}

/**
 * Hides the details in every cell, note and sheet name; whole name cells become the label.
 *   extra: columns to blank too ({ birthdate: true, … }) — matched by their heading
 * → { count, cells, extraColumns: [heading] }
 */
export function maskWorkbook(wb, matcher, { extra = {} } = {}) {
  let count = 0;
  let cells = 0;
  const extraHeads = new Set();
  const extraRes = Object.entries(EXTRA_COLUMNS).filter(([k]) => extra[k]).map(([, re]) => re);
  for (const ws of wb.worksheets) {
    // Extra columns: blank every value under a matching heading.
    if (extraRes.length) {
      const rows = workbookRows({ worksheets: [ws] })[0].rows;
      const h = learnersFromRows(rows).header;
      if (h >= 0) {
        rows[h].forEach((head, c) => {
          if (!extraRes.some((re) => re.test(text(head)))) return;
          extraHeads.add(text(head));
          for (let r = h + 2; r <= ws.rowCount; r += 1) {
            const cell = ws.getRow(r).getCell(c + 1);
            if (cell.value !== null && cell.value !== undefined && cell.value !== '' && !cell.isMerged) { cell.value = null; count += 1; cells += 1; }
          }
        });
      }
    }
    ws.eachRow({ includeEmpty: false }, (row) => {
      row.eachCell({ includeEmpty: false }, (cell) => {
        const v = cell.value;
        if (cell.isMerged && cell.master !== cell) return;
        let changed = 0;
        if (typeof v === 'string') {
          const r = matcher.replace(v);
          if (r.count) { cell.value = r.text; changed = r.count; }
        } else if (typeof v === 'number' && matcher.hideLrn && Number.isInteger(v) && String(v).length === 12) {
          cell.value = matcher.mode === 'blank' ? null : '[LRN hidden]';
          changed = 1;
        } else if (v && typeof v === 'object' && Array.isArray(v.richText)) {
          let n = 0;
          const richText = v.richText.map((part) => { const r = matcher.replace(part.text); n += r.count; return { ...part, text: r.text }; });
          if (n) {
            // A name split across formatting runs: replace the joined text in the first run.
            const joined = matcher.replace(v.richText.map((p) => p.text).join(''));
            cell.value = joined.count > n ? { richText: [{ ...v.richText[0], text: joined.text }] } : { richText };
            changed = Math.max(n, joined.count);
          } else {
            const joined = matcher.replace(v.richText.map((p) => p.text).join(''));
            if (joined.count) { cell.value = { richText: [{ ...v.richText[0], text: joined.text }] }; changed = joined.count; }
          }
        } else if (v && typeof v === 'object' && v.text !== undefined && v.hyperlink !== undefined) {
          const r = matcher.replace(v.text);
          if (r.count) { cell.value = { ...v, text: r.text }; changed = r.count; }
        } else if (v && typeof v === 'object' && (v.formula || v.sharedFormula) && v.result !== undefined) {
          // Keep the formula; hide the saved answer it shows until Excel recalculates.
          const res = typeof v.result === 'number' && Number.isInteger(v.result) && String(v.result).length === 12 && matcher.hideLrn ? { text: matcher.mode === 'blank' ? '' : '[LRN hidden]', count: 1 } : matcher.replace(cellText(v.result));
          if (res.count) { cell.value = { ...v, result: res.text }; changed = res.count; }
        }
        if (cell.note) {
          const noteText = typeof cell.note === 'string' ? cell.note : (cell.note.texts || []).map((t) => t.text).join('');
          const r = matcher.replace(noteText);
          if (r.count) { cell.note = r.text; changed += r.count; }
        }
        if (changed) { count += changed; cells += 1; }
      });
    });
    const sheetName = matcher.replace(ws.name);
    if (sheetName.count) {
      const clean = (sheetName.text || 'Sheet').replace(/[\\/?*[\]:]/g, '').slice(0, 31) || 'Sheet';
      let nameTry = clean;
      for (let k = 2; wb.worksheets.some((o) => o !== ws && o.name === nameTry); k += 1) nameTry = `${clean.slice(0, 28)} ${k}`;
      ws.name = nameTry;
      count += sheetName.count;
    }
  }
  return { count, cells, extraColumns: [...extraHeads] };
}

/** All text of a workbook (to check nothing was left). */
export function workbookText(wb) {
  const parts = [];
  for (const ws of wb.worksheets) {
    parts.push(ws.name);
    ws.eachRow({ includeEmpty: false }, (row) => row.eachCell({ includeEmpty: false }, (cell) => {
      const v = cell.value;
      parts.push(typeof v === 'number' ? String(v) : cellText(v));
      if (v && typeof v === 'object' && typeof v.result === 'number') parts.push(String(v.result));
      if (cell.note) parts.push(typeof cell.note === 'string' ? cell.note : (cell.note.texts || []).map((t) => t.text).join(''));
    }));
  }
  return parts.join('\n');
}

/* ── PDF ───────────────────────────────────────────────────────────────── */

/**
 * Where the details are on each PDF page, from the page's text (pdfjs).
 * Text items on the same line are joined, so a name split into pieces is still found.
 * → [{ page, boxes: [{ x, y, w, h, label }] }]  (PDF user-space points, origin bottom-left)
 */
export async function pdfRedactionBoxes(pdfDoc, matcher) {
  const pages = [];
  // In the desktop app, letters are measured in the item's font family, so a box starts and
  // ends where the name really does (proportional fonts); elsewhere, an even split per letter.
  const g = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(8, 8).getContext('2d') : null;
  for (let p = 1; p <= pdfDoc.numPages; p += 1) {
    const page = await pdfDoc.getPage(p);
    const content = await page.getTextContent();
    const share = (it, upTo) => {
      if (!upTo) return 0;
      if (upTo >= it.str.length) return it.width;
      if (g) {
        g.font = `100px ${content.styles?.[it.fontName]?.fontFamily || 'sans-serif'}`;
        const whole = g.measureText(it.str).width;
        if (whole > 0) return (it.width * g.measureText(it.str.slice(0, upTo)).width) / whole;
      }
      return (it.width * upTo) / Math.max(1, it.str.length);
    };
    const items = content.items.filter((it) => typeof it.str === 'string' && it.str.length);
    // Group into lines by baseline.
    const lines = [];
    for (const it of items) {
      const y = it.transform[5];
      let line = lines.find((l) => Math.abs(l.y - y) < Math.max(2, Math.abs(it.transform[3]) * 0.4));
      if (!line) { line = { y, items: [] }; lines.push(line); }
      line.items.push(it);
    }
    const boxes = [];
    for (const line of lines) {
      line.items.sort((a, b) => a.transform[4] - b.transform[4]);
      let joined = '';
      const spans = [];
      for (const it of line.items) {
        if (joined && !/\s$/.test(joined) && !/^\s/.test(it.str)) {
          const prev = spans[spans.length - 1];
          const gap = it.transform[4] - (prev.item.transform[4] + prev.item.width);
          if (gap > Math.abs(it.transform[0] || it.height || 8) * 0.15) joined += ' ';
        }
        spans.push({ item: it, start: joined.length, end: joined.length + it.str.length });
        joined += it.str;
      }
      // Find each hidden piece in the joined line, then cover the matching part of each item.
      const hits = [];
      const collect = (re, label) => {
        re.lastIndex = 0;
        for (let m = re.exec(joined); m; m = re.exec(joined)) {
          if (!m[0].length) { re.lastIndex += 1; continue; }
          hits.push({ start: m.index, end: m.index + m[0].length, label });
        }
      };
      if (matcher.hideNames) {
        matcher.learners.forEach((l, i) => {
          const pats = nameVariants(l.name).sort((a, b) => b.length - a.length).map(variantPattern);
          collect(new RegExp(`(?<![${LETTER}])(?:${pats.join('|')})(?![${LETTER}])`, 'gi'), matcher.labels[i]);
        });
      }
      if (matcher.hideLrn) collect(new RegExp(LRN_TEXT.source, 'g'), matcher.mode === 'blank' ? '' : 'LRN hidden');
      for (const hit of hits) {
        let x0 = Infinity; let x1 = -Infinity; let y0 = Infinity; let y1 = -Infinity;
        for (const s of spans) {
          const a = Math.max(hit.start, s.start);
          const b = Math.min(hit.end, s.end);
          if (a >= b) continue;
          const it = s.item;
          const h = Math.abs(it.transform[3]) || it.height || 10;
          const pad = h * 0.2; // a little extra on each side, so no letter edge shows
          const left = it.transform[4] + share(it, a - s.start) - (a === hit.start ? pad : 0);
          const right = it.transform[4] + share(it, b - s.start) + (b === hit.end ? pad : 0);
          x0 = Math.min(x0, left); x1 = Math.max(x1, right);
          y0 = Math.min(y0, it.transform[5] - h * 0.3); y1 = Math.max(y1, it.transform[5] + h * 1.0);
        }
        if (x1 > x0) boxes.push({ x: x0, y: y0, w: x1 - x0, h: y1 - y0, label: hit.label });
      }
    }
    pages.push({ page: p, boxes });
  }
  return pages;
}

/**
 * PDF copy: every page drawn as a picture (desktop app) with the boxes covered in white
 * and labelled, so the hidden text is truly gone. → Uint8Array, or null without a canvas.
 */
export async function redactPdf(pdfjsDoc, plan, { dpi = 150 } = {}) {
  if (typeof OffscreenCanvas === 'undefined') return null;
  const { PDFDocument } = await import('pdf-lib');
  const out = await PDFDocument.create();
  const scale = dpi / 72;
  for (const pg of plan) {
    const page = await pdfjsDoc.getPage(pg.page);
    const viewport = page.getViewport({ scale });
    const canvas = new OffscreenCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
    const pageW = viewport.width / scale; // page size as shown (turned pages included)
    const pageH = viewport.height / scale;
    const g = canvas.getContext('2d');
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: g, viewport }).promise;
    for (const b of pg.boxes) {
      // Box corners from PDF space to the drawn (scaled, possibly turned) page.
      const [ax, ay] = viewport.convertToViewportPoint(b.x, b.y);
      const [bx, by] = viewport.convertToViewportPoint(b.x + b.w, b.y + b.h);
      const x = Math.min(ax, bx);
      const yTop = Math.min(ay, by);
      const w = Math.abs(bx - ax);
      const h = Math.abs(by - ay);
      g.fillStyle = '#ffffff';
      g.fillRect(x, yTop, w, h);
      g.strokeStyle = '#9aa3ad';
      g.lineWidth = Math.max(1, scale * 0.5);
      g.strokeRect(x, yTop, w, h);
      if (b.label) {
        // On a turned page the box stands upright: write the label along it.
        const upright = h > w * 1.5;
        const [long, short] = upright ? [h, w] : [w, h];
        g.save();
        g.fillStyle = '#333333';
        let size = short * 0.7;
        g.font = `${size}px Arial, sans-serif`;
        while (size > 4 && g.measureText(b.label).width > long - 4) { size -= 1; g.font = `${size}px Arial, sans-serif`; }
        g.textBaseline = 'middle';
        if (upright) {
          g.translate(x + w / 2, yTop);
          g.rotate(Math.PI / 2);
          g.fillText(b.label, 2, 0);
        } else {
          g.fillText(b.label, x + 2, yTop + h / 2);
        }
        g.restore();
      }
    }
    const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.85 });
    const img = await out.embedJpg(new Uint8Array(await blob.arrayBuffer()));
    const p = out.addPage([pageW, pageH]);
    p.drawImage(img, { x: 0, y: 0, width: pageW, height: pageH });
  }
  return out.save();
}
