/**
 * gradeCheck.js — checks the teacher's grade sheets before they submit them, by code
 * only (nothing is sent to the AI, nothing is changed):
 *   - missing grades, text where a grade should be, grades outside 0–100, grades below
 *     60 (the lowest grade DepEd allows on report cards: DO 15, s. 2026, Annex D para 18),
 *     scores above the Highest Possible Score;
 *   - totals and averages that do not add up (typed by hand, or formulas whose saved
 *     result is out of date);
 *   - duplicate LRNs, LRNs that are not 12 digits, one LRN with different names;
 *   - the same learner spelled differently in different files, and learners missing
 *     from some of the files.
 *
 * Input: files = [{ name, sheets: [{ name, cells: [[{ v, f }]] }] }]
 *   v = value (number / string / null), f = formula text without "=" (or null).
 * → { issues: [{ severity: 'error'|'warning', type, file, sheet, cell, learner, detail }], checked: {...} }
 */
import { matchLearnerName, normalizeLearnerName } from '../generators/fillTemplates.js';
import { matchLearningArea } from '../knowledge/gradingRules.js';

const DO15_MIN = 'DO 15, s. 2026, Annex D para 18';
const NAME_HEADER = /\b(name|names|learner'?s?|pangalan|student'?s?|pupil'?s?)\b/i;
const NOT_A_LEARNER = /^(male|female|boys?|girls?|lalaki|babae|total|average|mean|highest|lowest|hps|no\.?)\b/i;
const GRADE_HEADER = /\b(grade|rating|final|term|quarter|qtr|general\s+average|average|ave\.?|transmuted|initial)\b/i;
const TOTAL_HEADER = /^(total|sum|kabuuan)\b/i;
const AVERAGE_HEADER = /^(average|ave\.?|avg\.?|general\s+average|gen\.?\s*ave\.?|mean)$/i;
const HPS_LABEL = /highest\s+possible|^hps\b/i;

const text = (v) => (v === null || v === undefined ? '' : String(v)).trim();
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const asNum = (v) => (isNum(v) ? v : (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v.trim())) ? Number(v.trim()) : null));

export function colLetter(c) {
  let s = '';
  let n = c + 1;
  while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); }
  return s;
}
function colIndex(letters) {
  let n = 0;
  for (const ch of letters.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}
const addr = (r, c) => `${colLetter(c)}${r + 1}`;

/** Cells a SUM/AVERAGE formula (or A1+B1+…) uses, as [row, col] pairs; null when it is something else. */
export function formulaRefs(f) {
  const t = String(f || '').replace(/\$/g, '').replace(/\s+/g, '').toUpperCase();
  let m = t.match(/^(SUM|AVERAGE)\(([A-Z0-9:,]+)\)$/);
  let fn = m?.[1];
  let list = m?.[2];
  if (!m) {
    if (!/^[A-Z]+\d+(\+[A-Z]+\d+)+$/.test(t)) return null;
    fn = 'SUM';
    list = t.split('+').join(',');
  }
  const refs = [];
  for (const part of list.split(',')) {
    const range = part.match(/^([A-Z]+)(\d+)(?::([A-Z]+)(\d+))?$/);
    if (!range) return null;
    const [, c1, r1, c2 = c1, r2 = r1] = range;
    for (let r = Math.min(+r1, +r2); r <= Math.max(+r1, +r2); r++) {
      for (let c = Math.min(colIndex(c1), colIndex(c2)); c <= Math.max(colIndex(c1), colIndex(c2)); c++) refs.push([r - 1, c]);
    }
  }
  return { fn, refs };
}

/** The learner table of one sheet: header row, name/LRN columns, learner rows, column labels. */
function findTable(cells) {
  let headerRow = -1;
  let nameCol = -1;
  for (let r = 0; r < Math.min(cells.length, 25) && headerRow < 0; r++) {
    (cells[r] || []).forEach((cell, c) => {
      if (headerRow < 0 && NAME_HEADER.test(text(cell?.v)) && !/school|teacher|adviser/i.test(text(cell?.v))) { headerRow = r; nameCol = c; }
    });
  }
  if (headerRow < 0) return null;
  const width = Math.max(...cells.map((row) => (row || []).length));
  const label = (c) => {
    const own = text(cells[headerRow]?.[c]?.v);
    if (own) return own;
    for (let r = headerRow - 1; r >= Math.max(0, headerRow - 2); r--) { const up = text(cells[r]?.[c]?.v); if (up) return up; }
    return '';
  };
  const labels = Array.from({ length: width }, (_, c) => label(c));
  const lrnCol = labels.findIndex((l) => /\blrn\b/i.test(l));
  let hpsRow = -1;
  const learners = [];
  for (let r = headerRow + 1; r < cells.length; r++) {
    const row = cells[r] || [];
    const name = text(row[nameCol]?.v);
    const firstText = text(row.find((c) => text(c?.v))?.v);
    if (HPS_LABEL.test(name) || HPS_LABEL.test(firstText)) { hpsRow = r; continue; }
    if (!name || !/[A-Za-zÑñ]{2,}/.test(name) || NOT_A_LEARNER.test(name.replace(/^\d{1,3}\s*[.)-]\s*/, ''))) continue;
    learners.push({ r, name });
  }
  return { headerRow, nameCol, lrnCol, labels, learners, hpsRow, width };
}

/** Which columns hold grades, scores, totals or averages (ignores text columns). */
function classifyColumns(cells, table) {
  const cols = [];
  for (let c = 0; c < table.width; c++) {
    if (c === table.nameCol || c === table.lrnCol) continue;
    const label = table.labels[c];
    if (/\b(sex|gender|remarks?|lrn|no\.?|date|section|address|birth)\b/i.test(label) && !GRADE_HEADER.test(label)) continue;
    const vals = table.learners.map(({ r }) => cells[r]?.[c]);
    const filled = vals.filter((cell) => text(cell?.v) !== '' || cell?.f);
    const numeric = vals.filter((cell) => asNum(cell?.v) !== null || cell?.f);
    const kind = TOTAL_HEADER.test(label) ? 'total'
      : AVERAGE_HEADER.test(label) ? 'average'
        : GRADE_HEADER.test(label) || matchLearningArea(label) ? 'grade' : 'score';
    // A real data column: at least half the learners have a number in it.
    if (!table.learners.length || numeric.length < Math.ceil(table.learners.length / 2)) continue;
    cols.push({ c, label: label || colLetter(c), kind, filled: filled.length });
  }
  return cols;
}

function checkSheet(fileName, sheet, issues) {
  const { cells } = sheet;
  const table = findTable(cells);
  if (!table || !table.learners.length) return null;
  const cols = classifyColumns(cells, table);
  const where = (r, c, learner, extra = {}) => ({ file: fileName, sheet: sheet.name, cell: addr(r, c), learner, ...extra });
  const push = (severity, type, r, c, learner, detail) => issues.push({ severity, type, ...where(r, c, learner), detail });

  for (const col of cols) {
    for (const { r, name } of table.learners) {
      const cell = cells[r]?.[col.c] || {};
      const raw = cell.v;
      const num = asNum(raw);
      if (text(raw) === '' && !cell.f) {
        if (col.kind !== 'score') push('error', 'Missing grade', r, col.c, name, `${col.label} is empty`);
        else push('warning', 'Missing score', r, col.c, name, `${col.label} is empty`);
        continue;
      }
      if (num === null && !cell.f) {
        push('error', 'Not a number', r, col.c, name, `${col.label} has "${text(raw).slice(0, 20)}" instead of a number`);
        continue;
      }
      const value = num ?? asNum(cell.result);
      if (value === null) continue;
      if (col.kind === 'grade' || col.kind === 'average') {
        if (value < 0 || value > 100) push('error', 'Out of range', r, col.c, name, `${col.label} is ${value} (grades are 0 to 100)`);
        else if (value < 60) push('warning', 'Below 60', r, col.c, name, `${col.label} is ${value}; the lowest grade DepEd allows on report cards is 60 (${DO15_MIN})`);
      } else if (value < 0) {
        push('error', 'Out of range', r, col.c, name, `${col.label} is ${value} (below 0)`);
      } else if (table.hpsRow >= 0) {
        const hps = asNum(cells[table.hpsRow]?.[col.c]?.v);
        if (hps !== null && value > hps) push('error', 'Above highest possible score', r, col.c, name, `${col.label} is ${value} but the highest possible score is ${hps}`);
      }
    }
  }

  // Totals and averages.
  const gradeCols = cols.filter((x) => x.kind === 'grade');
  for (const col of cols.filter((x) => x.kind === 'total' || x.kind === 'average')) {
    for (const { r, name } of table.learners) {
      const cell = cells[r]?.[col.c] || {};
      if (cell.f) {
        const refs = formulaRefs(cell.f);
        const saved = asNum(cell.result ?? cell.v);
        if (!refs || saved === null) continue;
        const nums = refs.refs.map(([rr, cc]) => asNum(cells[rr]?.[cc]?.v ?? cells[rr]?.[cc]?.result)).filter((v) => v !== null);
        if (!nums.length) continue;
        const expect = refs.fn === 'AVERAGE' ? nums.reduce((a, b) => a + b, 0) / nums.length : nums.reduce((a, b) => a + b, 0);
        if (Math.abs(expect - saved) > 0.01) push('error', 'Total does not add up', r, col.c, name, `the formula =${cell.f} gives ${round2(expect)}, but the file shows ${saved} (open the file in Excel and save it again to refresh, or check the formula)`);
        continue;
      }
      const typed = asNum(cell.v);
      if (typed === null) continue;
      if (col.kind === 'total') {
        // Hand-typed total: the number columns just before it (back to the previous total or a gap).
        const parts = [];
        for (let c = col.c - 1; c >= 0; c--) {
          const other = cols.find((x) => x.c === c);
          if (!other || other.kind === 'total' || c === table.nameCol) break;
          parts.unshift(c);
        }
        if (parts.length < 2) continue;
        const sum = parts.map((c) => asNum(cells[r]?.[c]?.v) ?? 0).reduce((a, b) => a + b, 0);
        if (Math.abs(sum - typed) > 0.01) push('error', 'Total does not add up', r, col.c, name, `${col.label} is ${typed}, but ${colLetter(parts[0])} to ${colLetter(parts[parts.length - 1])} add up to ${round2(sum)}`);
      } else {
        const others = gradeCols.filter((x) => x.c !== col.c).map((x) => asNum(cells[r]?.[x.c]?.v)).filter((v) => v !== null);
        if (others.length < 2) continue;
        const mean = others.reduce((a, b) => a + b, 0) / others.length;
        if (Math.abs(mean - typed) > 0.05 && Math.round(mean) !== typed) push('error', 'Average does not add up', r, col.c, name, `${col.label} is ${typed}, but the average of the grades is ${round2(mean)}`);
      }
    }
  }

  // LRNs inside the sheet.
  if (table.lrnCol >= 0) {
    const seen = new Map();
    for (const { r, name } of table.learners) {
      const lrn = text(cells[r]?.[table.lrnCol]?.v).replace(/\.0$/, '');
      if (!lrn) continue;
      if (!/^\d{12}$/.test(lrn)) push('warning', 'LRN format', r, table.lrnCol, name, `LRN "${lrn}" is not 12 digits`);
      if (seen.has(lrn)) push('error', 'Duplicate LRN', r, table.lrnCol, name, `same LRN as ${seen.get(lrn).name} (row ${seen.get(lrn).r + 1})`);
      else seen.set(lrn, { r, name });
    }
  }

  return {
    learners: table.learners.map(({ r, name }) => ({ name, lrn: table.lrnCol >= 0 ? text(cells[r]?.[table.lrnCol]?.v).replace(/\.0$/, '') : '', cell: addr(r, table.nameCol) })),
    columns: cols.length,
  };
}

const round2 = (n) => Math.round(n * 100) / 100;

/** Checks every file; across-file checks run when there are two or more learner lists. */
export function checkGradeFiles(files) {
  const issues = [];
  const lists = [];
  let sheetsChecked = 0;
  for (const file of files || []) {
    for (const sheet of file.sheets || []) {
      const res = checkSheet(file.name, sheet, issues);
      if (!res) continue;
      sheetsChecked += 1;
      lists.push({ file: file.name, sheet: sheet.name, learners: res.learners });
    }
  }

  // Across files: one LRN with different names; spellings; learners missing from a list.
  if (lists.length >= 2) {
    const byLrn = new Map();
    for (const list of lists) for (const l of list.learners) {
      if (!/^\d{12}$/.test(l.lrn)) continue;
      const prev = byLrn.get(l.lrn);
      if (prev && prev.file === list.file) continue; // a duplicate inside one file is reported as "Duplicate LRN"
      if (prev && normalizeLearnerName(prev.name) !== normalizeLearnerName(l.name) && matchLearnerName(prev.name, l.name) < 0.85) {
        issues.push({ severity: 'error', type: 'Same LRN, different learner', file: list.file, sheet: list.sheet, cell: l.cell, learner: l.name, detail: `LRN ${l.lrn} is ${prev.name} in ${prev.file}` });
      } else if (!prev) byLrn.set(l.lrn, { ...l, file: list.file });
    }

    const reported = new Set();
    lists.forEach((a, i) => lists.forEach((b, j) => {
      if (j <= i) return;
      for (const la of a.learners) for (const lb of b.learners) {
        const na = normalizeLearnerName(la.name.replace(/^\d{1,3}\s*[.)-]\s*/, ''));
        const nb = normalizeLearnerName(lb.name.replace(/^\d{1,3}\s*[.)-]\s*/, ''));
        if (na === nb) continue;
        const key = [na, nb].sort().join('|');
        if (reported.has(key)) continue;
        if (matchLearnerName(la.name, lb.name) >= 0.85) {
          reported.add(key);
          issues.push({ severity: 'warning', type: 'Name spelled differently', file: b.file, sheet: b.sheet, cell: lb.cell, learner: lb.name, detail: `"${lb.name}" here, "${la.name}" in ${a.file}` });
        }
      }
    }));

    // Learners missing from a list (only lists of a similar class: at least half shared).
    for (const list of lists) {
      for (const other of lists) {
        if (other === list) continue;
        const shared = other.learners.filter((lo) => list.learners.some((l) => matchLearnerName(l.name, lo.name) >= 0.85)).length;
        if (shared < Math.ceil(Math.min(list.learners.length, other.learners.length) / 2)) continue;
        for (const lo of other.learners) {
          if (list.learners.some((l) => matchLearnerName(l.name, lo.name) >= 0.85)) continue;
          const key = `missing|${list.file}|${list.sheet}|${normalizeLearnerName(lo.name)}`;
          if (reported.has(key)) continue;
          reported.add(key);
          issues.push({ severity: 'warning', type: 'Learner missing', file: list.file, sheet: list.sheet, cell: '', learner: lo.name, detail: `in ${other.file} but not in this list` });
        }
      }
    }
  }

  const order = { error: 0, warning: 1 };
  issues.sort((a, b) => order[a.severity] - order[b.severity] || a.file.localeCompare(b.file) || a.type.localeCompare(b.type));
  return { issues, checked: { files: (files || []).length, sheets: sheetsChecked, learnerLists: lists.length } };
}

/** ExcelJS workbook → the plain cell grid checkGradeFiles reads. */
export function cellsFromExcelJs(ws) {
  const cells = [];
  ws.eachRow({ includeEmpty: true }, (row, r) => {
    const out = [];
    row.eachCell({ includeEmpty: true }, (cell, c) => {
      const v = cell.value;
      let entry;
      if (v && typeof v === 'object' && 'formula' in v) entry = { v: v.result ?? null, f: v.formula, result: v.result ?? null };
      else if (v && typeof v === 'object' && v.sharedFormula) entry = { v: v.result ?? null, f: null, result: v.result ?? null };
      else if (v && typeof v === 'object' && v.richText) entry = { v: v.richText.map((t) => t.text).join(''), f: null };
      else if (v instanceof Date) entry = { v: v.toISOString().slice(0, 10), f: null };
      else entry = { v: v ?? null, f: null };
      out[c - 1] = entry;
    });
    cells[r - 1] = out;
  });
  return Array.from({ length: cells.length }, (_, i) => Array.from({ length: (cells[i] || []).length }, (_, j) => cells[i]?.[j] || { v: null, f: null }));
}
