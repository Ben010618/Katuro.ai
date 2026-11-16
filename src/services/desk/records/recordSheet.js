/**
 * recordSheet.js — reads a DepEd E-Class Record (Written Work / Performance Task / Quarterly
 * Assessment) the way the KaTuro App needs it, and plans the cells to write when the
 * teacher records one task's scores from the phone.
 *
 * Done by code only (no AI): the layout comes from readers/scoreSheet.js, which already
 * knows E-Class Records (group headers, HPS row, Male/Female dividers).
 *
 * The rule (classRecords.js): learners are matched by LRN only, and nothing is recorded
 * into a record that is not ready (full name + 12-digit LRN for every learner).
 */
import { detectScoreTable } from '../readers/scoreSheet.js';
import { indexToCol } from '../docmap/addr.js';
import { checkClassList, cleanLrn } from './classRecords.js';

const COMPONENTS = [['ww', 'Written Work'], ['pt', 'Performance Task'], ['qa', 'Quarterly Assessment']];
const LRN_HEADER = /^\s*(lrn|learner'?s?\s+reference\s+(no\.?|number))\s*$/i;
const HEADER_SCAN_ROWS = 15;

const num = (v) => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(String(v).trim());
  return Number.isFinite(n) ? n : null;
};

/** A score cell → a number, the text in it ("Absent", "INC"), or undefined when blank. */
function cellValue(v) {
  if (v === null || v === undefined) return undefined;
  const t = String(v).trim();
  if (!t) return undefined;
  const n = num(t);
  return n === null ? t : n;
}

function findLrnColumn(rows, table) {
  const last = Math.min(rows.length, Math.max(HEADER_SCAN_ROWS, (table.headerRowIndex ?? 0) + 3));
  for (let r = 0; r < last; r++) {
    const row = rows[r] || [];
    for (let c = 0; c < row.length; c++) if (LRN_HEADER.test(String(row[c] ?? ''))) return c;
  }
  return null;
}

/**
 * parsed = readDocument(...) of an .xlsx
 * → { sheet, learners: [{ row, name, lrn, sex }], columns: [{ key, component, componentLabel, n, label, cell (column letter), hps, hpsCell, filled }],
 *     scores: { [key]: { [lrn]: number } }, ready, problems }
 *   or { error } when no E-Class Record table is found.
 * Rows are Excel row numbers (1-based).
 */
export function readClassRecord(parsed) {
  for (const sheet of parsed?.sheets || []) {
    const rows = sheet.rows || [];
    const table = detectScoreTable(rows);
    if (!table || table.mode !== 'components') continue;
    const lrnCol = findLrnColumn(rows, table);
    const learners = table.learners.map((l) => ({
      row: l.row + 1,
      name: l.name,
      lrn: lrnCol === null ? '' : cleanLrn(rows[l.row]?.[lrnCol]),
      sex: l.gender || '',
    }));
    const check = checkClassList(learners);
    const hpsRow = table.hpsRowIndex ?? null;
    const header = rows[table.headerRowIndex] || [];
    const columns = [];
    const scores = {};
    for (const [k, componentLabel] of COMPONENTS) {
      const comp = table.components[k];
      comp.cols.forEach((col, i) => {
        const key = `${k}${i + 1}`;
        const letter = indexToCol(col);
        // What is in each learner's cell, as typed: a number, or text such as "Absent" or
        // "INC". Text counts as occupied, so it is never overwritten without the teacher's yes.
        const values = {};
        table.learners.forEach((l, li) => {
          const v = cellValue(rows[l.row]?.[col]);
          if (v !== undefined && learners[li].lrn) values[learners[li].lrn] = v;
        });
        scores[key] = values;
        columns.push({
          key,
          component: k,
          componentLabel,
          n: i + 1,
          label: String(header[col] ?? '').trim() || `${k.toUpperCase()} ${i + 1}`,
          cell: letter,
          hps: num(comp.hps[i]),
          hpsCell: hpsRow === null ? null : `${letter}${hpsRow + 1}`,
          filled: Object.keys(values).length,
        });
      });
    }
    return { sheet: sheet.name, learners, columns, scores, ready: check.ready, problems: check.problems, lrnColumn: lrnCol === null ? null : indexToCol(lrnCol) };
  }
  return { error: 'No E-Class Record table (Written Work, Performance Task, Quarterly Assessment) was found in this file.' };
}

const round2 = (n) => Math.round(n * 100) / 100;

/**
 * Plans the cells for one task's scores.
 *   record = readClassRecord(...)   column = 'ww3'   hps = the task's highest possible score
 *   scores = [{ lrn, score }]        score: number, or null to leave the learner blank (absent)
 *   overwrite = true only after the teacher confirmed changing scores already in the file
 * → { ok: true, edits: [{ sheet, cell, value }], written: [{ lrn, name, score, before }], unchanged, missing: [learner], hpsSet }
 *   or { ok: false, reason, message, conflicts?: [{ lrn, name, before, after }], invalid?: [...], unknown?: [...] }
 */
export function planRecord(record, { column, hps, scores = [], overwrite = false } = {}) {
  if (record.error) return { ok: false, reason: 'not_a_record', message: record.error };
  if (!record.ready) return { ok: false, reason: 'not_ready', message: 'This class record is not ready yet: every learner needs a clear full name and a 12-digit LRN. Fix it on KaTuroDesk first.' };
  const col = record.columns.find((c) => c.key === column);
  if (!col) return { ok: false, reason: 'no_column', message: `The column ${column} is not in this class record.` };

  const edits = [];
  let total = col.hps;
  let hpsSet = false;
  const given = num(hps);
  if (total === null) {
    if (!(given > 0)) return { ok: false, reason: 'needs_hps', message: `What is the highest possible score for ${col.label}?` };
    if (!col.hpsCell) return { ok: false, reason: 'no_hps_row', message: 'This class record has no HIGHEST POSSIBLE SCORE row. Add one on KaTuroDesk first.' };
    total = given;
    hpsSet = true;
    edits.push({ sheet: record.sheet, cell: col.hpsCell, value: given });
  } else if (given !== null && given !== total && !overwrite) {
    return { ok: false, reason: 'hps_differs', message: `${col.label} already has ${total} as its highest possible score, not ${given}. Check the number of items.`, hpsInFile: total };
  } else if (given !== null && given !== total && overwrite) {
    if (!col.hpsCell) return { ok: false, reason: 'no_hps_row', message: 'This class record has no HIGHEST POSSIBLE SCORE row.' };
    total = given;
    hpsSet = true;
    edits.push({ sheet: record.sheet, cell: col.hpsCell, value: given });
  }

  const byLrn = new Map(record.learners.map((l) => [l.lrn, l]));
  const existing = record.scores[column] || {};
  const invalid = [];
  const unknown = [];
  const conflicts = [];
  const written = [];
  let unchanged = 0;
  const seen = new Set();
  for (const s of scores) {
    const lrn = cleanLrn(s?.lrn);
    const l = byLrn.get(lrn);
    if (!l) { unknown.push({ lrn, name: s?.name || '' }); continue; }
    if (seen.has(lrn)) { invalid.push({ lrn, name: l.name, score: s.score, why: 'twice in the list' }); continue; }
    seen.add(lrn);
    if (s.score === null || s.score === undefined || s.score === '') continue;
    const v = num(s.score);
    if (v === null || v < 0 || v > total) { invalid.push({ lrn, name: l.name, score: s.score, why: `must be from 0 to ${total}` }); continue; }
    const value = round2(v);
    const before = existing[lrn];
    if (before !== undefined && before === value) { unchanged += 1; continue; }
    if (before !== undefined && !overwrite) { conflicts.push({ lrn, name: l.name, before, after: value }); continue; }
    edits.push({ sheet: record.sheet, cell: `${col.cell}${l.row}`, value });
    written.push({ lrn, name: l.name, score: value, ...(before !== undefined ? { before } : {}) });
  }
  if (unknown.length) return { ok: false, reason: 'unknown_learners', message: `${unknown.length} learner(s) are not in this class record (by LRN). Refresh the class on the phone and try again.`, unknown };
  if (invalid.length) return { ok: false, reason: 'invalid', message: `Some scores are not valid: ${invalid.slice(0, 3).map((x) => `${x.name} (${x.score}: ${x.why})`).join('; ')}.`, invalid };
  if (conflicts.length) return { ok: false, reason: 'conflicts', message: `${conflicts.length} learner(s) already have a score in ${col.label}. Confirm to replace them.`, conflicts };

  const scoredNow = new Set([...Object.keys(existing), ...written.map((w) => w.lrn)]);
  const missing = record.learners.filter((l) => !scoredNow.has(l.lrn)).map(({ lrn, name, sex }) => ({ lrn, name, sex }));
  return { ok: true, edits, written, unchanged, missing, hps: total, hpsSet, column: col };
}
