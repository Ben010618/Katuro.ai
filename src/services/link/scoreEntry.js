/**
 * scoreEntry.js — the KaTuro App's side of recording one task's scores: checking what the
 * teacher typed before anything is sent, and keeping recordings on the phone while
 * KaTuroDesk can't be reached (sent later, once: KaTuroDesk ignores a repeat of the same id).
 */

/** The class record's groups: [['Male', [...]], ['Female', [...]], ['Learners', [...]]] (empty ones left out). */
export function classGroups(learners = []) {
  const m = learners.filter((l) => l.sex === 'M');
  const f = learners.filter((l) => l.sex === 'F');
  const other = learners.filter((l) => l.sex !== 'M' && l.sex !== 'F');
  return [['Male', m], ['Female', f], ['Learners', other]].filter(([, list]) => list.length);
}

/** Male, then Female, then the rest: the class record's order. */
export const classOrder = (learners = []) => classGroups(learners).flatMap(([, list]) => list);

const ABSENT = /^(a|ab|abs|absent|x|-)$/i;

/** What the teacher typed for one learner → { kind: 'blank' | 'absent' | 'score' | 'bad', score? } */
export function parseEntry(text) {
  const t = String(text ?? '').trim();
  if (!t) return { kind: 'blank' };
  if (ABSENT.test(t)) return { kind: 'absent' };
  const n = Number(t.replace(',', '.'));
  return Number.isFinite(n) ? { kind: 'score', score: Math.round(n * 100) / 100 } : { kind: 'bad' };
}

/**
 * cls = the class from KaTuroDesk ({ learners, scores })   column = 'ww3'   hps = number
 * values = { [lrn]: typed text }
 * → { scores: [{ lrn, score }], invalid: [{ lrn, name, text, why }], missing: [learner], absent: [learner],
 *     changes: [{ lrn, name, before, after }], ready }
 * ready = something to send and nothing invalid (changes still need the teacher's yes).
 */
export function checkEntries(cls, column, hps, values = {}) {
  const existing = cls?.scores?.[column] || {};
  const total = Number(hps);
  const out = { scores: [], invalid: [], missing: [], absent: [], changes: [] };
  if (!(total > 0)) out.invalid.push({ lrn: '', name: '', text: String(hps ?? ''), why: 'Type the highest possible score (number of items) first.' });
  for (const l of cls?.learners || []) {
    const e = parseEntry(values[l.lrn]);
    if (e.kind === 'blank') {
      if (existing[l.lrn] === undefined) out.missing.push(l);
      continue;
    }
    if (e.kind === 'absent') { out.absent.push(l); continue; }
    if (e.kind === 'bad') { out.invalid.push({ lrn: l.lrn, name: l.name, text: values[l.lrn], why: 'not a number' }); continue; }
    if (total > 0 && (e.score < 0 || e.score > total)) { out.invalid.push({ lrn: l.lrn, name: l.name, text: values[l.lrn], why: `must be from 0 to ${total}` }); continue; }
    const before = existing[l.lrn];
    if (before === e.score) continue;
    if (before !== undefined) out.changes.push({ lrn: l.lrn, name: l.name, before, after: e.score });
    out.scores.push({ lrn: l.lrn, score: e.score });
  }
  out.ready = out.scores.length > 0 && out.invalid.length === 0;
  return out;
}

export function newId() {
  try {
    if (crypto?.randomUUID) return crypto.randomUUID();
  } catch { /* older WebView */ }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

// ── recordings waiting on the phone ──
const QUEUE_KEY = 'katuro-score-queue-v1';
const CACHE_KEY = 'katuro-class-cache-v1';

function read(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key) || 'null') ?? fallback; } catch { return fallback; }
}
function write(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; }
}

export const queuedRecordings = () => read(QUEUE_KEY, []);
export function queueRecording(item) {
  const list = queuedRecordings().filter((x) => x.id !== item.id);
  return write(QUEUE_KEY, [...list, { ...item, queuedAt: new Date().toISOString(), error: null }]);
}
function removeQueued(id) {
  write(QUEUE_KEY, queuedRecordings().filter((x) => x.id !== id));
}
function markQueued(id, error) {
  write(QUEUE_KEY, queuedRecordings().map((x) => (x.id === id ? { ...x, error } : x)));
}

/**
 * Sends every waiting recording, oldest first. Stops at the first "can't reach".
 * → { sent: [{ item, result }], failed: [{ item, error }], unreachable }
 * A recording KaTuroDesk refused (e.g. a score is already there) stays, with its error, for the teacher.
 */
let sendingQueue = null; // one send at a time: a second caller waits for the same run
export function sendQueued(client) {
  if (!sendingQueue) sendingQueue = sendQueuedOnce(client).finally(() => { sendingQueue = null; });
  return sendingQueue;
}
async function sendQueuedOnce(client) {
  const sent = [];
  const failed = [];
  for (const item of queuedRecordings()) {
    try {
      // Scores (op 'record', the original shape) or attendance (op + args).
      const result = item.op && item.args
        ? await client.request(item.op, { ...item.args, id: item.id })
        : await client.request('record', { id: item.id, path: item.path, column: item.column, hps: item.hps, scores: item.scores, overwrite: Boolean(item.overwrite) });
      removeQueued(item.id);
      sent.push({ item, result });
    } catch (err) {
      if (err.code === 'UNREACHABLE' || err.code === 'DESK_STARTING') return { sent, failed, unreachable: true };
      markQueued(item.id, err.message);
      failed.push({ item, error: err.message });
    }
  }
  return { sent, failed, unreachable: false };
}

// ── class lists kept on the phone, so scores can be typed while KaTuroDesk is off ──
export const cachedClasses = () => read(CACHE_KEY, { list: null, classes: {} });
export function cacheClassList(list) {
  const c = cachedClasses();
  write(CACHE_KEY, { ...c, list, at: new Date().toISOString() });
}
export function cacheClass(path, cls) {
  const c = cachedClasses();
  write(CACHE_KEY, { ...c, classes: { ...c.classes, [path]: { ...cls, cachedAt: new Date().toISOString() } } });
}
export const forgetCachedClasses = () => { try { localStorage.removeItem(CACHE_KEY); } catch { /* nothing kept */ } };
