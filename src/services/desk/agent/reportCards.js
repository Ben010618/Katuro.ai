/**
 * reportCards.js — consolidate each learner's grades from the subject teachers'
 * class records into the Learner's Performance Report (SF9) and a summary sheet.
 *
 * Everything here is code: file reading, name matching and every computation.
 * No learner data is sent to the AI (DO 15, s. 2026 para. 37) and the AI never
 * decides a grade (Table 6). Rules: ../knowledge/gradingRules.js.
 */
import {
  LEARNING_AREAS, matchLearningArea, finalGrade, compositeFinalGrade, generalAverage,
  descriptorFor, remarksFor, promotionFor, academicExcellenceByGrades, DESCRIPTORS,
  DEFAULT_MINIMUM_REPORTED_GRADE, gradeNumber,
} from '../knowledge/gradingRules.js';

const str = (v) => (v === null || v === undefined ? '' : String(v)).trim();
const fileName = (p) => String(p).split('/').pop();
const stem = (p) => fileName(p).replace(/\.[^.]+$/, '');

const NAME_HEADER = /\b(name|names|learner'?s?|pangalan|student'?s?)\b/i;
const NOT_A_LEARNER = /^(male|female|boys?|girls?|total|average|mean|highest|lowest|no\.?|name|names|learners?|prepared|checked|noted|approved|submitted|signature|teacher|adviser|grade|section|subject|learning area|hps|highest possible)/i;
const SEX_LABEL = /^(male|female|boys?|girls?|lalaki|babae)\s*:?$/i;

/** Term number (1–3) a header label refers to, 'final', 'quarter' (old 4-quarter files), or null. */
export function parseTermLabel(label) {
  const t = str(label).toLowerCase().replace(/\s+/g, ' ');
  if (!t) return null;
  if (/\bremarks?\b|\bdescriptor\b|\baction taken\b/.test(t)) return null;
  if (/\bfinal\b|\bf\.?g\.?\b|\bfinal\s*rating\b/.test(t) && !/\bterm\s*grade\b/.test(t)) return 'final';
  if (/\b(q[1-4]|quarter|qtr)\b|\b[1-4](st|nd|rd|th)\s*q/.test(t)) return 'quarter';
  const words = { first: 1, second: 2, third: 3, '1st': 1, '2nd': 2, '3rd': 3 };
  let m = t.match(/\b(first|second|third|1st|2nd|3rd)\s*(term|trimester|trim)\b/);
  if (m) return words[m[1]];
  m = t.match(/\b(term|trimester|trim|t)\s*-?\s*([123])\b/);
  if (m) return Number(m[2]);
  m = t.match(/\b([123])\s*(st|nd|rd)?\s*(term|trimester|trim)\b/);
  if (m) return Number(m[1]);
  return null;
}

/** Quarter number (1–4) of an old-style "1st Quarter" / "Q2" label, or null. */
export function quarterNumber(label) {
  const t = str(label).toLowerCase();
  const words = { first: 1, second: 2, third: 3, fourth: 4 };
  let m = t.match(/\bq\s*-?\s*([1-4])\b/) || t.match(/\b([1-4])\s*(st|nd|rd|th)?\s*(quarter|qtr|q)\b/);
  if (m) return Number(m[1]);
  m = t.match(/\b(first|second|third|fourth)\s*(quarter|qtr)\b/);
  return m ? words[m[1]] : null;
}

// Separate name columns (SF1 style): "Last Name | First Name | Middle Name".
const LAST_NAME = /^(last\s*name|surname|family\s*name|apelyido)\b/i;
const FIRST_NAME = /^(first\s*name|given\s*name|unang\s*pangalan)\b/i;
const MIDDLE_NAME = /^(middle\s*(name|initial)|m\.?\s*i\.?)$/i;
// One grade column whose term comes from the sheet, title or file name ("Grade", "Rating").
const PLAIN_GRADE = /^(grades?|rating|term\s*rating|grade\s*for\s*the\s*term)$/i;
// Score columns of a class record, never a term grade.
const SCORE_WORDS = /written|performance|assessment|initial|total|score|\bhps\b|\bps\b|\bws\b|%|item|quiz|exam|test/i;

/** A grade cell: number 0–100 → number; blank → null; anything else → the text (flagged). */
function gradeCell(v) {
  if (v === null || v === undefined || (typeof v === 'string' && !v.trim())) return null;
  const n = typeof v === 'number' ? v : Number(String(v).trim());
  if (Number.isFinite(n) && n >= 0 && n <= 100) return Math.round(n * 100) / 100;
  return str(v);
}

function looksLikeName(v) {
  const t = str(v);
  if (t.length < 3 || !/[a-zñ]/i.test(t) || /\d{3,}/.test(t)) return false;
  if (NOT_A_LEARNER.test(t)) return false;
  return /[a-zñ]{2,}/i.test(t);
}

/** Matching key for a learner name: case/accents/punctuation ignored, word order ignored, initials dropped. */
export function nameKey(name) {
  const t = str(name).normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase()
    .replace(/\b(JR|SR|II|III|IV)\b\.?/g, (s) => s.replace('.', ''))
    .replace(/[^A-Z\s,]/g, ' ');
  const tokens = t.replace(/,/g, ' ').split(/\s+/).filter((w) => w.length > 1);
  return tokens.sort().join(' ');
}

function editDistance(a, b) {
  const m = a.length; const n = b.length;
  if (!m) return n; if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[n];
}

/**
 * Label of every column from the header rows (merged header cells spread across).
 * Header rows = the name-header row and the sub-header rows below it, plus the row
 * just above when it is a multi-column header (subjects above "1 2 3"). MALE/FEMALE
 * label rows and one-cell title rows are not headers.
 */
function columnLabels(rows, headerRow, firstLearner, width) {
  const filledCount = (row) => (row || []).filter((v) => str(v)).length;
  const band = [];
  if (headerRow > 0 && filledCount(rows[headerRow - 1]) >= 3 && !(rows[headerRow - 1] || []).some((v) => /:/.test(str(v)))) band.push(rows[headerRow - 1]);
  for (let r = headerRow; r < firstLearner; r++) {
    const row = rows[r] || [];
    if (r > headerRow && (filledCount(row) < 2 || row.some((v) => SEX_LABEL.test(str(v))))) continue;
    band.push(row);
  }
  const deepest = band[band.length - 1] || [];
  const filled = band.map((row, i) => {
    const out = [];
    let carry = '';
    for (let c = 0; c < width; c++) {
      const v = str(row[c]);
      if (v) { carry = v; out.push(v); continue; }
      // spread a merged header only over columns that have their own sub-header below
      out.push(i < band.length - 1 && carry && str(deepest[c]) ? carry : '');
      if (i === band.length - 1) carry = '';
    }
    return out;
  });
  return Array.from({ length: width }, (_, c) => filled.map((row) => row[c]).filter(Boolean).join(' '));
}

/** Context labels for a sheet: title rows above the header, sheet name, file name. */
function contextAreas(rows, headerRow, sheetName, path) {
  const texts = [];
  for (let r = 0; r < headerRow; r++) {
    const row = rows[r] || [];
    for (let c = 0; c < row.length; c++) {
      const v = str(row[c]);
      if (!v) continue;
      // "Calauan Science High School" is a school name, not the subject.
      if (/\b(school|division|region|district|teacher|adviser|principal|head)\b/i.test(v) && !/(learning\s*area|subject)\s*[:-]/i.test(v)) continue;
      const m = v.match(/(?:learning\s*area|subject)\s*[:-]\s*(.+)$/i);
      if (m) texts.push(m[1]);
      else if (/^(learning\s*area|subject)\s*:?$/i.test(v) && str(row[c + 1])) texts.push(str(row[c + 1]));
      else texts.push(v);
    }
  }
  const candidates = [...texts, sheetName, stem(path)];
  for (const t of candidates) {
    const area = matchLearningArea(t);
    if (area) return { area, from: t };
  }
  return { area: null, from: '' };
}

/** "Grade 5 - Rizal", "Grade & Section: Six - Mabini" in the title rows → { grade, section }. */
function classFromTitle(rows, headerRow) {
  const out = { grade: '', section: '' };
  for (let r = 0; r < headerRow; r++) {
    for (const cell of rows[r] || []) {
      const v = str(cell);
      if (!v) continue;
      let m = v.match(/grade\s*(?:&|and)?\s*section\s*[:-]\s*(.+)$/i);
      if (m) {
        const [g, s] = m[1].split(/\s*[-–/]\s*/);
        out.grade ||= g || ''; out.section ||= s || '';
        continue;
      }
      m = v.match(/\bsection\s*[:-]\s*([^\s,].*)$/i);
      if (m) out.section ||= m[1];
      m = v.match(/\bgrade(?:\s*level)?\s*[:-]?\s*(\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\b/i);
      if (m) out.grade ||= m[1];
    }
  }
  return out;
}

/**
 * Reads term grades from one parsed file (spreadsheet or Word tables).
 * → { records: [{ name, lrn, sex, areaKey, areaName, terms: {1,2,3}, source }], notes: [string], meta: { grade, section, quarterLabels } }
 * quartersAsTerms: the teacher confirmed that old "1st–3rd Quarter" columns are Term 1–3.
 */
export function extractGradeRecords(path, parsed, { quartersAsTerms = false } = {}) {
  const notes = [];
  const records = [];
  const meta = { grade: '', section: '', quarterLabels: false };
  const grids = parsed?.sheets
    ? parsed.sheets.map((s) => ({ name: s.name, rows: s.rows || [] }))
    : Array.isArray(parsed?.tables) ? parsed.tables.map((t, i) => ({ name: `Table ${i + 1}`, rows: Array.isArray(t) ? t : t.rows || [] })) : [];

  for (const grid of grids) {
    const rows = grid.rows;
    // header row = the first row (within 25) with a name-like column header
    let headerRow = -1; let nameCol = -1;
    for (let r = 0; r < Math.min(rows.length, 25) && headerRow < 0; r++) {
      const row = rows[r] || [];
      for (let c = 0; c < row.length; c++) {
        if (NAME_HEADER.test(str(row[c])) && !/\bschool\b|\bteacher\b|\badviser\b/i.test(str(row[c]))) { headerRow = r; nameCol = c; break; }
      }
    }
    if (headerRow < 0) continue;
    // Separate Last / First / Middle name columns are joined into one name ("Dela Cruz, Juan P").
    const headCells = (rows[headerRow] || []).map(str);
    const lastCol = headCells.findIndex((v) => LAST_NAME.test(v));
    const firstCol = headCells.findIndex((v) => FIRST_NAME.test(v));
    const middleCol = headCells.findIndex((v) => MIDDLE_NAME.test(v));
    const split = lastCol >= 0 && firstCol >= 0;
    if (split) nameCol = lastCol;
    const nameOf = (row) => (split
      ? [str(row[lastCol]), [str(row[firstCol]), middleCol >= 0 ? str(row[middleCol]) : ''].filter(Boolean).join(' ')].filter(Boolean).join(', ')
      : str(row[nameCol]));
    // first learner row = first row below the header whose name cell looks like a name
    let firstLearner = -1;
    for (let r = headerRow + 1; r < rows.length; r++) {
      const v = (rows[r] || [])[nameCol];
      if (looksLikeName(v)) { firstLearner = r; break; }
    }
    if (firstLearner < 0) continue;
    const width = rows.slice(Math.max(0, headerRow - 1), firstLearner).reduce((mx, r) => Math.max(mx, (r || []).length), 0);
    const labels = columnLabels(rows, headerRow, firstLearner, width);
    // "Music and Arts 1", "Music and Arts 2", "Music and Arts 3": a bare number counts as a
    // term only when the same subject label has at least two of 1–3 (so "Math 3" in a Grade 3
    // file is not read as Term 3).
    const bareTerms = new Map();
    for (const l of labels) {
      const m = str(l).match(/^(.*\S)\s+([123])$/);
      if (m && matchLearningArea(m[1])) bareTerms.set(m[1], (bareTerms.get(m[1]) || new Set()).add(m[2]));
    }
    const ctxArea = contextAreas(rows, headerRow, grid.name, path);
    // The term named once for the whole sheet: sheet name, then title rows, then file name.
    const sheetTerm = [parseTermLabel(grid.name), (() => {
      for (let r = 0; r < headerRow; r++) for (const cell of rows[r] || []) { const t = parseTermLabel(cell); if (typeof t === 'number') return t; }
      return null;
    })(), parseTermLabel(stem(path))].find((t) => typeof t === 'number') ?? null;
    const cls = classFromTitle(rows, headerRow);
    meta.grade ||= cls.grade; meta.section ||= cls.section;

    // Which columns hold term grades, and for which learning area.
    const lrnCol = labels.findIndex((l) => /\blrn\b/i.test(l));
    const sexCol = labels.findIndex((l) => /^(sex|gender|kasarian)\b/i.test(l));
    const cols = [];
    let sawQuarter = false;
    let q4Used = false;
    const skip = new Set([nameCol, lrnCol, sexCol, firstCol, middleCol].filter((c) => c >= 0));
    labels.forEach((label, c) => {
      if (skip.has(c) || !label) return;
      let term = parseTermLabel(label);
      if (term === 'quarter') {
        // Old "1st–3rd Quarter" labels count as Term 1–3 only after the teacher said so.
        const q = quarterNumber(label);
        if (!quartersAsTerms || !q) { sawQuarter = true; return; }
        if (q === 4) { q4Used = q4Used || rows.slice(firstLearner).some((row) => gradeCell((row || [])[c]) !== null); return; }
        term = q;
      }
      if (term === null && /\b(term|quarterly|transmuted)\s*grade\b/i.test(label) && typeof sheetTerm === 'number') term = sheetTerm;
      // The term is named once for the whole sheet: a plain "Grade" column, or one
      // column per learning area ("Math | Science | …"). Score columns never count.
      if (term === null && typeof sheetTerm === 'number' && !SCORE_WORDS.test(label)) {
        if (PLAIN_GRADE.test(label)) term = sheetTerm;
        else if (label.split(/\s+/).length <= 5 && matchLearningArea(label)) term = sheetTerm;
      }
      if (term === null) {
        const m = str(label).match(/^(.*\S)\s+([123])$/);
        if (m && (bareTerms.get(m[1])?.size || 0) >= 2) term = Number(m[2]);
      }
      // "TERM 1 2 3" style: a bare 1/2/3 under a TERM header is already joined into the label
      if (typeof term !== 'number') return;
      const own = matchLearningArea(label.replace(/\b(first|second|third|1st|2nd|3rd)?\s*(term|trimester|trim)\s*[123]?\b/ig, '').trim());
      const area = own || ctxArea.area;
      if (!area) return;
      cols.push({ c, term, area });
    });
    if (q4Used) notes.push(`${fileName(path)} (${grid.name}): the 4th Quarter column has grades, but SY 2026–2027 has three terms (DO 15, s. 2026), so it was not used.`);
    if (sawQuarter && !cols.length) {
      meta.quarterLabels = true;
      notes.push(`${fileName(path)} (${grid.name}): the grades are labeled by quarter (1st Quarter, 2nd Quarter…), but from SY 2026–2027 DepEd uses three terms (DO 15, s. 2026).`);
      continue;
    }
    if (!cols.length) {
      if (!ctxArea.area && labels.some((l) => typeof parseTermLabel(l) === 'number')) {
        notes.push(`${fileName(path)} (${grid.name}): I could not tell which learning area these grades are for. Put the subject in the file name or title (e.g. "Science - Grade 5 Rizal").`);
      }
      continue;
    }

    let sex = '';
    for (let r = firstLearner - 1; r < rows.length; r++) {
      const row = rows[r] || [];
      const nameCell = nameOf(row);
      const firstCell = str(row.find((v) => str(v)));
      if (SEX_LABEL.test(nameCell) || SEX_LABEL.test(firstCell)) { sex = /^(male|boys?|lalaki)/i.test(nameCell || firstCell) ? 'Male' : 'Female'; continue; }
      if (r < firstLearner || !looksLikeName(nameCell)) continue;
      const byArea = new Map();
      for (const { c, term, area } of cols) {
        const g = gradeCell(row[c]);
        const rec = byArea.get(area.key) || { area, terms: {} };
        if (g !== null) rec.terms[term] = g;
        byArea.set(area.key, rec);
      }
      const rowSex = sexCol >= 0 ? (/^m/i.test(str(row[sexCol])) ? 'Male' : /^f/i.test(str(row[sexCol])) ? 'Female' : sex) : sex;
      for (const { area, terms } of byArea.values()) {
        if (!Object.keys(terms).length) continue;
        records.push({
          name: nameCell, lrn: lrnCol >= 0 ? str(row[lrnCol]).replace(/\.0$/, '') : '', sex: rowSex,
          areaKey: area.key, areaName: area.name, terms, source: `${fileName(path)}${grids.length > 1 ? ` › ${grid.name}` : ''}`,
        });
      }
    }
  }
  if (!records.length && !notes.length) notes.push(`${fileName(path)}: no learner names with term grades were found.`);
  return { records, notes, meta };
}

/**
 * Merges every file's records into one entry per learner and computes final grades.
 * → { learners: [...], areas: [areaKey...], checks: [{ type, text }] }
 */
export function consolidateLearners(fileResults, { terms = 3 } = {}) {
  const checks = [];
  const learners = new Map(); // key → learner
  const keyList = [];
  const conflicts = [];

  const findLearner = (name) => {
    const key = nameKey(name);
    if (!key) return null;
    if (learners.has(key)) return { learner: learners.get(key), similar: false };
    // close spelling (one or two letters) → same learner, flagged for checking
    for (const k of keyList) {
      if (Math.abs(k.length - key.length) <= 2 && key.length >= 8 && editDistance(k, key) <= 2) {
        return { learner: learners.get(k), similar: true };
      }
    }
    const learner = { key, name: str(name), lrn: '', sex: '', areas: new Map(), aliases: new Set() };
    learners.set(key, learner); keyList.push(key);
    return { learner, similar: false };
  };

  for (const { path, records } of fileResults) {
    for (const rec of records) {
      const found = findLearner(rec.name);
      if (!found) continue;
      const { learner, similar } = found;
      if (similar && str(rec.name) !== learner.name && !learner.aliases.has(rec.name)) {
        learner.aliases.add(rec.name);
        checks.push({ type: 'Name spelling', text: `"${rec.name}" (${rec.source}) was matched to "${learner.name}". Please check it is the same learner.` });
      }
      learner.lrn ||= rec.lrn; learner.sex ||= rec.sex;
      const a = learner.areas.get(rec.areaKey) || { key: rec.areaKey, name: rec.areaName, terms: {}, sources: new Set() };
      for (const [t, g] of Object.entries(rec.terms)) {
        if (a.terms[t] !== undefined && a.terms[t] !== g) conflicts.push(`${learner.name} – ${a.name} Term ${t}: ${a.terms[t]} vs ${g} (${rec.source})`);
        else a.terms[t] = g;
      }
      a.sources.add(rec.source || fileName(path));
      learner.areas.set(rec.areaKey, a);
    }
  }
  for (const c of conflicts) checks.push({ type: 'Different grades', text: `${c}. The first file's grade was kept; please confirm which is correct.` });

  const present = new Set();
  for (const l of learners.values()) for (const k of l.areas.keys()) present.add(k);
  // Terms the class already has grades for, per learning area (to spot a learner's missing term).
  const classTerms = new Map();
  for (const l of learners.values()) for (const [k, a] of l.areas) {
    const set = classTerms.get(k) || new Set();
    for (const [t, g] of Object.entries(a.terms)) if (g !== null && g !== undefined) set.add(Number(t));
    classTerms.set(k, set);
  }
  const order = LEARNING_AREAS.map((a) => a.key);
  // MAPEH row appears when the class has MAPEH or its components.
  if (present.has('music_arts') || present.has('pe_health')) present.add('mapeh');
  const areas = order.filter((k) => present.has(k));

  for (const l of learners.values()) {
    const finals = [];
    const hasComponent = l.areas.has('music_arts') || l.areas.has('pe_health');
    for (const key of areas) {
      const def = LEARNING_AREAS.find((a) => a.key === key);
      let a = l.areas.get(key);
      if (!a) {
        // MAPEH itself may come from its components; anything else missing is reported.
        if (!(key === 'mapeh' && hasComponent)) {
          checks.push({ type: 'Missing grades', text: `${l.name}: no ${def.name} grades were found in the files.` });
        }
        a = { key, name: def.name, terms: {}, sources: new Set() };
        l.areas.set(key, a);
      }
      const vals = [1, 2, 3].slice(0, terms).map((t) => a.terms[t]);
      if (Object.keys(a.terms).length) {
        for (const t of classTerms.get(key) || []) {
          if (a.terms[t] === undefined) checks.push({ type: 'Missing grades', text: `${l.name}: no ${def.name} grade for Term ${t}, while classmates have one.` });
        }
      }
      for (const [t, g] of Object.entries(a.terms)) {
        if (typeof g === 'string') checks.push({ type: 'Not a number', text: `${l.name} – ${def.name} Term ${t}: "${g}" is not a grade, so no Final Grade was computed.` });
        else if (g < DEFAULT_MINIMUM_REPORTED_GRADE) checks.push({ type: 'Below 60', text: `${l.name} – ${def.name} Term ${t}: ${g}. The report card normally shows at least ${DEFAULT_MINIMUM_REPORTED_GRADE} (DO 15, s. 2026, Annex D para. 18).` });
      }
      a.final = def.component ? finalGrade(vals, terms) : key === 'mapeh' ? null : finalGrade(vals, terms);
    }
    // MAPEH: given directly, or the average of its components' finals (Annex D para. 20).
    const mapeh = l.areas.get('mapeh');
    if (mapeh) {
      const direct = finalGrade([1, 2, 3].slice(0, terms).map((t) => mapeh.terms[t]), terms);
      const comps = ['music_arts', 'pe_health'].filter((k) => areas.includes(k)).map((k) => l.areas.get(k)?.final ?? null);
      mapeh.final = direct ?? (comps.length ? compositeFinalGrade(comps) : null);
    }
    for (const key of areas) {
      const def = LEARNING_AREAS.find((a) => a.key === key);
      if (def.component) continue; // components are shown under MAPEH, not counted twice
      finals.push(l.areas.get(key).final ?? null);
    }
    const complete = finals.length && finals.every((v) => typeof v === 'number');
    l.generalAverage = complete ? generalAverage(finals) : null;
    l.promotion = complete ? promotionFor(finals) : '';
    l.excellence = complete && academicExcellenceByGrades(l.generalAverage, finals);
  }

  const sorted = [...learners.values()].sort((a, b) => {
    const sa = a.sex === 'Male' ? 0 : a.sex === 'Female' ? 1 : 2;
    const sb = b.sex === 'Male' ? 0 : b.sex === 'Female' ? 1 : 2;
    return sa - sb || a.name.localeCompare(b.name, 'en', { sensitivity: 'base' });
  });
  return { learners: sorted, areas, checks };
}

const INDENT = String.fromCharCode(160).repeat(4); // non-breaking spaces survive in Word and print
const cellText = (v) => (v === null || v === undefined ? '' : typeof v === 'number' ? String(v) : String(v));

/** Learner's Performance Report (SF9) — one page per learner. */
export function buildReportCardSpec({ learners, areas, info }) {
  const blocks = [];
  const headLines = [
    'Republic of the Philippines · Department of Education',
    [info.region && `Region ${info.region.replace(/^region\s*/i, '')}`, info.division && `Schools Division of ${info.division.replace(/^(schools\s+division\s+(office\s+)?of\s+)/i, '')}`].filter(Boolean).join(' · '),
    [info.school, info.district && `${info.district} District`].filter(Boolean).join(' · '),
  ].filter(Boolean);
  learners.forEach((l, i) => {
    if (i) blocks.push({ type: 'pageBreak' });
    headLines.forEach((t) => blocks.push({ type: 'paragraph', text: t }));
    blocks.push({ type: 'heading', level: 1, text: "LEARNER'S PERFORMANCE REPORT" });
    blocks.push({ type: 'paragraph', text: `School Year: ${info.schoolYear}` });
    blocks.push({
      type: 'table', columns: ['Name', 'LRN', 'Grade', 'Section'],
      rows: [[l.name, l.lrn || '', info.grade || '', info.section || '']], widths: [3.2, 2, 1.2, 1.6],
    });
    blocks.push({ type: 'heading', level: 2, text: 'Learning Progress and Achievement' });
    const rows = [];
    for (const key of areas) {
      const a = l.areas.get(key);
      const def = LEARNING_AREAS.find((x) => x.key === key);
      const label = def.component ? `${INDENT}${def.name}` : def.name; // components indented under MAPEH (Annex G)
      rows.push([label, cellText(a?.terms[1]), cellText(a?.terms[2]), cellText(a?.terms[3]), cellText(a?.final), def.component ? '' : remarksFor(a?.final)]);
    }
    rows.push(['General Average', '', '', '', cellText(l.generalAverage), l.generalAverage !== null ? remarksFor(l.generalAverage) : '']);
    blocks.push({ type: 'table', columns: ['Learning Areas', 'Term 1', 'Term 2', 'Term 3', 'Final Grade', 'Remarks'], rows, widths: [3.4, 0.9, 0.9, 0.9, 1.1, 1.2] });
    blocks.push({ type: 'heading', level: 3, text: 'Performance Descriptors' });
    blocks.push({
      type: 'table', columns: ['Grading Scale', 'Description', 'Remarks'],
      rows: DESCRIPTORS.map((d) => [`${d.min} - ${d.max}`, d.descriptor, d.remarks]), widths: [2, 2.6, 2],
    });
    blocks.push({ type: 'paragraph', text: `**${info.adviser || '________________________'}**  ·  Class Adviser` });
  });
  return {
    kind: 'document', title: `Learner's Performance Report – ${[info.grade && `Grade ${info.grade}`, info.section].filter(Boolean).join(' ') || 'Class'}`,
    hideTitle: true, paper: 'long', orientation: 'portrait', header: null, meta: [], blocks,
  };
}

/** Summary workbook: final grades, term grades, and the checks list. */
export function buildSummarySheetSpec({ learners, areas, checks, info, sources, notes }) {
  const main = areas.filter((k) => !LEARNING_AREAS.find((a) => a.key === k).component);
  const nameOf = (k) => LEARNING_AREAS.find((a) => a.key === k).name;
  const finalsSheet = {
    name: 'Final Grades',
    columns: [{ header: 'No.', width: 6 }, { header: 'Learner', width: 30 }, { header: 'LRN', width: 15 }, { header: 'Sex', width: 8 },
      ...main.map((k) => ({ header: nameOf(k), width: 12 })),
      { header: 'General Average', width: 12 }, { header: 'Descriptor', width: 14 }, { header: 'Promotion', width: 22 }, { header: 'Academic Excellence (by grades)', width: 18 }],
    rows: learners.map((l, i) => [i + 1, l.name, l.lrn || '', l.sex || '',
      ...main.map((k) => l.areas.get(k)?.final ?? null),
      l.generalAverage, descriptorFor(l.generalAverage)?.descriptor || '', l.promotion, l.excellence ? 'Yes – check records' : '']),
    freezeHeader: true,
  };
  const termCols = [];
  for (const k of areas) for (const t of [1, 2, 3]) termCols.push({ k, t });
  const termsSheet = {
    name: 'Term Grades',
    columns: [{ header: 'Learner', width: 30 }, ...termCols.map(({ k, t }) => ({ header: `${nameOf(k)} T${t}`, width: 11 }))],
    rows: learners.map((l) => [l.name, ...termCols.map(({ k, t }) => { const v = l.areas.get(k)?.terms[t]; return v === undefined ? null : v; })]),
    freezeHeader: true,
  };
  const checkRows = [
    ...checks.map((c) => [c.type, c.text]),
    ...(notes || []).map((n) => ['File note', n]),
  ];
  const checksSheet = { name: 'Checks', columns: [{ header: 'Check', width: 18 }, { header: 'Details', width: 100 }], rows: checkRows.length ? checkRows : [['All clear', 'No missing grades, spelling differences or unusual values were found.']] };
  const sourcesSheet = {
    name: 'Sources',
    columns: [{ header: 'File', width: 50 }, { header: 'Used for', width: 60 }],
    rows: sources.map((s) => [s.file, s.usedFor]),
  };
  const basis = {
    name: 'Basis',
    columns: [{ header: 'Rule', width: 40 }, { header: 'Details', width: 90 }],
    rows: [
      ['School year', info.schoolYear],
      ['Final Grade', 'Average of the three Term Grades, rounded to the nearest whole number (DO 15, s. 2026, para. 52).'],
      ['General Average', 'Average of the Final Grades of all learning areas, whole number (DO 15, s. 2026, para. 53).'],
      ['MAPEH', 'Average of its components (Music and Arts; PE and Health) when no MAPEH grade is given (DO 15, s. 2026, Annex D para. 20).'],
      ['Promotion', 'All passed → Promoted; 1–2 failed → Summer Remedial Class; more than 2 → Retained (DO 15, s. 2026, para. 67).'],
      ['Academic Excellence', 'GA 90+ and no Final Grade below 80; the school still checks for derogatory records (DO 15, s. 2026, para. 75).'],
      ['How computed', 'By KaTuroDesk code from the class records listed in Sources. No grade was estimated or decided by AI.'],
    ],
  };
  return {
    kind: 'sheet',
    title: `Summary of Grades – ${[info.grade && `Grade ${info.grade}`, info.section].filter(Boolean).join(' ') || 'Class'}`,
    sheets: [finalsSheet, termsSheet, checksSheet, sourcesSheet, basis],
  };
}

export { gradeNumber };
