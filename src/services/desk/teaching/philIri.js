/**
 * philIri.js — Phil-IRI oral reading results, scored by code (Philippine Informal Reading
 * Inventory, DepEd Phil-IRI Manual 2018).
 *
 *   Word reading %    = (words in the passage − miscues) ÷ words × 100
 *   Comprehension %   = correct answers ÷ questions × 100
 *   Reading speed     = words ÷ reading time in seconds × 60 (words per minute)
 *
 *   Level        Word reading   Comprehension
 *   Independent  97–100%        80–100%
 *   Instructional 90–96%        59–79%
 *   Frustration  89% and below  58% and below
 *
 * The bands are whole percents, so each percent is rounded before it is placed in a band. The
 * learner's reading level is the LOWER of the two (a fluent reader who did not understand the
 * passage is not independent). Miscues counted: mispronunciation, omission, substitution,
 * insertion, repetition, transposition and reversal; a self-correction is not a miscue.
 * Ideas for the miscue list and reading speed came from Digital Phil-IRI (CC0,
 * github.com/nthnjms/phil-iri); its default bands differ from the manual, so the manual's are used.
 *
 * Nothing is guessed: a learner with a missing or impossible number gets no level and a reason.
 */

export const LEVELS = ['Independent', 'Instructional', 'Frustration'];

export const MISCUE_TYPES = [
  { key: 'mispronunciation', label: 'Mispronunciation', match: /mispronunc|maling\s*bigkas/i },
  { key: 'omission', label: 'Omission', match: /omission|pagkakaltas|kaltas/i },
  { key: 'substitution', label: 'Substitution', match: /substitut|pagpapalit/i },
  { key: 'insertion', label: 'Insertion', match: /insertion|pagsisingit|singit/i },
  { key: 'repetition', label: 'Repetition', match: /repetition|pag-?uulit/i },
  { key: 'transposition', label: 'Transposition', match: /transpos|paglilipat/i },
  { key: 'reversal', label: 'Reversal', match: /reversal|pagbaliktad/i },
];

const pct = (part, whole) => (part / whole) * 100;

/** A word-reading percent → its band. */
export function wordReadingLevel(percent) {
  const p = Math.round(percent);
  if (p >= 97) return 'Independent';
  if (p >= 90) return 'Instructional';
  return 'Frustration';
}

/** A comprehension percent → its band. */
export function comprehensionLevel(percent) {
  const p = Math.round(percent);
  if (p >= 80) return 'Independent';
  if (p >= 59) return 'Instructional';
  return 'Frustration';
}

/** The lower of two levels. */
export function lowerLevel(a, b) {
  return LEVELS[Math.max(LEVELS.indexOf(a), LEVELS.indexOf(b))];
}

const num = (v) => {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(String(v).replace(/,/g, '').trim());
  return Number.isFinite(n) ? n : null;
};

/** "1:35", "1m 35s", "95", "95 sec", "1.5 min" → seconds (null when unreadable). */
export function parseSeconds(v, { minutes = false } = {}) {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) && v > 0 ? (minutes ? v * 60 : v) : null;
  const s = String(v).trim().toLowerCase();
  let m = s.match(/^(\d+):([0-5]?\d)(?::([0-5]?\d))?$/);
  if (m) return m[3] !== undefined ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) : Number(m[1]) * 60 + Number(m[2]);
  m = s.match(/^(?:(\d+(?:\.\d+)?)\s*(?:m|min|mins|minutes?|minuto))?\s*(?:(\d+(?:\.\d+)?)\s*(?:s|sec|secs|seconds?|segundo))?$/);
  if (m && (m[1] || m[2])) return Number(m[1] || 0) * 60 + Number(m[2] || 0) || null;
  const n = num(s);
  if (n === null || n <= 0) return null;
  return minutes ? n * 60 : n;
}

/**
 * One learner's result.
 *   { name, words, miscues, correct, questions, seconds }
 * → { name, wordPercent, wordLevel, comprehensionPercent, comprehensionLevel, level, wpm, problems: [text] }
 *   (percents rounded to whole numbers as on the Phil-IRI forms; level null when incomplete)
 */
export function scoreReader({ name = '', words, miscues, correct, questions, seconds, rate } = {}) {
  const problems = [];
  const w = num(words);
  const mc = num(miscues);
  const c = num(correct);
  const q = num(questions);
  const t = num(seconds);
  const out = { name: String(name || '').trim(), wordPercent: null, wordLevel: null, comprehensionPercent: null, comprehensionLevel: null, level: null, wpm: null, problems };

  if (w === null || w <= 0 || !Number.isInteger(w)) problems.push('no word count for the passage');
  if (mc === null) problems.push('no miscue count');
  else if (mc < 0 || !Number.isInteger(mc)) problems.push(`miscues "${miscues}" is not a whole number`);
  else if (w !== null && w > 0 && mc > w) problems.push(`${mc} miscues is more than the ${w} words in the passage`);
  if (!problems.length) {
    const p = pct(w - mc, w);
    out.wordPercent = Math.round(p);
    out.wordLevel = wordReadingLevel(p);
  }

  const before = problems.length;
  if (q === null || q <= 0 || !Number.isInteger(q)) problems.push('no number of comprehension questions');
  if (c === null) problems.push('no comprehension score');
  else if (c < 0 || !Number.isInteger(c)) problems.push(`comprehension score "${correct}" is not a whole number`);
  else if (q !== null && q > 0 && c > q) problems.push(`${c} correct answers is more than the ${q} questions`);
  if (problems.length === before) {
    const p = pct(c, q);
    out.comprehensionPercent = Math.round(p);
    out.comprehensionLevel = comprehensionLevel(p);
  }

  if (t !== null && t > 0 && w !== null && w > 0) out.wpm = Math.round((w / t) * 60);
  else if (rate !== undefined && rate !== null && String(rate).trim() !== '') {
    // The teacher's own words per minute ("90", "90 wpm", "90 words per minute").
    const r = num(String(rate).replace(/\s*(wpm|words?\s*(per|\/)\s*min(ute)?s?)\s*$/i, ''));
    if (r !== null && r > 0) out.wpm = Math.round(r);
    else problems.push(`reading speed "${rate}" could not be read`);
  }
  if (out.wordLevel && out.comprehensionLevel) out.level = lowerLevel(out.wordLevel, out.comprehensionLevel);
  return out;
}

/** Class totals: how many learners per level (and incomplete), with percents of those scored. */
export function classProfile(results = []) {
  const counts = Object.fromEntries(LEVELS.map((l) => [l, 0]));
  let incomplete = 0;
  for (const r of results) {
    if (r.level) counts[r.level] += 1;
    else incomplete += 1;
  }
  const scored = results.length - incomplete;
  const rows = LEVELS.map((l) => ({ level: l, count: counts[l], percent: scored ? Math.round(pct(counts[l], scored)) : 0 }));
  const speeds = results.map((r) => r.wpm).filter((v) => v !== null);
  return {
    total: results.length,
    scored,
    incomplete,
    rows,
    averageWpm: speeds.length ? Math.round(speeds.reduce((a, b) => a + b, 0) / speeds.length) : null,
    frustration: results.filter((r) => r.level === 'Frustration').map((r) => r.name),
  };
}

const clean = (v) => String(v ?? '').replace(/\s+/g, ' ').trim();
// A blank cell falls back to the class-wide number (or stays empty).
const pick = (v, fallback) => (v === undefined || v === null || clean(v) === '' ? fallback ?? null : v);

const HEADERS = {
  name: /\b(name|learner|pangalan|pupil|student|mag-?aaral)\b/i,
  words: /(no\.?|number|bilang)\s*(of|ng)?\s*(mga\s*)?(words|salita)|words?\s*(in|sa)\s*(the\s*)?(passage|selection|text|kuwento|seleksyon)|total\s*words|^words?$|^salita$/i,
  miscues: /miscue|^(total\s*)?(errors?|mali|pagkakamali)$|(no\.?|number|bilang)\s*(of|ng)?\s*(mga\s*)?(errors?|miscues?|mali|pagkakamali)/i,
  correct: /comprehension|correct\s*answers?|tamang\s*sagot|pag-?unawa|(no\.?|number|bilang)\s*(of|ng)?\s*(correct|tama)/i,
  questions: /(no\.?|number|bilang)\s*(of|ng)?\s*(mga\s*)?(comprehension\s*)?(questions?|items?|tanong)|total\s*(questions?|items?)|^(questions?|items?|tanong)$/i,
  // A reading SPEED column ("Words per minute", "Reading rate", "WPM") is not the reading time.
  rate: /per\s*min|\bwpm\b|\brate\b|speed|bilis/i,
  time: /\b(time|sec|secs|seconds?|min|mins|minutes?|oras|tagal|segundo|minuto)\b/i,
};
// Under a group heading, the sub-heading alone says what the column is.
const SUB = {
  total: /^(total|kabuuan)\b/i,
  score: /score|iskor|puntos|correct|tama|^raw$/i,
  items: /items?|questions?|tanong/i,
};
// A percent or a level is computed by KaTuro, never read as the score or the count.
const DERIVED = /%|percent|porsiyento|level|antas/i;
// "Learner Reference No." (LRN) and other ID columns are not the learner's name.
const NOT_NAME = /\blrn\b|reference|\bno\.?\s*$|\bnumber\b|\bid\b|school|section|grade/i;
// Reading time split over two columns: Minutes | Seconds.
// ("Min", "Time (min)", "Reading time (minutes)" | "Sec", "Time (sec)", "Seconds"), never one
// column marked both.
const MIN_WORD = /\b(min|mins|minutes?|minuto)\b/i;
const SEC_WORD = /\b(sec|secs|seconds?|segundo)\b/i;
const MIN_COL = { test: (s) => MIN_WORD.test(s) && !SEC_WORD.test(s) };
const SEC_COL = { test: (s) => SEC_WORD.test(s) && !MIN_WORD.test(s) };
// A group heading that is itself a reading term (not a section like Pre-test or Filipino).
const isReadingTerm = (s) => [HEADERS.miscues, HEADERS.correct, HEADERS.rate, HEADERS.time, HEADERS.words, HEADERS.questions].some((re) => re.test(s)) || /reading|pagbasa/i.test(s);
const squash = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

/** The learner-name heading in a row: a plain name heading first, never an LRN/ID column. */
function nameColumn(cells) {
  const ok = cells.map((v, i) => (v && HEADERS.name.test(v) && !NOT_NAME.test(v) ? i : -1)).filter((i) => i >= 0);
  return ok.find((i) => /name|pangalan/i.test(cells[i])) ?? ok[0] ?? -1;
}

/**
 * Finds the reading columns in a sheet (rows of cell values). Two heading rows are read
 * together: a group heading ("Miscues", "Comprehension", "Reading speed") over the row below,
 * where each column's own sub-heading (Omission | Total, No. of items | Score, Time | WPM) says
 * what it holds. A group whose sub-columns are not recognised gives no number, so those learners
 * are listed as not scored instead of being scored from the wrong column.
 * → { headerRow, cols: { name, words?, miscues?, correct?, questions?, time?, rate?, timeInMinutes, breakdown: [{ key, col }] } } or null
 *   (headerRow = the last heading row; learners start below it)
 */
export function findReadingColumns(rows = [], { section = '' } = {}) {
  for (let r = 0; r < Math.min(rows.length, 20); r++) {
    const main = (rows[r] || []).map(clean);
    const nameCol = nameColumn(main);
    if (nameCol < 0) continue;
    // The row below is a second heading row only when it has no learner name and no numbers.
    const below = (rows[r + 1] || []).map(clean);
    const twoRows = !below[nameCol] && below.some(Boolean) && below.every((v) => !v || num(v) === null);
    const sub = twoRows ? below : [];
    const width = Math.max(main.length, sub.length);
    const cols = [];
    let group = '';
    for (let k = 0; k < width; k++) {
      if (main[k]) group = main[k];
      else if (!sub[k]) group = '';
      cols.push({ k, own: sub[k] || main[k] || '', group: sub[k] ? group : main[k] || '' });
    }
    // Sections: groups such as Pre-test | Post-test or English | Filipino, each with its own
    // reading columns. One section is scored at a time, the one the teacher names; with more
    // than one and none named, KaTuro asks (never scores the first one silently).
    const sectionOf = (x) => (x.group !== x.own && !isReadingTerm(x.group) ? x.group : '');
    const sections = [...new Set(cols.filter((x) => sectionOf(x) && (HEADERS.miscues.test(x.own) || HEADERS.correct.test(x.own) || MISCUE_TYPES.some((m) => m.match.test(x.own)))).map(sectionOf))];
    // A part the teacher named must be in the sheet, and exactly one part may match it.
    let inSection = () => true;
    let chosen;
    const want = squash(section);
    if (sections.length) {
      const matches = want ? sections.filter((s) => squash(s).includes(want) || want.includes(squash(s))) : [];
      if (matches.length === 1) chosen = matches[0];
      else if (!want && sections.length === 1) chosen = sections[0];
      const ask = { headerRow: twoRows ? r + 1 : r, sections, cols: null };
      if (!chosen) return want && !matches.length ? { ...ask, missing: section } : ask;
      inSection = (x) => !sectionOf(x) || sectionOf(x) === chosen;
    }
    const used = new Set([nameCol]);
    const take = (test) => {
      const c = cols.find((x) => x.own && !used.has(x.k) && inSection(x) && test(x));
      if (!c) return undefined;
      used.add(c.k);
      return c.k;
    };
    const inGroup = (re) => (x) => x.group !== x.own && re.test(x.group);
    const breakdown = [];
    for (const m of MISCUE_TYPES) {
      const k = take((x) => m.match.test(x.own));
      if (k !== undefined) breakdown.push({ key: m.key, col: k });
    }
    const questions = take((x) => !DERIVED.test(x.own) && (HEADERS.questions.test(x.own) || (inGroup(HEADERS.correct)(x) && SUB.items.test(x.own))));
    const words = take((x) => HEADERS.words.test(x.own) && !HEADERS.rate.test(x.own));
    const miscues = take((x) => !DERIVED.test(x.own) && (inGroup(HEADERS.miscues)(x) ? SUB.total.test(x.own) || HEADERS.miscues.test(x.own) : HEADERS.miscues.test(x.own)));
    const correct = take((x) => !DERIVED.test(x.own) && (inGroup(HEADERS.correct)(x) ? SUB.score.test(x.own) : HEADERS.correct.test(x.own)));
    const rate = take((x) => HEADERS.rate.test(x.own));
    // Minutes | Seconds in two columns are added up; otherwise one time column.
    const minCol = cols.find((x) => !used.has(x.k) && inSection(x) && MIN_COL.test(x.own) && !HEADERS.rate.test(x.own));
    const secCol = cols.find((x) => !used.has(x.k) && inSection(x) && SEC_COL.test(x.own));
    const split = minCol && secCol ? { timeMin: minCol.k, timeSec: secCol.k } : null;
    if (split) { used.add(minCol.k); used.add(secCol.k); }
    const time = split ? undefined : take((x) => HEADERS.time.test(x.own) && !HEADERS.rate.test(x.own));
    const groupOf = (re) => cols.some((x) => x.group !== x.own && re.test(x.group));
    if (miscues === undefined && !breakdown.length && correct === undefined && !groupOf(HEADERS.miscues) && !groupOf(HEADERS.correct)) continue;
    const timeText = time === undefined ? '' : cols[time].own;
    return {
      headerRow: twoRows ? r + 1 : r,
      section: chosen,
      cols: { name: nameCol, words, miscues, correct, questions, time, ...split, rate, timeInMinutes: /minutes?|mins?|minuto/i.test(timeText) && !/sec|segundo/i.test(timeText), breakdown },
    };
  }
  return null;
}

/**
 * Learners' reading results from a sheet.
 * `defaults` gives numbers that are the same for the whole class: { words, questions }; `section`
 * names the part to score when the sheet has several (e.g. "post-test", "Filipino").
 * → { readers: [{ name, words, miscues, correct, questions, seconds, row }], cols, section? }
 *   or { readers: [], sections: [names] } when the sheet has several parts and none was named
 *   or null when the sheet has no reading results
 */
export function readersFromRows(rows = [], defaults = {}, { section = '' } = {}) {
  const found = findReadingColumns(rows, { section });
  if (!found) return null;
  if (!found.cols) return { readers: [], sections: found.sections, ...(found.missing ? { missing: found.missing } : {}) };
  const { headerRow, cols } = found;
  const at = (row, i) => (i === undefined ? undefined : row?.[i]);
  const readers = [];
  for (let r = headerRow + 1; r < rows.length; r++) {
    const row = rows[r] || [];
    const name = clean(at(row, cols.name));
    if (!name || /^(total|average|mean|kabuuan)\b/i.test(name)) continue;
    let miscues = at(row, cols.miscues);
    if ((miscues === undefined || miscues === null || miscues === '') && cols.breakdown.length) {
      const parts = cols.breakdown.map((b) => num(row[b.col]));
      miscues = parts.every((v) => v === null) ? null : parts.reduce((a, v) => a + (v || 0), 0);
    }
    let seconds;
    if (cols.timeMin !== undefined) {
      const m = num(at(row, cols.timeMin));
      const s = num(at(row, cols.timeSec));
      seconds = m === null && s === null ? null : (m || 0) * 60 + (s || 0) || null;
    } else seconds = parseSeconds(at(row, cols.time), { minutes: cols.timeInMinutes });
    readers.push({
      name,
      row: r + 1,
      words: pick(at(row, cols.words), defaults.words),
      miscues: pick(miscues, null),
      correct: pick(at(row, cols.correct), null),
      questions: pick(at(row, cols.questions), defaults.questions),
      seconds,
      ...(cols.rate !== undefined ? { rate: pick(at(row, cols.rate), null) } : {}),
    });
  }
  return readers.length ? { readers, cols, ...(found.section ? { section: found.section } : {}) } : null;
}
