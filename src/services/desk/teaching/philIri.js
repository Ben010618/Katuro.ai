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
export function scoreReader({ name = '', words, miscues, correct, questions, seconds } = {}) {
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
  time: /time|seconds?|secs?|minutes?|mins?|oras|tagal|segundo|minuto/i,
};

/**
 * Finds the reading columns in a sheet (rows of cell values).
 * → { headerRow, cols: { name, words?, miscues?, correct?, questions?, time?, timeInMinutes, breakdown: [{ key, col }] } } or null
 */
export function findReadingColumns(rows = []) {
  for (let r = 0; r < Math.min(rows.length, 20); r++) {
    const cells = (rows[r] || []).map(clean);
    const find = (re, used) => cells.findIndex((v, i) => v && !used.has(i) && re.test(v));
    const used = new Set();
    const take = (re) => { const i = find(re, used); if (i >= 0) used.add(i); return i >= 0 ? i : undefined; };
    const name = take(HEADERS.name);
    if (name === undefined) continue;
    const breakdown = [];
    for (const m of MISCUE_TYPES) {
      const i = find(m.match, used);
      if (i >= 0) { used.add(i); breakdown.push({ key: m.key, col: i }); }
    }
    const questions = take(HEADERS.questions);
    const words = take(HEADERS.words);
    const miscues = take(HEADERS.miscues);
    const correct = take(HEADERS.correct);
    const time = take(HEADERS.time);
    if (miscues === undefined && !breakdown.length && correct === undefined) continue;
    return {
      headerRow: r,
      cols: { name, words, miscues, correct, questions, time, timeInMinutes: time !== undefined && /minutes?|mins?|minuto/i.test(cells[time]) && !/sec|segundo/i.test(cells[time]), breakdown },
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
    });
  }
  return readers.length ? { readers, cols } : null;
}
