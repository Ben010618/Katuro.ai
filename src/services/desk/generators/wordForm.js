/**
 * wordForm.js — fill the teacher's own Word form that has plain blanks (no {{placeholders}}),
 * by code only:
 *   "Name: ________"  "Date: ........"  underlined empty space / tabs after a label
 *   "Section:" alone on its line (when the next line is empty or another label)
 *   a signature line "____________" with its caption on the next line
 *   an empty table cell to the right of a label cell
 * Each value goes exactly where the blank was; everything else stays as it is.
 */
import { toUint8, interop } from './shared.js';

const unesc = (s) => String(s).replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const PIECE = /<w:t(?:\s[^>]*)?>[\s\S]*?<\/w:t>|<w:tab\/>/g;
const RUN = /<w:r[ >][\s\S]*?<\/w:r>/g;
const INNER_P = /<w:p[ >](?:(?!<w:p[ >])[\s\S])*?<\/w:p>/g;
const BLANK = /_{3,}|\.{6,}|…{3,}|\uE000{3,}/g; // \uE000 = an underlined space or tab
const STOP = /^(and|or|of|the|a|an|at|in|on|to|for|with|by|is|i|ako|si|ng|sa|na|ang)$/i;

/** A short heading-like text that can name a blank. */
export function isLabel(t) {
  const s = String(t || '').trim();
  return /[A-Za-zÑñ]{2,}/.test(s) && s.length <= 60 && s.split(/\s+/).length <= 8 && !STOP.test(s);
}
export const cleanLabel = (t) => String(t || '').replace(/\s+/g, ' ').replace(/^[\s,;.)(-]+|[\s:,;.(-]+$/g, '').replace(/^\d{1,2}[.)]\s*/, '').trim();

/** One paragraph as runs and text pieces (w:t text and w:tab), with a scan text for finding blanks. */
function parseParagraph(pXml) {
  const runs = [];
  let scan = '';
  const map = []; // scan offset → { run, piece, offset }
  for (const m of pXml.matchAll(RUN)) {
    const xml = m[0];
    const rPr = (xml.match(/<w:rPr>[\s\S]*?<\/w:rPr>/) || [''])[0];
    const underlined = /<w:u(?:\s+w:val="(?!none)[^"]*")?\s*\/>/.test(rPr);
    const run = { start: m.index, xml, rPr, pieces: [] };
    for (const p of xml.matchAll(PIECE)) {
      const isTab = p[0] === '<w:tab/>';
      const piece = { tab: isTab, text: isTab ? '\t' : unesc(p[0].replace(/^<w:t(?:\s[^>]*)?>|<\/w:t>$/g, '')), changed: false };
      const pi = run.pieces.length;
      run.pieces.push(piece);
      // Underlined spaces and tabs are a blank line; a tab is as wide as several spaces.
      const src = isTab ? '\t' : piece.text;
      for (let k = 0; k < src.length; k += 1) {
        const ch = src[k];
        const out = !underlined ? ch : ch === '\t' ? '\uE000\uE000\uE000\uE000' : ch === ' ' ? '\uE000' : ch;
        for (const c of out) { map.push({ run: runs.length, piece: pi, offset: isTab ? 0 : k }); scan += c; }
      }
    }
    runs.push(run);
  }
  return { runs, scan, map };
}

/** Puts `value` where scan[s, e) is; the first touched piece takes the value. */
function applyEdit(par, s, e, value) {
  let placed = false;
  const cut = new Map(); // "run:piece" → [from, to) text offsets to drop
  for (let i = s; i < e; i += 1) {
    const at = par.map[i];
    if (!at) continue;
    const key = `${at.run}:${at.piece}`;
    const piece = par.runs[at.run].pieces[at.piece];
    if (piece.tab) { cut.set(key, [0, 1]); continue; }
    const c = cut.get(key);
    cut.set(key, c ? [c[0], at.offset + 1] : [at.offset, at.offset + 1]);
  }
  for (const [key, [from, to]] of cut) {
    const [r, p] = key.split(':').map(Number);
    const piece = par.runs[r].pieces[p];
    const insert = placed ? '' : value;
    placed = true;
    if (piece.tab) { piece.tab = false; piece.text = insert; } else { piece.text = piece.text.slice(0, from) + insert + piece.text.slice(to); }
    piece.changed = true;
  }
}

function serializeParagraph(pXml, par) {
  let offset = 0;
  let out = '';
  for (const run of par.runs) {
    out += pXml.slice(offset, run.start);
    let k = 0;
    out += run.pieces.some((p) => p.changed)
      ? run.xml.replace(PIECE, () => {
        const p = run.pieces[k++];
        return p.tab ? '<w:tab/>' : `<w:t xml:space="preserve">${esc(p.text)}</w:t>`;
      })
      : run.xml;
    offset = run.start + run.xml.length;
  }
  return out + pXml.slice(offset);
}

const plainRPr = (rPr) => rPr.replace(/<w:b(?:\s[^>]*)?\/>|<w:bCs(?:\s[^>]*)?\/>|<w:u(?:\s[^>]*)?\/>|<w:caps(?:\s[^>]*)?\/>/g, '');
const newRun = (rPr, value) => `<w:r>${plainRPr(rPr || '')}<w:t xml:space="preserve">${esc(value)}</w:t></w:r>`;
const paraText = (pXml) => parseParagraph(pXml).scan.replace(/\uE000/g, ' ');

/**
 * Walks the paragraphs of a segment (not inside tables handled elsewhere).
 * decide(field) → value string to write, or null to leave it.
 */
function processParagraphs(seg, decide, { labelOnly = true } = {}) {
  const paras = [...seg.matchAll(INNER_P)];
  const texts = paras.map((m) => paraText(m[0]).trim());
  let out = '';
  let last = 0;
  paras.forEach((m, i) => {
    const pXml = m[0];
    const par = parseParagraph(pXml);
    const edits = [];
    let prevEnd = 0;
    for (const b of par.scan.matchAll(BLANK)) {
      const before = par.scan.slice(prevEnd, b.index).replace(/\uE000/g, ' ');
      let label = cleanLabel(before.split(/[.;]\s|,\s(?=[A-Z])/).pop());
      let kind = 'line';
      if (!before.trim() && !par.scan.slice(b.index + b[0].length).replace(/[\s\uE000_.…]/g, '') && texts[i + 1] && isLabel(texts[i + 1])) {
        label = cleanLabel(texts[i + 1]);
        kind = 'signature';
      }
      prevEnd = b.index + b[0].length;
      if (!isLabel(label)) continue;
      edits.push({ s: b.index, e: b.index + b[0].length, label, kind });
    }
    let append = null;
    if (!edits.length && labelOnly) {
      const lm = texts[i].match(/^([^:]{2,60}):\s*$/);
      const next = texts[i + 1];
      if (lm && isLabel(lm[1]) && (!next || /^[^:]{2,60}:/.test(next))) append = { label: cleanLabel(lm[1]), kind: 'after label' };
    }
    if (!edits.length && !append) return;
    let changed = false;
    // Ask in reading order; write from the end so earlier offsets stay right.
    const chosen = edits.map((ed) => decide({ label: ed.label, kind: ed.kind }));
    for (let k = edits.length - 1; k >= 0; k -= 1) {
      const v = chosen[k];
      if (v === null || v === undefined || v === '') continue;
      applyEdit(par, edits[k].s, edits[k].e, String(v));
      changed = true;
    }
    let next = changed ? serializeParagraph(pXml, par) : pXml;
    if (append) {
      const v = decide({ label: append.label, kind: append.kind });
      if (v !== null && v !== undefined && v !== '') {
        const lastRPr = par.runs.length ? par.runs[par.runs.length - 1].rPr : '';
        next = next.replace(/<\/w:p>$/, `${newRun(lastRPr, ` ${v}`)}</w:p>`);
        changed = true;
      }
    }
    if (changed) { out += seg.slice(last, m.index) + next; last = m.index + pXml.length; }
  });
  return out + seg.slice(last);
}

/** Top-level <w:tbl> spans (depth-aware, so tables inside tables stay with their parent). */
function topTables(xml) {
  const spans = [];
  const re = /<w:tbl>|<\/w:tbl>/g;
  let depth = 0;
  let start = -1;
  for (const m of xml.matchAll(re)) {
    if (m[0] === '<w:tbl>') { if (depth === 0) start = m.index; depth += 1; } else { depth -= 1; if (depth === 0) spans.push([start, m.index + m[0].length]); }
  }
  return spans;
}

const cellIsEmpty = (tc) => !paraText(tc).trim() && !/<w:drawing|<w:pict|<w:sym |w14:checkbox|<w:object/.test(tc);

function processTable(tbl, decide, notes) {
  if (/<w:tbl>/.test(tbl.slice(7))) return processParagraphs(tbl, decide); // nested tables: blanks in text only
  const rows = [...tbl.matchAll(/<w:tr[ >][\s\S]*?<\/w:tr>/g)];
  const cellsOf = (tr) => [...tr.matchAll(/<w:tc>[\s\S]*?<\/w:tc>/g)];
  const first = rows[0] ? cellsOf(rows[0][0]) : [];
  // A grid (heading row, then rows to fill per learner/item) is a list, not a form.
  const grid = rows.length >= 3 && first.length >= 2 && first.every((c) => !cellIsEmpty(c[0]));
  if (grid && rows.slice(1).some((r) => cellsOf(r[0]).some((c) => cellIsEmpty(c[0])))) notes.grids += 1;
  let out = '';
  let last = 0;
  for (const r of rows) {
    const cells = cellsOf(r[0]);
    const texts = cells.map((c) => paraText(c[0]).trim());
    const fieldAt = new Set();
    const labelAt = new Set();
    if (!grid) {
      cells.forEach((c, i) => {
        if (i > 0 && cellIsEmpty(c[0]) && isLabel(texts[i - 1]) && !labelAt.has(i - 1) && !fieldAt.has(i - 1)) { fieldAt.add(i); labelAt.add(i - 1); }
      });
    }
    let rowOut = '';
    let rl = 0;
    cells.forEach((c, i) => {
      let tc = c[0];
      if (fieldAt.has(i)) {
        const v = decide({ label: cleanLabel(texts[i - 1]), kind: 'table cell' });
        if (v !== null && v !== undefined && v !== '') {
          const labelRPr = (cells[i - 1][0].match(/<w:r[ >][\s\S]*?(<w:rPr>[\s\S]*?<\/w:rPr>)/) || [])[1] || '';
          tc = /<w:p\/>/.test(tc) && !/<w:p[ >]/.test(tc)
            ? tc.replace('<w:p/>', `<w:p>${newRun(labelRPr, v)}</w:p>`)
            : tc.replace(/<\/w:p>/, `${newRun(labelRPr, v)}</w:p>`);
        }
      } else {
        tc = processParagraphs(tc, decide, { labelOnly: !labelAt.has(i) });
      }
      rowOut += r[0].slice(rl, c.index) + tc;
      rl = c.index + c[0].length;
    });
    rowOut += r[0].slice(rl);
    out += tbl.slice(last, r.index) + rowOut;
    last = r.index + r[0].length;
  }
  return out + tbl.slice(last);
}

function processBody(xml, decide, notes) {
  let out = '';
  let last = 0;
  for (const [s, e] of topTables(xml)) {
    out += processParagraphs(xml.slice(last, s), decide) + processTable(xml.slice(s, e), decide, notes);
    last = e;
  }
  return out + processParagraphs(xml.slice(last), decide);
}

async function walk(bytes, decide) {
  const PizZip = interop(await import('pizzip'));
  const zip = new PizZip(toUint8(bytes));
  const doc = zip.file('word/document.xml');
  if (!doc) throw new Error('This file is not a Word document (.docx).');
  const notes = { grids: 0 };
  const xml = processBody(doc.asText(), decide, notes);
  return { zip, xml, notes };
}

/**
 * The blanks in the form, in order. Labels used twice get " (2)", " (3)".
 * → { fields: [{ id, label, kind }], grids }
 */
export async function scanWordForm(bytes) {
  const fields = [];
  const seen = new Map();
  const { notes } = await walk(bytes, (f) => {
    const n = (seen.get(f.label.toLowerCase()) || 0) + 1;
    seen.set(f.label.toLowerCase(), n);
    fields.push({ id: `f${fields.length + 1}`, label: n > 1 ? `${f.label} (${n})` : f.label, kind: f.kind });
    return null;
  });
  return { fields, grids: notes.grids };
}

/** The filled form. values: { [field id]: text } (fields without a value stay blank). */
export async function fillWordForm(bytes, values = {}) {
  let n = 0;
  const { zip, xml } = await walk(bytes, () => {
    n += 1;
    const v = values[`f${n}`];
    return v === undefined || v === null || String(v).trim() === '' ? null : String(v);
  });
  zip.file('word/document.xml', xml);
  return toUint8(zip.generate({ type: 'uint8array', compression: 'DEFLATE' }));
}

const norm = (s) => String(s || '').toLowerCase().replace(/\s*\(\d+\)$/, '').replace(/&/g, ' and ').replace(/[^a-z0-9ñ]/g, '');

/** Teacher-profile details a form label can ask for (only filled profile fields). */
export function profileValueFor(label, { teacher = {}, schoolYear = '', today = null } = {}) {
  const l = String(label || '').toLowerCase().replace(/\(\d+\)$/, '').trim();
  const pick = (v) => (String(v || '').trim() ? String(v).trim() : null);
  if (/^(name of (the )?)?(teacher|adviser|class adviser|employee)('?s)?( name)?$|^teacher'?s name$|^prepared by$|^(subject )?teacher$|^printed name$|^signature over printed name/.test(l)) return pick(teacher.fullName);
  if (/^(name of )?school( name)?$/.test(l)) return pick(teacher.school);
  if (/^school id$/.test(l)) return pick(teacher.schoolId);
  if (/^district$/.test(l)) return pick(teacher.district);
  if (/^(schools )?division$/.test(l)) return pick(teacher.division);
  if (/^region$/.test(l)) return pick(teacher.region);
  if (/^(position|designation)$/.test(l)) return pick(teacher.position);
  if (/^(school year|s\.?y\.?)$/.test(l)) return pick(schoolYear);
  if (/^date$/.test(l) && today) return today.toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' });
  return null;
}

/**
 * Teacher-given values matched to field labels: the same words, ignoring case, punctuation
 * and "&" vs "and". A label used twice ("Name (2)") can be given by that exact name.
 * Only exact matches: "Name" never takes the value meant for "Name of Parent".
 */
export function matchGivenValues(fields, given = {}) {
  const out = {};
  const keys = Object.keys(given || {});
  const exactKey = (s) => String(s || '').toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9ñ()]/g, '');
  for (const f of fields) {
    const hit = keys.find((k) => exactKey(k) === exactKey(f.label)) ?? keys.find((k) => norm(k) === norm(f.label) && !/\(\d+\)$/.test(f.label));
    if (hit !== undefined && String(given[hit] ?? '').trim()) out[f.id] = String(given[hit]).trim();
  }
  return out;
}
