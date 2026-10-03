/**
 * scoreSheet.js — finds learner score tables and attendance grids inside messy
 * teacher spreadsheets (rows from readDocument's `sheets[].rows`).
 *
 * Handles title rows, merged/two-row headers, MALE/FEMALE dividers, HPS and
 * answer-key rows, summary rows, and DepEd e-Class Record (WW/PT/QA) layouts.
 * Everything here is pure and synchronous.
 */

const HEADER_SCAN_ROWS = 15;
const FALLBACK_SCAN_ROWS = 40;

const NAME_HEADER_RE = /\b(names?|learners?|students?|pupils?|pangalan|surname)\b/i;
const NOT_NAME_HEADER_RE = /school|teacher|adviser|section|subject|grade\s*(level)?\s*[:\d]|division|region|district|principal|parent|guardian|month|date|class/i;
const LAST_NAME_RE = /^(last\s*name|surname|family\s*name|apelyido)\b/i;
const FIRST_NAME_RE = /^(first\s*name|given\s*name|pangalan)\b/i;
const MIDDLE_NAME_RE = /^(middle\s*(name|initial)|m\.?\s*i\.?)$/i;
const GENDER_COL_RE = /^(sex|gender|kasarian)$/i;

const GENDER_ROW_RE = /^(male|female|boys|girls|lalaki|babae)\b/i;
const HPS_ROW_RE = /^(hps|highest\s+possible(\s+scores?)?|perfect\s+scores?|max(imum)?\s+scores?|total\s+(no\.?\s*of\s+)?items)\b/i;
const KEY_ROW_RE = /^(key|answer\s*key|correct\s*answers?|key\s*to\s*correction|susi)\b/i;
const SUMMARY_ROW_RE = /^(total|totals|sum|average|ave\.?|mean|mps|highest|lowest|no\.?\s*of|number\s+of|percentage|percent|%|count|frequency|prepared|checked|noted|submitted|approved|teacher|adviser|remarks?)\b/i;

const GROUP_RE = /written|performance|quarterly|\bww\b|\bpt\b|\bqa\b/i;
const EXCLUDE_SUB_RE = /^(total|totals|ps|ws|%|percent|percentage|initial|grade|weighted|ave|average|mean|remarks?)\b|grade/i;
const NUMBER_COL_RE = /^(no\.?|#|number|lrn|id|seq\.?)$/i;

const CORRECT_MARKS = new Set(['1', '✓', '✔', '/', 'c', 'correct', 't', 'true', 'check']);
const WRONG_MARKS = new Set(['0', '✗', '✘', 'x', '×', 'w', 'wrong', 'f', 'false']);

// ---------------------------------------------------------------- small helpers

const str = (v) => (v === null || v === undefined ? '' : String(v).replace(/\s+/g, ' ').trim());
const isBlankRow = (row) => !row || row.every((v) => str(v) === '');

function toNumber(v) {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && /^\s*-?\d+(\.\d+)?\s*$/.test(v)) return Number(v);
  return null;
}

function intLabel(v) {
  const n = toNumber(v);
  return n !== null && Number.isInteger(n) ? n : null;
}

function cleanName(v) {
  return str(v).replace(/^\d+\s*[.)-]\s*/, '').trim();
}

/** Person-name test. `strict` requires 2+ words (used when no "Name" header exists). */
function looksLikeName(v, strict = false) {
  if (typeof v !== 'string') return false;
  const s = cleanName(v);
  if (s.length < 2 || s.length > 60) return false;
  if (!/^\p{L}[\p{L}\s.,'’\-()ñÑ]*$/u.test(s)) return false;
  if (GENDER_ROW_RE.test(s) || HPS_ROW_RE.test(s) || KEY_ROW_RE.test(s) || SUMMARY_ROW_RE.test(s)) return false;
  if (strict) return s.split(/[\s,]+/).filter(Boolean).length >= 2;
  return true;
}

function maxCols(rows) {
  return rows.reduce((m, r) => Math.max(m, r ? r.length : 0), 0);
}

/** First non-empty, non-numeric text among columns 0..lastCol — where row labels like MALE / HPS / KEY live. */
function leadingLabel(row, lastCol) {
  for (let c = 0; c <= lastCol && c < row.length; c++) {
    const s = str(row[c]);
    if (s && toNumber(s) === null) return s;
  }
  return '';
}

/** True when the row has 3+ consecutive integers (1,2,3…) in adjacent columns: an item-number header. */
function hasNumberSequence(row) {
  if (!row) return false;
  let run = 1;
  for (let c = 1; c < row.length; c++) {
    const a = intLabel(row[c - 1]);
    const b = intLabel(row[c]);
    if (a !== null && b !== null && b === a + 1) {
      run += 1;
      if (run >= 3) return true;
    } else run = 1;
  }
  return false;
}

// ---------------------------------------------------------------- header / name column

function findNameHeader(rows) {
  const limit = Math.min(rows.length, HEADER_SCAN_ROWS);
  for (let r = 0; r < limit; r++) {
    const row = rows[r] || [];
    for (let c = 0; c < row.length; c++) {
      const s = str(row[c]);
      if (!s || s.length > 40 || !NAME_HEADER_RE.test(s) || NOT_NAME_HEADER_RE.test(s)) continue;
      // Validate: names must appear below in this column within the next few rows.
      let names = 0;
      for (let k = r + 1; k < Math.min(rows.length, r + 12); k++) {
        if (looksLikeName(rows[k]?.[c])) names += 1;
      }
      if (names >= 2) return { headerRow: r, nameCol: c };
    }
  }
  return null;
}

function findNameColumnByData(rows) {
  const limit = Math.min(rows.length, FALLBACK_SCAN_ROWS);
  for (let r = 0; r < limit; r++) {
    const row = rows[r] || [];
    for (let c = 0; c < Math.min(row.length, 6); c++) {
      if (!looksLikeName(row[c], true) || !row.slice(c + 1).some((v) => toNumber(v) !== null)) continue;
      let more = 0;
      for (let k = r + 1; k < Math.min(rows.length, r + 5); k++) {
        if (looksLikeName(rows[k]?.[c], true)) more += 1;
      }
      if (more < 1) continue;
      let headerRow = -1;
      for (let k = r - 1; k >= Math.max(0, r - 3); k--) {
        if (!isBlankRow(rows[k])) {
          headerRow = k;
          break;
        }
      }
      return { headerRow, nameCol: c, dataStart: r };
    }
  }
  return null;
}

/** Works out header geometry: label row (numbers/WW1…), optional group row above, name parts. */
function headerLayout(rows) {
  const byHeader = findNameHeader(rows);
  const found = byHeader || findNameColumnByData(rows);
  if (!found) return null;
  const { headerRow: h } = found;
  let { nameCol } = found;
  let labelRow = h;
  let groupRow = null;
  if (h >= 0) {
    const next = rows[h + 1];
    if (next && !looksLikeName(next[nameCol]) && !HPS_ROW_RE.test(leadingLabel(next, nameCol)) && hasNumberSequence(next)) {
      labelRow = h + 1;
      groupRow = h;
    } else if (h > 0 && (rows[h - 1] || []).some((v) => GROUP_RE.test(str(v)))) {
      groupRow = h - 1;
    }
  }
  const header = h >= 0 ? rows[h] || [] : [];
  const labels = h >= 0 ? rows[labelRow] || [] : [];
  // Separate Last / First / Middle name columns.
  const parts = { last: null, first: null, middle: null };
  header.forEach((v, c) => {
    const s = str(v);
    if (LAST_NAME_RE.test(s)) parts.last = parts.last ?? c;
    else if (FIRST_NAME_RE.test(s)) parts.first = parts.first ?? c;
    else if (MIDDLE_NAME_RE.test(s)) parts.middle = parts.middle ?? c;
  });
  if (parts.last !== null && parts.first !== null) nameCol = parts.last;
  else {
    parts.last = null;
    parts.first = null;
    parts.middle = null;
  }
  let genderCol = null;
  [header, labels].forEach((row) => row.forEach((v, c) => {
    if (genderCol === null && GENDER_COL_RE.test(str(v))) genderCol = c;
  }));
  const nameCols = [nameCol, parts.first, parts.middle].filter((c) => c !== null);
  const dataStart = found.dataStart ?? (h >= 0 ? labelRow + 1 : 0);
  return { headerRowIndex: h, labelRow: h >= 0 ? labelRow : -1, groupRow, nameCol, parts, genderCol, nameColMax: Math.max(...nameCols), dataStart };
}

function buildName(row, layout) {
  const { parts, nameCol } = layout;
  if (parts.last !== null && parts.first !== null) {
    const last = cleanName(row[parts.last]);
    const first = cleanName(row[parts.first]);
    if (!last || !looksLikeName(last) || (first && !looksLikeName(first))) return '';
    const mid = parts.middle !== null ? cleanName(row[parts.middle]) : '';
    return first ? `${last}, ${first}${mid ? ` ${mid}` : ''}` : last;
  }
  const v = row[nameCol];
  return looksLikeName(v) ? cleanName(v) : '';
}

function parseGender(v) {
  const s = str(v).toLowerCase();
  if (/^(m|male|boy|boys|lalaki)$/.test(s)) return 'M';
  if (/^(f|female|girl|girls|babae)$/.test(s)) return 'F';
  return undefined;
}

/** Walks data rows: collects learners, gender dividers, HPS row and KEY row. */
function scanRows(rows, layout, notes) {
  const learners = [];
  const afterBreak = new Set();
  let broken = false;
  let gender;
  let hpsRowIndex = null;
  let keyRowIndex = null;
  const labelCol = Math.max(layout.nameColMax, layout.nameCol + 1);
  // HPS / KEY rows sometimes sit just above the data block (e.g. between header rows).
  for (let r = Math.max(0, layout.headerRowIndex); r < layout.dataStart; r++) {
    const label = leadingLabel(rows[r] || [], labelCol);
    if (hpsRowIndex === null && HPS_ROW_RE.test(label)) hpsRowIndex = r;
    if (keyRowIndex === null && KEY_ROW_RE.test(label)) keyRowIndex = r;
  }
  for (let r = layout.dataStart; r < rows.length; r++) {
    const row = rows[r] || [];
    if (isBlankRow(row)) {
      broken = true;
      continue;
    }
    const label = leadingLabel(row, labelCol);
    if (HPS_ROW_RE.test(label)) {
      if (hpsRowIndex === null) hpsRowIndex = r;
      continue;
    }
    if (KEY_ROW_RE.test(label)) {
      if (keyRowIndex === null) keyRowIndex = r;
      continue;
    }
    if (GENDER_ROW_RE.test(label) && !buildName(row, layout)) {
      gender = /^(male|boys|lalaki)/i.test(label) ? 'M' : 'F';
      broken = false;
      continue;
    }
    if (SUMMARY_ROW_RE.test(label)) {
      broken = true;
      continue;
    }
    const name = buildName(row, layout);
    if (!name) continue;
    if (broken && learners.length) afterBreak.add(r);
    broken = false;
    const learner = { name, row: r };
    const g = layout.genderCol !== null ? parseGender(row[layout.genderCol]) : gender;
    if (g) learner.gender = g;
    learners.push(learner);
  }
  if (hpsRowIndex === null) notes.push('No HPS (highest possible score) row found.');
  return { learners, hpsRowIndex, keyRowIndex, afterBreak };
}

/**
 * Drops trailing "learners" with no data that sit after a summary row or blank
 * gap — usually signatories below the table. An absent learner inside the list stays.
 */
function trimTrailingEmpty(learners, rows, cols, afterBreak) {
  while (learners.length && cols.length) {
    const last = learners[learners.length - 1];
    if (!afterBreak.has(last.row) || !cols.every((c) => str(rows[last.row]?.[c]) === '')) break;
    learners.pop();
  }
}

// ---------------------------------------------------------------- column classification

function columnLabels(rows, layout) {
  const width = maxCols(rows);
  const labelRow = layout.labelRow >= 0 ? rows[layout.labelRow] || [] : [];
  const groupRow = layout.groupRow !== null ? rows[layout.groupRow] || [] : [];
  const out = [];
  let carried = '';
  let carriedStart = -1;
  for (let c = 0; c < width; c++) {
    const g = str(groupRow[c]);
    if (g) {
      carried = g;
      carriedStart = c;
    }
    const sub = str(labelRow[c]);
    out.push({
      col: c,
      sub,
      raw: labelRow[c],
      group: layout.groupRow !== null ? carried : '',
      groupStart: carriedStart === c,
      label: sub || (layout.groupRow !== null && layout.groupRow !== layout.labelRow ? g : ''),
    });
  }
  return out;
}

function componentOf(info) {
  const { sub, group } = info;
  if (sub && EXCLUDE_SUB_RE.test(sub)) return null;
  if (/^(ww|written\s*works?|w)\s*#?\s*\d+$/i.test(sub)) return 'ww';
  if (/^(pt|performance\s*tasks?|p)\s*#?\s*\d+$/i.test(sub)) return 'pt';
  if (/^(qa|qe|quarterly(\s*(assessment|exam(ination)?|test))?|exam|periodical(\s*(test|exam))?)\s*#?\s*\d*$/i.test(sub)) return 'qa';
  if (!group || EXCLUDE_SUB_RE.test(group)) return null;
  const isNum = intLabel(info.raw) !== null && intLabel(info.raw) >= 1 && intLabel(info.raw) <= 20;
  let g = null;
  if (/written|^ww\b/i.test(group)) g = 'ww';
  else if (/performance|^pt\b/i.test(group)) g = 'pt';
  else if (/quarterly|assessment|exam|^qa\b/i.test(group)) g = 'qa';
  if (!g) return null;
  if (isNum) return g;
  if (g === 'qa' && !sub && info.groupStart) return 'qa';
  return null;
}

function itemNumberOf(info) {
  if (typeof info.raw === 'number') return Number.isInteger(info.raw) && info.raw >= 1 && info.raw <= 300 ? info.raw : null;
  const m = /^(?:item|q|no\.?|#|number)?\s*#?\s*(\d{1,3})$/i.exec(info.sub);
  if (!m) return null;
  const n = Number(m[1]);
  return n >= 1 && n <= 300 ? n : null;
}

/** totalItems hint embedded in a header: "Score (30)", "/30", "30 items", "over 30", "out of 30". */
function totalFromLabel(label) {
  const s = str(label);
  const m = /\(\s*(\d+)\s*(?:items?|pts\.?|points)?\s*\)/i.exec(s)
    || /\/\s*(\d+)/.exec(s)
    || /(\d+)\s*(?:items?|pts\.?|points)\b/i.exec(s)
    || /\b(?:over|out\s+of)\s*(\d+)/i.exec(s);
  return m ? Number(m[1]) : null;
}

function mapMark(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number') {
    if (v === 1) return 1;
    if (v === 0) return 0;
    return undefined;
  }
  const s = String(v).trim().toLowerCase();
  if (!s) return null;
  if (CORRECT_MARKS.has(s)) return 1;
  if (WRONG_MARKS.has(s)) return 0;
  return undefined;
}

// ---------------------------------------------------------------- detectScoreTable

/**
 * Finds a learner score table in sheet rows.
 * Mode priority: 'components' (ECR WW/PT/QA) > 'items' (≥3 per-item columns) > 'totals'.
 * Returns null when fewer than 2 learners are found.
 */
export function detectScoreTable(rows) {
  if (!Array.isArray(rows) || rows.length < 3) return null;
  const layout = headerLayout(rows);
  if (!layout) return null;
  const notes = [];
  const { learners, hpsRowIndex, keyRowIndex, afterBreak } = scanRows(rows, layout, notes);
  if (learners.length < 2) return null;

  const labels = columnLabels(rows, layout).filter((info) => info.col > layout.nameColMax && info.col !== layout.genderCol);
  const hpsRow = hpsRowIndex !== null ? rows[hpsRowIndex] || [] : [];
  const base = { headerRowIndex: layout.headerRowIndex, nameCol: layout.nameCol, learners, notes };
  if (hpsRowIndex !== null) base.hpsRowIndex = hpsRowIndex;

  // ---- components
  const comp = { ww: [], pt: [], qa: [] };
  for (const info of labels) {
    const k = componentOf(info);
    if (k) comp[k].push(info.col);
  }
  if (['ww', 'pt', 'qa'].filter((k) => comp[k].length).length >= 2) {
    const allCols = [...comp.ww, ...comp.pt, ...comp.qa];
    trimTrailingEmpty(learners, rows, allCols, afterBreak);
    const components = {};
    for (const k of ['ww', 'pt', 'qa']) {
      // Never estimate an HPS from learners' scores: a missing HPS stays null and is reported.
      const hps = comp[k].map((c) => toNumber(hpsRow[c]));
      components[k] = { cols: comp[k], hps };
    }
    const hpsMissing = ['ww', 'pt', 'qa'].some((k) => components[k].hps.some((h) => h === null));
    if (hpsMissing) notes.push('Some highest possible scores (HPS) are missing.');
    return {
      mode: 'components',
      ...base,
      components,
      hpsMissing,
      componentScores: learners.map((l) => ({
        ww: comp.ww.map((c) => toNumber(rows[l.row][c])),
        pt: comp.pt.map((c) => toNumber(rows[l.row][c])),
        qa: comp.qa.map((c) => toNumber(rows[l.row][c])),
      })),
    };
  }

  // ---- items
  let itemCols = labels
    .map((info) => ({ col: info.col, n: itemNumberOf(info), label: info.sub || String(info.raw ?? '') }))
    .filter((x) => x.n !== null);
  if (layout.headerRowIndex < 0) {
    // No header: any column holding only 0/1 marks counts as an item.
    itemCols = labels
      .filter((info) => learners.every((l) => [0, 1, null].includes(mapMark(rows[l.row][info.col]))) && learners.some((l) => mapMark(rows[l.row][info.col]) !== null))
      .map((info, i) => ({ col: info.col, n: i + 1, label: String(i + 1) }));
  }
  let lettersWithoutKey = false;
  if (itemCols.length >= 3) {
    const keyRow = keyRowIndex !== null ? rows[keyRowIndex] || [] : [];
    const keyVals = itemCols.map((x) => str(keyRow[x.col]).toUpperCase());
    const hasKey = keyRowIndex !== null && keyVals.filter((k) => /^[A-Z]$/.test(k)).length >= itemCols.length / 2;
    const cells = learners.flatMap((l) => itemCols.map((x) => rows[l.row][x.col]));
    const nonEmpty = cells.filter((v) => str(v) !== '');
    const letterCount = nonEmpty.filter((v) => /^[a-e]$/i.test(str(v))).length;
    const looksLikeLetters = nonEmpty.length && letterCount / nonEmpty.length > 0.6 && nonEmpty.some((v) => /^[abde]$/i.test(str(v)));
    let responses = null;
    if (hasKey) {
      responses = learners.map((l) => itemCols.map((x, i) => {
        const v = str(rows[l.row][x.col]).toUpperCase();
        if (!v) return null;
        if (!keyVals[i]) return mapMark(rows[l.row][x.col]) ?? null;
        return v === keyVals[i] ? 1 : 0;
      }));
    } else if (looksLikeLetters) {
      lettersWithoutKey = true;
    } else {
      const mapped = learners.map((l) => itemCols.map((x) => mapMark(rows[l.row][x.col])));
      const flat = mapped.flat();
      const invalid = flat.filter((v) => v === undefined).length;
      const nonNull = flat.filter((v) => v !== null).length;
      // Reject non-quiz grids (e.g. attendance x-marks, per-quiz scores): need real correct marks.
      if (nonNull && invalid / nonNull <= 0.1 && flat.includes(1)) {
        responses = mapped.map((r) => r.map((v) => (v === undefined ? null : v)));
      }
    }
    if (responses) {
      trimTrailingEmpty(learners, rows, itemCols.map((x) => x.col), afterBreak);
      responses.length = learners.length;
      const result = {
        mode: 'items',
        ...base,
        itemCols: itemCols.map(({ col, label }) => ({ col, label })),
        responses,
      };
      if (hasKey) result.answerKey = keyVals;
      return result;
    }
  }

  // ---- totals
  const learnerHasNumber = (c) => learners.filter((l) => toNumber(rows[l.row][c]) !== null).length;
  const scoreCol = (re) => labels.find((info) => re.test(info.label) && !NUMBER_COL_RE.test(info.label) && learnerHasNumber(info.col) >= learners.length / 2);
  let total = scoreCol(/\b(raw\s*score|scores?|iskor|marka)\b/i)
    || scoreCol(/\b(total|points?|result)\b/i);
  if (!total) {
    const numeric = labels.filter((info) => !NUMBER_COL_RE.test(info.label) && !/absent|tardy|present|days|\bage\b/i.test(info.label) && learnerHasNumber(info.col) >= learners.length / 2);
    if (numeric.length === 1) total = numeric[0];
  }
  if (total) {
    const c = total.col;
    trimTrailingEmpty(learners, rows, [c], afterBreak);
    const scores = learners.map((l) => toNumber(rows[l.row][c]));
    let totalItems = totalFromLabel(total.label) ?? toNumber(hpsRow[c]);
    if (totalItems === null && itemCols.length >= 3) totalItems = itemCols.length;
    // Never use the top score as the total: an unstated total stays null and is reported.
    const totalItemsMissing = totalItems === null;
    if (totalItemsMissing) notes.push('Total number of items is not stated in the file.');
    if (lettersWithoutKey) notes.push('Letter answers found but no answer key row — using the total score column.');
    return { mode: 'totals', ...base, totalCol: c, totalItems, totalItemsMissing, scores };
  }

  if (lettersWithoutKey) {
    notes.push('Letter answers found but no answer key row — add a KEY row to compute correctness.');
    return {
      mode: 'items',
      ...base,
      itemCols: itemCols.map(({ col, label }) => ({ col, label })),
      responses: learners.map(() => itemCols.map(() => null)),
      needsAnswerKey: true,
    };
  }
  return null;
}

// ---------------------------------------------------------------- adapters for depedGrading.js

/** → [{ name, responses }] for analyzeItems. Learners with every item blank (absent) are left out. */
export function toResponseMatrix(table) {
  if (!table || table.mode !== 'items') return [];
  return table.learners
    .map((l, i) => ({ name: l.name, responses: table.responses[i] || [] }))
    .filter((l) => l.responses.some((v) => v !== null));
}

/** → { learners: [{ name, score }], totalItems } for analyzeTotals. Learners with no score are left out. */
export function toTotals(table) {
  if (!table) return { learners: [], totalItems: 0 };
  if (table.mode === 'totals') {
    return {
      learners: table.learners.map((l, i) => ({ name: l.name, score: table.scores[i] })).filter((l) => l.score !== null),
      totalItems: table.totalItems,
    };
  }
  if (table.mode === 'items') {
    const learners = toResponseMatrix(table).map((l) => ({ name: l.name, score: l.responses.filter((v) => v === 1).length }));
    return { learners, totalItems: table.itemCols.length };
  }
  return { learners: [], totalItems: 0 };
}

/** → { learners: [{ name, gender, ww:{scores}, pt:{scores}, qa:{scores} }], hps } for computeQuarterlyGrade. */
export function toComponentLearners(table) {
  if (!table || table.mode !== 'components') return { learners: [], hps: { ww: [], pt: [], qa: [] } };
  const hps = { ww: table.components.ww.hps, pt: table.components.pt.hps, qa: table.components.qa.hps };
  return {
    learners: table.learners.map((l, i) => ({
      name: l.name,
      gender: l.gender,
      ww: { scores: table.componentScores[i].ww },
      pt: { scores: table.componentScores[i].pt },
      qa: { scores: table.componentScores[i].qa },
    })),
    hps,
  };
}

// ---------------------------------------------------------------- attendance (SF2-like)

const WEEKDAY_RE = /^(m|t|w|th|f|s|sa|mon|tue|tues|wed|thu|thur|thurs|fri|sat)\.?$/i;
const ABSENT_RE = /^(x|a|absent|abs)$/i;
const PRESENT_RE = /^(\/|p|present|✓|✔|l|late|t|tardy)$/i;

function isDayHeader(v) {
  const n = intLabel(v);
  if (n !== null) return n >= 1 && n <= 31;
  const s = str(v);
  return /^\d{4}-\d{2}-\d{2}/.test(s) || /^\d{1,2}[/-]\d{1,2}([/-]\d{2,4})?$/.test(s) || WEEKDAY_RE.test(s);
}

/**
 * SF2-style attendance grid: ≥5 day columns (day numbers, dates or M/T/W/TH/F).
 * SF2 convention: 'x' = absent, blank = present. Blank cells become 'P' up to the
 * last day column that has any mark (later days are assumed not yet recorded → '').
 */
export function detectAttendance(rows) {
  if (!Array.isArray(rows) || rows.length < 3) return null;
  const limit = Math.min(rows.length, 20);
  let best = null;
  for (let r = 0; r < limit; r++) {
    const row = rows[r] || [];
    const cols = [];
    row.forEach((v, c) => {
      if (str(v) && isDayHeader(v)) cols.push(c);
    });
    if (cols.length >= 5 && (!best || cols.length > best.cols.length)) best = { r, cols };
  }
  if (!best) return null;
  // SF2 has a day-number row with a weekday-letter row right below; data starts after both.
  let dataStart = best.r + 1;
  const below = rows[best.r + 1] || [];
  if (best.cols.filter((c) => WEEKDAY_RE.test(str(below[c]))).length >= 3) dataStart += 1;

  // Name column: a name header near the day header, else the column with most names below.
  let nameCol = null;
  for (let r = Math.max(0, best.r - 3); r < dataStart && nameCol === null; r++) {
    (rows[r] || []).forEach((v, c) => {
      const s = str(v);
      if (nameCol === null && c < best.cols[0] && s.length <= 40 && NAME_HEADER_RE.test(s) && !NOT_NAME_HEADER_RE.test(s)) nameCol = c;
    });
  }
  if (nameCol === null) {
    let bestCount = 0;
    for (let c = 0; c < best.cols[0]; c++) {
      const count = rows.slice(dataStart).filter((row) => looksLikeName(row?.[c])).length;
      if (count > bestCount) {
        bestCount = count;
        nameCol = c;
      }
    }
  }
  if (nameCol === null) return null;
  const dayCols = best.cols.filter((c) => c > nameCol);
  if (dayCols.length < 5) return null;

  const learners = [];
  for (let r = dataStart; r < rows.length; r++) {
    const row = rows[r] || [];
    if (isBlankRow(row)) continue;
    const label = leadingLabel(row, nameCol);
    if (/total|combined/i.test(label) || GENDER_ROW_RE.test(label)) continue;
    if (!looksLikeName(row[nameCol])) continue;
    learners.push({ name: cleanName(row[nameCol]), row: r, raw: dayCols.map((c) => row[c]) });
  }
  if (learners.length < 2) return null;

  // Reject grids that are really score/answer tables (numbers or A–E answers in day cells).
  const marks = learners.flatMap((l) => l.raw).filter((v) => str(v) !== '');
  const foreign = marks.filter((v) => typeof v === 'number' || !(ABSENT_RE.test(str(v)) || PRESENT_RE.test(str(v))));
  if (marks.length && foreign.length / marks.length > 0.2) return null;

  let lastMarked = -1;
  dayCols.forEach((c, i) => {
    if (learners.some((l) => str(l.raw[i]) !== '')) lastMarked = i;
  });
  const header = rows[best.r] || [];
  return {
    headerRowIndex: best.r,
    nameCol,
    dayCols: dayCols.map((c) => ({ col: c, label: str(header[c]) })),
    learners: learners.map((l) => ({
      name: l.name,
      days: l.raw.map((v, i) => {
        const s = str(v);
        if (ABSENT_RE.test(s)) return 'A';
        if (s) return 'P';
        return i <= lastMarked ? 'P' : '';
      }),
    })),
  };
}

/** Runs both detectors on every sheet; returns only sheets where something was found. */
export function detectInSheets(sheets = []) {
  const out = [];
  for (const sheet of sheets || []) {
    const rows = sheet?.rows || [];
    const scoreTable = detectScoreTable(rows);
    const attendance = detectAttendance(rows);
    if (!scoreTable && !attendance) continue;
    const entry = { sheetName: sheet.name };
    if (scoreTable) entry.scoreTable = scoreTable;
    if (attendance) entry.attendance = attendance;
    out.push(entry);
  }
  return out;
}
