/**
 * fillTemplates.js — fill the teacher's OWN files: {{tag}} Word templates and existing
 * Excel class records (fuzzy learner-name matching, styles/formulas preserved).
 */

import { toUint8, interop } from './shared.js';

// ── Word templates ───────────────────────────────────────────────────────────

export async function fillDocxTemplate(templateBytes, data = {}) {
  const PizZip = interop(await import('pizzip'));
  const Docxtemplater = interop(await import('docxtemplater'));
  const zip = new PizZip(toUint8(templateBytes));
  const doc = new Docxtemplater(zip, {
    delimiters: { start: '{{', end: '}}' },
    paragraphLoop: true,
    linebreaks: true,
    nullGetter: () => '',
  });
  doc.render(data || {});
  return toUint8(doc.getZip().generate({ type: 'uint8array', compression: 'DEFLATE' }));
}

const decodeXml = (s) => s
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
  .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n))).replace(/&amp;/g, '&');

/** Unique {{tag}} names in the document body, headers and footers (loop markers without #, /, ^). */
export async function listDocxPlaceholders(templateBytes) {
  const PizZip = interop(await import('pizzip'));
  const zip = new PizZip(toUint8(templateBytes));
  const parts = Object.keys(zip.files).filter((n) => /^word\/(document|header\d*|footer\d*)\.xml$/.test(n)).sort();
  const names = [];
  const seen = new Set();
  for (const p of parts) {
    // Strip XML tags so tags split across runs ({{na</w:t></w:r><w:r><w:t>me}}) rejoin.
    const text = decodeXml(zip.file(p).asText().replace(/<w:p[ >]/g, '\n$&').replace(/<[^>]+>/g, ''));
    const re = /\{\{\s*[#/^]?\s*([^{}]+?)\s*\}\}/g;
    let m;
    while ((m = re.exec(text))) {
      const name = m[1].trim();
      if (name && !seen.has(name)) {
        seen.add(name);
        names.push(name);
      }
    }
  }
  return names;
}

// ── Learner name matching ────────────────────────────────────────────────────

const SUFFIXES = new Set(['jr', 'sr', 'ii', 'iii', 'iv', 'v']);

const clean = (s) => String(s ?? '')
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[^a-z,\s'-]/g, ' ')
  .replace(/['-]/g, '')
  .replace(/\s+/g, ' ')
  .trim();

/** "Dela Cruz, Juan P." → "juan p dela cruz" (lowercase, no accents, "First Middle Last" order). */
export function normalizeLearnerName(name) {
  const s = clean(name);
  const comma = s.indexOf(',');
  const ordered = comma >= 0 ? `${s.slice(comma + 1)} ${s.slice(0, comma)}` : s;
  return ordered.replace(/,/g, ' ').replace(/\s+/g, ' ').trim();
}

const tokens = (name) => normalizeLearnerName(name).split(' ').filter((t) => t.length > 1 && !SUFFIXES.has(t));

function levRatio(a, b) {
  if (a === b) return 1;
  if (!a.length || !b.length) return 0;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return 1 - prev[b.length] / Math.max(a.length, b.length);
}

/** Similarity 0–1 between two learner names (order-, case-, accent- and initial-insensitive). ≥0.85 = match. */
export function matchLearnerName(a, b) {
  const ta = tokens(a);
  const tb = tokens(b);
  if (!ta.length || !tb.length) return 0;
  const [small, large] = ta.length <= tb.length ? [ta, tb] : [tb, ta];
  const pool = [...large];
  let matched = 0;
  for (const t of small) {
    let best = 0;
    let bi = -1;
    pool.forEach((u, i) => {
      const r = levRatio(t, u);
      if (r > best) {
        best = r;
        bi = i;
      }
    });
    if (best >= 0.75) {
      // Squared so near-misses ("Maria" vs "Mario") cost more than they earn.
      matched += best * best;
      pool.splice(bi, 1);
    }
  }
  const dice = (2 * matched) / (ta.length + tb.length);
  // One list may omit a second given name ("Maria Santos" vs "Maria Clara Santos").
  const contained = small.length >= 2 && matched / small.length >= 0.95 ? Math.min(0.9, matched / small.length) : 0;
  // Split/merged surnames ("Delacruz" vs "Dela Cruz"): compare joined forms, any token rotation.
  let joined = 0;
  if (ta.length !== tb.length) {
    const target = tb.join('');
    for (let i = 0; i < ta.length; i++) joined = Math.max(joined, levRatio([...ta.slice(i), ...ta.slice(0, i)].join(''), target));
    if (joined < 0.95) joined = 0;
  }
  return Math.round(Math.max(dice, contained, joined) * 1000) / 1000;
}

// ── Excel helpers ────────────────────────────────────────────────────────────

const MATCH_MIN = 0.85;

function letterToNumber(letter) {
  let n = 0;
  for (const ch of String(letter).toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n;
}

function numberToLetter(n) {
  let s = '';
  for (let x = n; x > 0; x = Math.floor((x - 1) / 26)) s = String.fromCharCode(65 + ((x - 1) % 26)) + s;
  return s;
}

function cellText(cell) {
  const v = cell?.value;
  if (v === null || v === undefined) return '';
  if (typeof v === 'object') {
    if (Array.isArray(v.richText)) return v.richText.map((r) => r.text).join('');
    if ('result' in v) return v.result === undefined || v.result === null ? '' : String(v.result);
    if ('text' in v) return String(v.text);
    if (v instanceof Date) return v.toISOString();
    return '';
  }
  return String(v);
}

const HEADER_WORDS = /^(no\.?|names?|learners?'?s?'? ?names?|learners?|students?|pupils?|male|female|boys?|girls?|total|highest possible score|hps|sex|gender)$/i;

function looksLikePersonName(text) {
  // A list number in front ("1. Jose Dela Cruz", "12) Ana Reyes") is not part of the name.
  const t = String(text || '').trim().replace(/^\d{1,3}\s*[.)-]\s*/, '');
  if (!t || t.length < 4 || t.length > 80) return false;
  if (HEADER_WORDS.test(t)) return false;
  if (/\d/.test(t)) return false;
  if (!/^[\p{L}.,'\-\s]+$/u.test(t)) return false;
  return t.includes(',') || t.split(/\s+/).length >= 2;
}

async function loadWorkbook(bytes) {
  const ExcelJS = interop(await import('exceljs'));
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(toUint8(bytes));
  return wb;
}

function resolveColumn(ws, col, headerRows = 15) {
  if (typeof col === 'number' && col >= 1) return col;
  const s = String(col ?? '').trim();
  if (!s) return null;
  if (/^\d+$/.test(s)) return Number(s);
  if (/^[A-Z]{1,3}$/.test(s)) return letterToNumber(s);
  const want = s.toLowerCase().replace(/\s+/g, ' ');
  let partial = null;
  for (let r = 1; r <= Math.min(headerRows, ws.rowCount || headerRows); r++) {
    const row = ws.getRow(r);
    for (let c = 1; c <= (ws.columnCount || row.cellCount); c++) {
      const text = cellText(row.getCell(c)).toLowerCase().replace(/\s+/g, ' ').trim();
      if (!text) continue;
      if (text === want) return c;
      if (!partial && text.includes(want)) partial = c;
    }
  }
  return partial;
}

/** Sheet names + header-ish text cells from the first 15 rows. */
export async function findWorkbookColumns(workbookBytes, sheetName) {
  const wb = await loadWorkbook(workbookBytes);
  const sheets = wb.worksheets.map((w) => w.name);
  const ws = (sheetName && wb.getWorksheet(sheetName)) || wb.worksheets[0];
  const headers = [];
  if (ws) {
    for (let r = 1; r <= Math.min(15, ws.rowCount); r++) {
      const row = ws.getRow(r);
      row.eachCell({ includeEmpty: false }, (cell, c) => {
        if (cell.isMerged && cell.master !== cell) return;
        const text = cellText(cell).trim();
        if (text && Number.isNaN(Number(text))) headers.push({ row: r, col: c, letter: numberToLetter(c), text });
      });
    }
  }
  return { sheets, headers };
}

/**
 * Writes learner scores into the teacher's existing workbook by fuzzy name match.
 * scores: [{ name, score }]
 */
export async function writeScoresIntoWorkbook(workbookBytes, {
  sheetName, nameColumn = 'B', startRow, targetColumn, scores = [], overwrite = false,
} = {}) {
  const wb = await loadWorkbook(workbookBytes);
  const ws = (sheetName && wb.getWorksheet(sheetName)) || wb.worksheets[0];
  if (!ws) throw new Error('Workbook has no worksheets.');
  const nameCol = resolveColumn(ws, nameColumn);
  if (!nameCol) throw new Error(`Name column "${nameColumn}" not found.`);
  const targetCol = resolveColumn(ws, targetColumn);
  if (!targetCol) throw new Error(`Target column "${targetColumn}" not found.`);

  const lastRow = ws.rowCount;
  let first = Number(startRow) || 0;
  if (!first) {
    for (let r = 1; r <= lastRow; r++) {
      if (looksLikePersonName(cellText(ws.getRow(r).getCell(nameCol)))) {
        first = r;
        break;
      }
    }
  }
  const candidates = [];
  if (first) {
    for (let r = first; r <= lastRow; r++) {
      const text = cellText(ws.getRow(r).getCell(nameCol)).trim();
      if (looksLikePersonName(text)) candidates.push({ row: r, name: text });
    }
  }

  const written = [];
  const unmatched = [];
  const skippedExisting = [];
  const used = new Set();
  for (const entry of scores || []) {
    const name = String(entry?.name ?? '').trim();
    if (!name) continue;
    let best = null;
    for (const cnd of candidates) {
      if (used.has(cnd.row)) continue;
      const s = matchLearnerName(name, cnd.name);
      if (s >= MATCH_MIN && (!best || s > best.s)) best = { ...cnd, s };
    }
    if (!best) {
      unmatched.push(name);
      continue;
    }
    used.add(best.row);
    const cell = ws.getRow(best.row).getCell(targetCol);
    const hasValue = cell.value !== null && cell.value !== undefined && cell.value !== '';
    if (hasValue && !overwrite) {
      skippedExisting.push(name);
      continue;
    }
    const num = typeof entry.score === 'number' ? entry.score : Number(String(entry.score ?? '').trim());
    const value = entry.score === null || entry.score === undefined || entry.score === '' ? null : Number.isFinite(num) ? num : String(entry.score);
    cell.value = value;
    written.push({ name, matchedName: best.name, row: best.row, score: value });
  }

  const bytes = toUint8(await wb.xlsx.writeBuffer());
  return { bytes, written, unmatched, skippedExisting };
}

/** A cell with nothing a teacher typed on purpose: empty, or only spaces/symbols (e.g. a stray "`"). */
function isBlankLike(value) {
  if (value === null || value === undefined) return true;
  if (typeof value === 'string') return !/[\p{L}\p{N}]/u.test(value);
  return false;
}

/**
 * Fills several columns of the teacher's own table at once (one source per column),
 * matching learners by name, keeping every format and formula. Optionally adds an
 * =AVERAGE() formula per learner in an empty "Average" column.
 *   columns: [{ targetColumn, label, scores: [{ name, score }] }]
 * → { bytes, filled: [{ label, letter, written, unmatched, keptExisting }], symbolCellsReplaced, averageRows, rows }
 */
export async function fillColumnsInWorkbook(workbookBytes, { sheetName, nameColumn = 'B', columns = [], averageColumn = null } = {}) {
  const wb = await loadWorkbook(workbookBytes);
  const ws = (sheetName && wb.getWorksheet(sheetName)) || wb.worksheets[0];
  if (!ws) throw new Error('Workbook has no worksheets.');
  const nameCol = resolveColumn(ws, nameColumn);
  if (!nameCol) throw new Error(`Name column "${nameColumn}" not found.`);

  const candidates = [];
  for (let r = 1; r <= ws.rowCount; r++) {
    const text = cellText(ws.getRow(r).getCell(nameCol)).trim();
    if (looksLikePersonName(text)) candidates.push({ row: r, name: text });
  }
  if (!candidates.length) throw new Error('I could not find the learner names in your file.');

  const filled = [];
  const symbolCellsReplaced = [];
  for (const col of columns) {
    const letterCol = resolveColumn(ws, col.targetColumn);
    if (!letterCol) throw new Error(`Column "${col.targetColumn}" not found in your file.`);
    const used = new Set();
    const report = { label: col.label, letter: numberToLetter(letterCol), written: 0, unmatched: [], keptExisting: [] };
    for (const entry of col.scores || []) {
      const name = String(entry?.name ?? '').trim();
      if (!name) continue;
      let best = null;
      for (const cnd of candidates) {
        if (used.has(cnd.row)) continue;
        const s = matchLearnerName(name, cnd.name);
        if (s >= MATCH_MIN && (!best || s > best.s)) best = { ...cnd, s };
      }
      if (!best) { report.unmatched.push(name); continue; }
      used.add(best.row);
      const cell = ws.getRow(best.row).getCell(letterCol);
      if (!isBlankLike(cell.value)) { report.keptExisting.push(`${report.letter}${best.row}`); continue; }
      if (cell.value !== null && cell.value !== undefined && cell.value !== '') symbolCellsReplaced.push({ cell: `${report.letter}${best.row}`, was: String(cell.value) });
      const num = typeof entry.score === 'number' ? entry.score : Number(String(entry.score ?? '').trim());
      cell.value = Number.isFinite(num) ? num : String(entry.score ?? '');
      report.written += 1;
    }
    filled.push(report);
  }

  // =AVERAGE() of the filled columns, only where the teacher's Average cell is empty.
  const averageRows = [];
  const avgCol = averageColumn ? resolveColumn(ws, averageColumn) : null;
  if (avgCol) {
    const letters = filled.map((f) => f.letter);
    for (const { row } of candidates) {
      const cell = ws.getRow(row).getCell(avgCol);
      if (!isBlankLike(cell.value)) continue;
      const nums = letters.map((l) => ws.getCell(`${l}${row}`).value).filter((v) => typeof v === 'number');
      if (!nums.length) continue;
      const result = Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 100) / 100;
      cell.value = { formula: `AVERAGE(${letters.map((l) => `${l}${row}`).join(',')})`, result };
      averageRows.push(row);
    }
  }

  const rows = candidates.map(({ row, name }) => ({
    row,
    name,
    values: [...filled.map((f) => ws.getCell(`${f.letter}${row}`).value), avgCol ? (ws.getRow(row).getCell(avgCol).value?.result ?? ws.getRow(row).getCell(avgCol).value) : undefined],
  }));
  const bytes = toUint8(await wb.xlsx.writeBuffer());
  return { bytes, filled, symbolCellsReplaced, averageRows, rows };
}
