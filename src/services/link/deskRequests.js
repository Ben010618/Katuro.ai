/**
 * deskRequests.js — what KaTuroDesk does when a linked phone asks (runs in the KaTuroDesk
 * window, which has the readers and writers; the main process only carries the encrypted
 * messages, see electron/linkService.cjs).
 *
 *   classes                 → the class records in Records, each with its readiness
 *   class   { path }        → learners (by LRN), the WW/PT/QA columns, the scores already in
 *   record  { id, path, column, hps, scores, overwrite } → writes one task's scores
 *   quizzes                 → bubble quizzes in the KaTuro folder
 *   quiz    { path }        → one quiz and its answer key (the phone checks the sheets itself)
 *
 * Writing follows the safe-edit SOP (backup in KaTuro Backups, edits in the
 * "<name> (KaTuro edit).xlsx" working copy, which later recordings continue in), and the
 * records rule: LRN matching only, ready class records only, no silent overwrite.
 * A recording sent twice (the phone's answer got lost on the Wi-Fi) is written once.
 */
import { readDocument } from '../desk/readers/index.js';
import { applyEdits } from '../desk/docmap/index.js';
import { readClassRecord, planRecord } from '../desk/records/recordSheet.js';
import { RECORDS_DIR, parseClassRecordFileName } from '../desk/records/classRecords.js';
import { QUIZ_FILE, CHECK_FILE, parseQuiz } from '../desk/bubble/quiz.js';
import { flattenFileTree, readDirectoryRecursively, readFileBytes, saveWorkingCopy, workingCopyPath } from '../localFileSystem.js';

const RECORD_FILE = /\.(xlsx|xlsm)$/i;
const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const SKIP_DIRS = /(^|\/)(KaTuro Backups|KaTuro Outputs)(\/|$)/i;
const KEEP_APPLIED = 300;

export class RequestError extends Error {
  constructor(message, code = 'ERROR', extra = {}) {
    super(message);
    this.code = code;
    Object.assign(this, extra);
  }
}

/** Remembers recordings already written (by the phone's id), so a resend is not written twice. */
export function memoryAppliedStore() {
  const m = new Map();
  return { get: (id) => m.get(id), set: (id, v) => { m.set(id, v); if (m.size > KEEP_APPLIED) m.delete(m.keys().next().value); } };
}

export function localAppliedStore(key = 'katuro-phone-applied-v1') {
  const load = () => { try { return JSON.parse(localStorage.getItem(key) || '[]'); } catch { return []; } };
  return {
    get: (id) => load().find((x) => x.id === id)?.result,
    set: (id, result) => {
      try { localStorage.setItem(key, JSON.stringify([...load().filter((x) => x.id !== id), { id, result }].slice(-KEEP_APPLIED))); } catch { /* full */ }
    },
  };
}

const isWorkingCopy = (p) => workingCopyPath(p) === p;
const inRecords = (p) => p.toLowerCase().startsWith(`${RECORDS_DIR.toLowerCase()}/`);

/**
 * handle   — the KaTuro folder (localFileSystem handle: 'electron' in the app, virtual in tests)
 * applied  — memoryAppliedStore() / localAppliedStore()
 * onWrote(path) — after a class record was written (KaTuroDesk refreshes its file list)
 */
export function createDeskRequestHandler({ handle, applied = memoryAppliedStore(), onWrote = () => {} }) {
  let queue = Promise.resolve(); // one write at a time

  const allFiles = async () => flattenFileTree(await readDirectoryRecursively(handle)).filter((f) => f.kind !== 'directory' && !SKIP_DIRS.test(f.path));

  async function recordFiles() {
    const files = await allFiles();
    const paths = new Set(files.map((f) => f.path));
    return files
      .filter((f) => inRecords(f.path) && RECORD_FILE.test(f.path) && !isWorkingCopy(f.path) && !f.name.startsWith('~$'))
      .map((f) => {
        const copy = workingCopyPath(f.path);
        return { path: f.path, name: f.name, source: paths.has(copy) ? copy : f.path };
      })
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  }

  async function load(path) {
    const files = await recordFiles();
    const f = files.find((x) => x.path === path);
    if (!f) throw new RequestError('That class record is not in your Records folder any more. Refresh the list.', 'NOT_FOUND');
    const bytes = await readFileBytes(handle, f.source);
    const record = readClassRecord(await readDocument({ bytes, name: f.source.split('/').pop() }));
    return { file: f, bytes, record };
  }

  const summary = (f, record) => {
    const cls = parseClassRecordFileName(f.name);
    if (record.error) return { path: f.path, name: f.name.replace(RECORD_FILE, ''), ...(cls || {}), ready: false, problems: [record.error], learnerCount: 0 };
    return {
      path: f.path,
      name: f.name.replace(RECORD_FILE, ''),
      ...(cls || {}),
      ready: record.ready,
      problems: record.problems.slice(0, 5).map((p) => p.detail),
      learnerCount: record.learners.length,
      editing: f.source !== f.path ? f.source : null,
    };
  };

  async function classes() {
    const out = [];
    for (const f of await recordFiles()) {
      try {
        const bytes = await readFileBytes(handle, f.source);
        out.push(summary(f, readClassRecord(await readDocument({ bytes, name: f.source.split('/').pop() }))));
      } catch {
        out.push({ path: f.path, name: f.name.replace(RECORD_FILE, ''), ready: false, problems: ['This file could not be read. It may be open in Excel or damaged.'], learnerCount: 0 });
      }
    }
    return { classes: out };
  }

  async function oneClass({ path }) {
    const { file, record } = await load(path);
    if (record.error) throw new RequestError(record.error, 'NOT_A_RECORD');
    return { ...summary(file, record), learners: record.learners, columns: record.columns, scores: record.scores };
  }

  async function record(args) {
    const id = String(args.id || '');
    if (id && applied.get(id)) return { ...applied.get(id), repeated: true };
    const { file, bytes, record: rec } = await load(String(args.path || ''));
    const plan = planRecord(rec, { column: args.column, hps: args.hps, scores: args.scores || [], overwrite: Boolean(args.overwrite) });
    if (!plan.ok) throw new RequestError(plan.message, plan.reason.toUpperCase(), { details: { conflicts: plan.conflicts, invalid: plan.invalid, unknown: plan.unknown, hpsInFile: plan.hpsInFile } });
    let saved = null;
    let skipped = [];
    if (plan.edits.length) {
      const out = await applyEdits(bytes, file.source.split('/').pop(), plan.edits);
      skipped = out.skipped || [];
      if (skipped.length === plan.edits.length) throw new RequestError('None of the scores could be written: those cells hold formulas or are protected. Check the class record on KaTuroDesk.', 'NOT_WRITTEN');
      saved = await saveWorkingCopy(handle, file.path, out.bytes, XLSX_MIME);
      onWrote(saved.path);
    }
    const result = {
      ok: true,
      class: file.name.replace(RECORD_FILE, ''),
      column: plan.column.label,
      hps: plan.hps,
      written: plan.written.length,
      unchanged: plan.unchanged,
      skipped: skipped.map((s) => s.cell),
      missing: plan.missing,
      savedTo: saved?.path || null,
      backup: saved?.backups?.[0] || null,
    };
    if (id) applied.set(id, result);
    return result;
  }

  async function quizzes() {
    const files = await allFiles();
    const out = [];
    for (const f of files.filter((x) => x.name === QUIZ_FILE)) {
      try {
        const quiz = parseQuiz(new TextDecoder().decode(await readFileBytes(handle, f.path)));
        if (!quiz) continue;
        const folder = f.path.split('/').slice(0, -1).join('/');
        const hasKey = files.some((x) => x.path === `${folder}/${CHECK_FILE}`);
        out.push({ path: f.path, title: quiz.title, section: quiz.section, items: quiz.items, learners: quiz.learners.length, createdAt: quiz.createdAt, hasKey });
      } catch { /* unreadable quiz file: left out */ }
    }
    return { quizzes: out.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))) };
  }

  async function oneQuiz({ path }) {
    const quiz = parseQuiz(new TextDecoder().decode(await readFileBytes(handle, String(path || ''))));
    if (!quiz) throw new RequestError('That bubble quiz could not be read.', 'NOT_FOUND');
    let answerKey = null;
    try {
      const check = JSON.parse(new TextDecoder().decode(await readFileBytes(handle, `${path.split('/').slice(0, -1).join('/')}/${CHECK_FILE}`)));
      if (Array.isArray(check?.answerKey) && check.answerKey.length === quiz.items) answerKey = check.answerKey;
    } catch { /* no key saved yet */ }
    return { quiz, answerKey };
  }

  return async function handleRequest(op, args = {}) {
    switch (op) {
      case 'classes': return classes();
      case 'class': return oneClass(args);
      case 'record': {
        const run = queue.then(() => record(args));
        queue = run.catch(() => {});
        return run;
      }
      case 'quizzes': return quizzes();
      case 'quiz': return oneQuiz(args);
      default: throw new RequestError('KaTuroDesk does not know that request. Update KaTuroDesk.', 'UNKNOWN_OP');
    }
  };
}
