/**
 * answerSheets.js — checking a stack of answer sheets against the answer key, by code.
 * The AI only reads each photo (the name written and the mark for each item); the key is
 * parsed and every sheet is scored here.
 */

const norm = (v) => String(v ?? '').trim().toUpperCase().replace(/\.$/, '');
const TF = { TRUE: 'T', T: 'T', TAMA: 'T', FALSE: 'F', F: 'F', MALI: 'F' };
/** One answer in a comparable form: letters A–J, T/F (True/Tama, False/Mali), or the words. */
export function answerForm(v) {
  const s = norm(v).replace(/\s+/g, ' ');
  if (!s || s === '?' || s === '-') return s === '?' ? '?' : '';
  if (TF[s]) return TF[s];
  return s;
}

/**
 * The answer key from what the teacher typed or a file's text:
 *   "1. A 2. C 3. B", "1-A, 2-C", "A C B D", "ACBD", one answer per line, "1. True 2. False"
 * → { key: [answer per item], error? }
 */
export function parseAnswerKey(text) {
  const t = String(text || '').replace(/answer\s*key\s*:?/i, '').trim();
  if (!t) return { key: [], error: 'empty' };
  const numbered = [...t.matchAll(/(?:^|[\s,;])(\d{1,3})\s*[.):-]\s*([A-Za-z][A-Za-z ]{0,30}?)(?=\s*(?:[,;]|\s\d{1,3}\s*[.):-]|$|\n))/g)];
  if (numbered.length >= 2) {
    const key = [];
    for (const m of numbered) {
      const n = Number(m[1]);
      if (key[n - 1] !== undefined) return { key: [], error: `item ${n} is given twice` };
      key[n - 1] = answerForm(m[2]);
    }
    // A skipped number leaves a hole: that item has no answer.
    const missing = [];
    for (let i = 0; i < key.length; i += 1) if (key[i] === undefined) { missing.push(i + 1); key[i] = ''; }
    if (missing.length) return { key, error: `no answer for item${missing.length > 1 ? 's' : ''} ${missing.join(', ')}` };
    return { key };
  }
  if (/^[A-Ja-j]{2,}$/.test(t.replace(/\s+/g, ''))) {
    const letters = t.replace(/\s+/g, '');
    if (!/\s/.test(t) || t.split(/\s+/).every((w) => w.length === 1)) return { key: [...letters.toUpperCase()] };
  }
  const parts = t.split(/[\n,;]+|\s{2,}/).map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 2) return { key: parts.map(answerForm) };
  return { key: [], error: 'I could not read the answers' };
}

/**
 * One sheet scored against the key.
 *   read: { name, answers: { "1": "A", … } }
 * → { score, total, wrong: [n], blank: [n], unclear: [n] }
 */
export function scoreSheet(read, key) {
  const answers = read?.answers || {};
  const wrong = [];
  const blank = [];
  const unclear = [];
  let score = 0;
  key.forEach((k, i) => {
    const a = answerForm(answers[i + 1] ?? answers[String(i + 1)]);
    if (a === '?') unclear.push(i + 1);
    else if (!a) blank.push(i + 1);
    else if (a === k) score += 1;
    else wrong.push(i + 1);
  });
  return { score, total: key.length, wrong, blank, unclear, responses: key.map((k, i) => (answerForm(answers[i + 1] ?? answers[String(i + 1)]) === k ? 1 : 0)) };
}

/** Items most learners missed (for the teacher's next lesson): [{ item, correct, percent }], hardest first. */
export function hardestItems(results, total) {
  const n = results.length || 1;
  return Array.from({ length: total }, (_, i) => {
    const correct = results.filter((r) => r.responses[i] === 1).length;
    return { item: i + 1, correct, percent: Math.round((correct / n) * 100) };
  }).sort((a, b) => a.percent - b.percent || a.item - b.item);
}
