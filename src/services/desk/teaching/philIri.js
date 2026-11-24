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
  else if (num(rate) !== null && num(rate) > 0) out.wpm = Math.round(num(rate)); // the teacher's own words-per-minute
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
  time: /time|seconds?|secs?|minutes?|mins?|oras|tagal|segundo|minuto/i,
};

/** Miscue-type columns in one heading row (skipping `used` columns). */
function miscueColumns(cells, used = new Set()) {
  const out = [];
  for (const m of MISCUE_TYPES) {
    const i = cells.findIndex((v, k) => v && !used.has(k) && m.match.test(v));
    if (i >= 0) { used.add(i); out.push({ key: m.key, col: i }); }
  }
  return out;
}

/**
 * Finds the reading columns in a sheet (rows of cell values). A heading over several columns
 * (e.g. "Miscues" above Mispronunciation | Omission | … in the row below) is read from both rows.
 * → { headerRow, cols: { name, words?, miscues?, correct?, questions?, time?, rate?, timeInMinutes, breakdown: [{ key, col }] } } or null
 *   (headerRow = the last heading row; learners start below it)
 */
export function findReadingColumns(rows = []) {
  for (let r = 0; r < Math.min(rows.length, 20); r++) {
    const cells = (rows[r] || []).map(clean);
    const find = (re, used) => cells.findIndex((v, i) => v && !used.has(i) && re.test(v));
    const used = new Set();
    const take = (re) => { const i = find(re, used); if (i >= 0) used.add(i); return i >= 0 ? i : undefined; };
    const name = take(HEADERS.name);
    if (name === undefined) continue;
    let breakdown = miscueColumns(cells, used);
    const questions = take(HEADERS.questions);
    const words = take(HEADERS.words);
    let miscues = take(HEADERS.miscues);
    const correct = take(HEADERS.correct);
    const rate = take(HEADERS.rate);
    const time = take(HEADERS.time);
    if (miscues === undefined && !breakdown.length && correct === undefined) continue;

    let headerRow = r;
    if (miscues !== undefined) {
      // "Miscues" as a group heading: the cells after it are empty in this row and filled in
      // the row below (one per miscue type, maybe a Total). Its own column is then only the
      // first type, never the count.
      const sub = (rows[r + 1] || []).map(clean);
      let end = miscues + 1;
      while (end < Math.max(cells.length, sub.length) && !cells[end] && sub[end]) end += 1;
      const span = [];
      for (let k = miscues; k < end; k++) span.push(k);
      // Only a row of WORDS under the group is a second heading row; numbers mean it is the
      // first learner (the heading simply has blank cells after it).
      const isHeadingRow = span.length > 1 && span.some((k) => sub[k]) && span.every((k) => !sub[k] || num(sub[k]) === null);
      if (isHeadingRow) {
        const notInSpan = new Set(sub.map((_, k) => k).filter((k) => !span.includes(k)));
        const total = span.find((k) => /^(total|kabuuan)\b|^(no\.?\s*of\s*)?miscues?$/i.test(sub[k]));
        breakdown = total === undefined ? miscueColumns(sub, notInSpan) : [];
        // Neither a Total nor known miscue types below the group: no count is taken (the
        // learners are listed as not scored) rather than reading the first type as the total.
        miscues = total;
        headerRow = r + 1;
      }
    }
    const timeText = time === undefined ? '' : cells[time];
    return {
      headerRow,
      cols: { name, words, miscues, correct, questions, time, rate, timeInMinutes: /minutes?|mins?|minuto/i.test(timeText) && !/sec|segundo/i.test(timeText), breakdown },
    };
  }
  return null;
}

/**
 * Learners' reading results from a sheet.
 * `defaults` gives numbers that are the same for the whole class: { words, questions }.
 * → { readers: [{ name, words, miscues, correct, questions, seconds, row }], cols } or null
 */
export function readersFromRows(rows = [], defaults = {}) {
  const found = findReadingColumns(rows);
  if (!found) return null;
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
    const time = at(row, cols.time);
    readers.push({
      name,
      row: r + 1,
      words: pick(at(row, cols.words), defaults.words),
      miscues: pick(miscues, null),
      correct: pick(at(row, cols.correct), null),
      questions: pick(at(row, cols.questions), defaults.questions),
      seconds: parseSeconds(time, { minutes: cols.timeInMinutes }),
      ...(cols.rate !== undefined ? { rate: pick(at(row, cols.rate), null) } : {}),
    });
  }
  return readers.length ? { readers, cols } : null;
}
