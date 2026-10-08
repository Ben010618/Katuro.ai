/**
 * formulaColumns.js — computed columns written as real Excel formulas in the teacher's own
 * grade sheet (ExcelJS workbook, changed in place), by code only:
 *   Remarks     =IF(G12="","",IFERROR(IF(--G12>=75,"Passed","Failed"),"Check"))   (DO 15 para. 52)
 *   Descriptor  Advancing / Benchmarking / Connecting / Developing / Emerging      (DO 15 Annex G)
 *   Rank        =IF(G12="","",IFERROR(RANK(--G12,$G$12:$G$51,0),""))
 *   Counts      number passed (75 and above) / failed (below 75) under the table
 * Each formula also gets its answer saved, so the sheet shows values before Excel recalculates.
 */
import { workbookRows, learnersFromRows } from './privacyCopy.js';

export const PASSING = 75;
const GRADE_PRIORITY = [
  /final\s*grade|^fg$/i,
  /general\s*average|^ga$/i,
  /(quarterly|term|transmuted)\s*grade|^qg$|^tg$/i,
  /^ave(rage|\.)?$|^average\b/i,
  /^grade$/i,
];
const KIND_HEADER = { remarks: /^remarks?$/i, descriptor: /^descriptors?$/i, rank: /^rank(ing)?$/i };
const KIND_TITLE = { remarks: 'Remarks', descriptor: 'Descriptor', rank: 'Rank' };

const text = (v) => (v === null || v === undefined ? '' : String(v)).replace(/\s+/g, ' ').trim();
export const colLetter = (n) => { let s = ''; for (let c = n; c > 0; c = Math.floor((c - 1) / 26)) s = String.fromCharCode(65 + ((c - 1) % 26)) + s; return s; };
const colNumber = (letters) => [...letters.toUpperCase()].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0);

/** The number a grade cell holds (typed, saved formula answer, or a number typed as text). */
export function gradeNumber(v) {
  if (typeof v === 'number') return v;
  if (v && typeof v === 'object' && 'result' in v) return gradeNumber(v.result);
  if (typeof v === 'string' && /^\s*\d+(\.\d+)?\s*$/.test(v)) return Number(v);
  return null;
}
/** Empty, or a formula whose answer is empty. */
const isBlank = (v) => v === null || v === undefined || (typeof v === 'string' && !v.trim())
  || (v && typeof v === 'object' && ('formula' in v || 'sharedFormula' in v) && typeof v.result === 'string' && !v.result.trim());
/** A formula Excel has not worked out yet (no saved answer): Excel fills it in on opening. */
const notWorkedOut = (v) => v && typeof v === 'object' && ('formula' in v || 'sharedFormula' in v) && (v.result === undefined || v.result === null);
/** Text that is not a grade ("INC", "dropped"): the formula shows "Check". */
const notAGrade = (v) => !isBlank(v) && !notWorkedOut(v) && gradeNumber(v) === null;

/**
 * Where the learners and their grades are.
 *   gradeColumn: heading text or a column letter ("G"), when the teacher named it
 * → { ws, headerRow, headerRows: [r…], nameCol, gradeCol, gradeHeader, learnerRows: [r…] }
 *   or { ask: question, choices }
 */
export function locateGradeTable(wb, { sheet, gradeColumn } = {}) {
  const sheets = workbookRows(wb);
  const candidates = [];
  for (const [si, s] of sheets.entries()) {
    if (sheet && s.name.toLowerCase() !== String(sheet).toLowerCase()) continue;
    const found = learnersFromRows(s.rows);
    if (found.header < 0 || !found.learners.length) continue;
    const ws = wb.worksheets[si];
    const nameIdx = found.columns.name >= 0 ? found.columns.name : found.columns.last;
    const headerRow = found.header + 1;
    // Learner rows: a name in the names column (Male/Female/Total lines are not learners).
    const names = new Set(found.learners.map((l) => l.name));
    const learnerRows = [];
    s.rows.forEach((row, i) => {
      if (i <= found.header) return;
      const t = text((row || [])[nameIdx]).replace(/^\d{1,3}\s*[.)-]\s*/, '');
      const full = found.columns.name >= 0 ? t : `${t}, ${text((row || [])[found.columns.first])}${found.columns.middle >= 0 && text((row || [])[found.columns.middle]) ? ` ${text((row || [])[found.columns.middle])}` : ''}`;
      if (names.has(full)) learnerRows.push(i + 1);
    });
    // Headings can sit on two rows (merged): look at the heading row and the two below it.
    const headerRows = [headerRow, headerRow + 1, headerRow + 2].filter((r) => r < (learnerRows[0] || Infinity));
    const heads = new Map(); // column → heading text
    for (const r of headerRows) (s.rows[r - 1] || []).forEach((v, c) => { if (text(v) && !heads.has(c + 1)) heads.set(c + 1, text(v)); });
    const numericShare = (col) => learnerRows.filter((r) => gradeNumber(ws.getRow(r).getCell(col).value) !== null).length / Math.max(1, learnerRows.length);
    let picks = [];
    if (gradeColumn) {
      const g = String(gradeColumn).trim();
      if (/^[A-Za-z]{1,3}$/.test(g) && ![...heads.values()].some((h) => h.toLowerCase() === g.toLowerCase())) picks = [colNumber(g)];
      else picks = [...heads.entries()].filter(([, h]) => h.toLowerCase().replace(/[^a-z0-9]/g, '') === g.toLowerCase().replace(/[^a-z0-9]/g, '')).map(([c]) => c);
    } else {
      for (const re of GRADE_PRIORITY) {
        picks = [...heads.entries()].filter(([, h]) => re.test(h)).map(([c]) => c).filter((c) => numericShare(c) >= 0.5);
        if (picks.length) break;
      }
    }
    candidates.push({ ws, headerRow, headerRows, nameCol: nameIdx + 1, picks, heads, learnerRows });
  }
  if (!candidates.length) return { ask: 'I could not find a learner list with a names column in this file. Which sheet has the learners and their grades?' };
  const withPick = candidates.filter((c) => c.picks.length);
  if (!withPick.length) {
    const c = candidates[0];
    const choices = [...c.heads.entries()].filter(([col]) => c.learnerRows.some((r) => gradeNumber(c.ws.getRow(r).getCell(col).value) !== null)).map(([, h]) => h).slice(0, 6);
    return { ask: `Which column has the grades to use${gradeColumn ? ` (I found no column "${gradeColumn}")` : ''}?${choices.length ? ` Columns with numbers: ${choices.join(', ')}.` : ''}`, choices };
  }
  if (withPick.length > 1 || withPick[0].picks.length > 1) {
    const choices = withPick.flatMap((c) => c.picks.map((col) => `${c.heads.get(col) || colLetter(col)} (${c.ws.name}, column ${colLetter(col)})`)).slice(0, 6);
    return { ask: `Which grades should I use? I found: ${choices.join('; ')}.`, choices };
  }
  const c = withPick[0];
  const gradeCol = c.picks[0];
  return { ws: c.ws, headerRow: c.headerRow, headerRows: c.headerRows, nameCol: c.nameCol, gradeCol, gradeHeader: c.heads.get(gradeCol) || `column ${colLetter(gradeCol)}`, learnerRows: c.learnerRows };
}

const remarkFor = (n) => (n === null ? '' : n >= PASSING ? 'Passed' : 'Failed');
const descriptorFor = (n) => (n === null ? '' : n >= 90 ? 'Advancing' : n >= 80 ? 'Benchmarking' : n >= 75 ? 'Connecting' : n >= 65 ? 'Developing' : 'Emerging');

/** Saved answers for a column of grades: Excel's RANK (ties share a rank, highest = 1). */
function rankOf(n, all) { return n === null ? '' : 1 + all.filter((x) => x !== null && x > n).length; }

function copyStyle(from, to) {
  const s = from?.style ? JSON.parse(JSON.stringify(from.style)) : {};
  delete s.numFmt;
  to.style = s;
}

/**
 * Adds the formula columns (and counts) next to the table.
 *   kinds: ['remarks', 'descriptor', 'rank', 'counts']; replace: overwrite a filled column of the same name
 * → { added: [{ kind, column, header, reused }], counts: { passed, failed, row } | null } or { ask }
 */
export function addFormulaColumns(wb, loc, kinds = ['remarks'], { replace = false } = {}) {
  const { ws, headerRow, headerRows, gradeCol, learnerRows } = loc;
  const G = colLetter(gradeCol);
  const first = learnerRows[0];
  const last = learnerRows[learnerRows.length - 1];
  const grades = learnerRows.map((r) => {
    const v = ws.getRow(r).getCell(gradeCol).value;
    return isBlank(v) ? null : gradeNumber(v);
  });
  // The last used heading column: new columns go right after it.
  let lastCol = 0;
  for (const r of headerRows) ws.getRow(r).eachCell({ includeEmpty: false }, (cell, c) => { if (text(cell.text)) lastCol = Math.max(lastCol, c); });
  const gradeHeadCell = ws.getRow(headerRow).getCell(gradeCol);
  const merges = (ws.model.merges || []).map((m) => m.split(':'));
  const gradeMerge = merges.find(([a]) => a === gradeHeadCell.address);
  const headSpan = gradeMerge ? Number(gradeMerge[1].replace(/^[A-Z]+/, '')) - headerRow : 0;
  const added = [];
  for (const kind of kinds.filter((k) => KIND_TITLE[k])) {
    // An existing empty "Remarks"/"Rank" column in the template is used as is.
    let col = null;
    let reused = false;
    for (const r of headerRows) ws.getRow(r).eachCell({ includeEmpty: false }, (cell, c) => { if (!col && KIND_HEADER[kind].test(text(cell.text))) col = c; });
    if (col) {
      const filled = learnerRows.filter((r) => !isBlank(ws.getRow(r).getCell(col).value)).length;
      if (filled && !replace) return { ask: `Column ${colLetter(col)} ("${KIND_TITLE[kind]}") already has ${filled} value(s). Should I replace them with formulas?`, choices: ['Yes, replace them', 'No, add a new column'] };
      reused = true;
    } else {
      lastCol += 1;
      col = lastCol;
      const head = ws.getRow(headerRow).getCell(col);
      head.value = KIND_TITLE[kind];
      copyStyle(gradeHeadCell, head);
      if (headSpan > 0) ws.mergeCells(headerRow, col, headerRow + headSpan, col);
      if (!ws.getColumn(col).width || ws.getColumn(col).width < 12) ws.getColumn(col).width = kind === 'rank' ? 8 : 14;
    }
    const L = colLetter(col);
    learnerRows.forEach((r, i) => {
      const cell = ws.getRow(r).getCell(col);
      const g = `${G}${r}`;
      const n = grades[i];
      let formula;
      let result;
      if (kind === 'remarks') {
        formula = `IF(${g}="","",IFERROR(IF(--${g}>=${PASSING},"Passed","Failed"),"Check"))`;
        result = remarkFor(n);
      } else if (kind === 'descriptor') {
        formula = `IF(${g}="","",IFERROR(IF(--${g}>=90,"Advancing",IF(--${g}>=80,"Benchmarking",IF(--${g}>=75,"Connecting",IF(--${g}>=65,"Developing","Emerging")))),"Check"))`;
        result = descriptorFor(n);
      } else {
        formula = `IF(${g}="","",IFERROR(RANK(--${g},$${G}$${first}:$${G}$${last},0),""))`;
        result = rankOf(n, grades);
      }
      const nonNumber = notAGrade(ws.getRow(r).getCell(gradeCol).value);
      cell.value = { formula, result: nonNumber ? (kind === 'rank' ? '' : 'Check') : result };
      copyStyle(ws.getRow(r).getCell(gradeCol), cell);
      if (kind !== 'rank') cell.alignment = { ...(cell.alignment || {}), horizontal: 'center' };
    });
    added.push({ kind, column: L, header: KIND_TITLE[kind], reused });
  }
  let counts = null;
  if (kinds.includes('counts')) {
    // Two free rows under the table, in the names column (label) and the grade column (formula).
    let r = last + 2;
    const free = (row) => isBlank(ws.getRow(row).getCell(loc.nameCol).value) && isBlank(ws.getRow(row).getCell(gradeCol).value);
    while (!(free(r) && free(r + 1)) && r < last + 40) r += 1;
    const range = `${G}${first}:${G}${last}`;
    const passed = grades.filter((n) => n !== null && n >= PASSING).length;
    const failed = grades.filter((n) => n !== null && n < PASSING).length;
    ws.getRow(r).getCell(loc.nameCol).value = `Number passed (${PASSING} and above)`;
    ws.getRow(r).getCell(gradeCol).value = { formula: `COUNTIF(${range},">=${PASSING}")`, result: passed };
    ws.getRow(r + 1).getCell(loc.nameCol).value = `Number failed (below ${PASSING})`;
    ws.getRow(r + 1).getCell(gradeCol).value = { formula: `COUNTIF(${range},"<${PASSING}")`, result: failed };
    for (const rr of [r, r + 1]) { ws.getRow(rr).getCell(loc.nameCol).font = { bold: true }; ws.getRow(rr).getCell(gradeCol).font = { bold: true }; }
    counts = { passed, failed, row: r };
  }
  // Excel works the formulas out again when the file is opened.
  wb.calcProperties = { ...(wb.calcProperties || {}), fullCalcOnLoad: true };
  const checks = learnerRows.filter((r) => notAGrade(ws.getRow(r).getCell(gradeCol).value)).length;
  const blanks = learnerRows.filter((r) => { const v = ws.getRow(r).getCell(gradeCol).value; return isBlank(v) || (notWorkedOut(v) && gradeNumber(v) === null); }).length;
  return { added, counts, grades, checks, blanks };
}
