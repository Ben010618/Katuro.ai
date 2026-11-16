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
 * Writing: a backup in KaTuro Backups first, every time, then the scores go straight into the
 * class record (one file per class; localFileSystem.saveWorkingCopy edits Records in place).
 * If the file is open in Excel, nothing is changed and the teacher is told to close it. The
 * records rule: LRN matching only, ready class records only, no silent overwrite.
 * A recording sent twice (the phone's answer got lost on the Wi-Fi) is written once.
 */
import { readDocument } from '../desk/readers/index.js';
import { applyEdits } from '../desk/docmap/index.js';
import { readClassRecord, planRecord } from '../desk/records/recordSheet.js';
import { isInRecords, parseClassRecordFileName } from '../desk/records/classRecords.js';
import { QUIZ_FILE, CHECK_FILE, parseQuiz } from '../desk/bubble/quiz.js';
import { flattenFileTree, readDirectoryRecursively, readFileBytes, saveWorkingCopy, workingCopyPath, isFileOpenError, writeFileToDirectory, fileExists, backupFile, editsInPlace, sha256Hex } from '../localFileSystem.js';
import { attendancePathFor, isAttendanceFile, newAttendanceWorkbook, readAttendance, writeAttendance, MARKS } from '../desk/records/attendance.js';

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
function memoryAppliedStore() {
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

/**
 * The history of recordings made from the phone (newest last), for "who changed what, when"
 * and Undo. Each entry: { id, at, device, path, class, column, columnLabel, cells: [{ lrn, name, before, after }],
 * hps: { before, after } | null, undoneAt }.
 */
const KEEP_HISTORY = 300;
function memoryHistoryStore() {
  let list = [];
  return { all: () => list, add: (e) => { list = [...list, e].slice(-KEEP_HISTORY); }, update: (id, patch) => { list = list.map((e) => (e.id === id ? { ...e, ...patch } : e)); } };
}
export function localHistoryStore(key = 'katuro-phone-history-v1') {
  const load = () => { try { return JSON.parse(localStorage.getItem(key) || '[]'); } catch { return []; } };
  const save = (l) => { try { localStorage.setItem(key, JSON.stringify(l.slice(-KEEP_HISTORY))); } catch { /* full */ } };
  return { all: load, add: (e) => save([...load(), e]), update: (id, patch) => save(load().map((e) => (e.id === id ? { ...e, ...patch } : e))) };
}

const isWorkingCopy = (p) => workingCopyPath(p) === p;

/**
 * handle   — the KaTuro folder (localFileSystem handle: 'electron' in the app, virtual in tests)
 * applied  — memoryAppliedStore() / localAppliedStore()
 * history  — memoryHistoryStore() / localHistoryStore(): recordings from the phone, for Undo
 * onWrote(path) — after a class record was written (KaTuroDesk refreshes its file list)
 */
export function createDeskRequestHandler({ handle, applied = memoryAppliedStore(), history = memoryHistoryStore(), onWrote = () => {}, now = () => Date.now() }) {
  let queue = Promise.resolve(); // one write at a time

  const allFiles = async () => flattenFileTree(await readDirectoryRecursively(handle)).filter((f) => f.kind !== 'directory' && !SKIP_DIRS.test(f.path));

  async function recordFiles() {
    const files = await allFiles();
    const paths = new Set(files.map((f) => f.path));
    return files
      .filter((f) => isInRecords(f.path) && RECORD_FILE.test(f.path) && !isWorkingCopy(f.path) && !isAttendanceFile(f.path) && !f.name.startsWith('~$'))
      .map((f) => {
        // KaTuro class records are edited in place; any other workbook gets the "(KaTuro edit)"
        // copy, and later readings continue in that copy.
        const copy = workingCopyPath(f.path);
        const source = !editsInPlace(f.path, handle) && paths.has(copy) ? copy : f.path;
        return { path: f.path, name: f.name, source };
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

  /** Writes edits into the class record (backup first). → saveWorkingCopy's result */
  async function writeRecord(file, bytes, edits) {
    const out = await applyEdits(bytes, file.source.split('/').pop(), edits);
    const skipped = out.skipped || [];
    if (skipped.length === edits.length) throw new RequestError('None of the scores could be written: those cells hold formulas or are protected. Check the class record on KaTuroDesk.', 'NOT_WRITTEN');
    let saved;
    try {
      // Refused if the record changed after it was read (e.g. a KaTuroDesk task saved it).
      saved = await saveWorkingCopy(handle, file.path, out.bytes, XLSX_MIME, new Date(now()), { baseHash: await sha256Hex(bytes) });
    } catch (err) {
      if (err.code === 'FILE_OPEN' || isFileOpenError(err)) throw new RequestError(`${file.name} is open in Excel on the computer. Close it there, then send again.`, 'FILE_OPEN');
      if (err.code === 'FILE_CHANGED') throw new RequestError(`${file.name} changed on KaTuroDesk just now. Send again.`, 'FILE_CHANGED');
      throw err;
    }
    onWrote(saved.path);
    return { saved, skipped };
  }

  async function record(args, device) {
    const id = String(args.id || '');
    if (id && applied.get(id)) return { ...applied.get(id), repeated: true };
    const { file, bytes, record: rec } = await load(String(args.path || ''));
    const plan = planRecord(rec, { column: args.column, hps: args.hps, scores: args.scores || [], overwrite: Boolean(args.overwrite) });
    if (!plan.ok) throw new RequestError(plan.message, plan.reason.toUpperCase(), { details: { conflicts: plan.conflicts, invalid: plan.invalid, unknown: plan.unknown, hpsInFile: plan.hpsInFile } });
    let saved = null;
    let skipped = [];
    if (plan.edits.length) {
      ({ saved, skipped } = await writeRecord(file, bytes, plan.edits));
      const skippedCells = new Set(skipped.map((s) => s.cell));
      const col = plan.column;
      history.add({
        id: id || `h-${now()}`,
        at: now(),
        device: device?.name || 'Phone',
        path: file.path,
        class: file.name.replace(RECORD_FILE, ''),
        column: col.key,
        columnLabel: col.label,
        hps: plan.hpsSet ? { before: col.hps, after: plan.hps } : null,
        cells: plan.written
          .filter((w) => !skippedCells.has(`${col.cell}${rec.learners.find((l) => l.lrn === w.lrn)?.row}`))
          .map((w) => ({ lrn: w.lrn, name: w.name, before: w.before ?? null, after: w.score })),
        undoneAt: null,
      });
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

  /** Recordings made from the phone, newest first (one class, or all). */
  function recordings({ path } = {}) {
    return {
      history: history.all()
        .filter((e) => !path || e.path === path)
        .slice(-30)
        .reverse()
        .map(({ id, at, device, class: cls, columnLabel, cells, hps, undoneAt }) => ({ id, at, device, class: cls, columnLabel, count: cells.length, hps: hps?.after ?? null, undoneAt, cells: cells.slice(0, 60) })),
    };
  }

  /**
   * Puts back what a phone recording replaced. Only when the cells still hold what that
   * recording wrote: a score changed since then is never overwritten (the teacher is told).
   */
  async function undo({ id } = {}, device) {
    const entry = history.all().find((e) => e.id === id);
    if (!entry) throw new RequestError('That recording is not in the history any more.', 'NOT_FOUND');
    if (entry.undoneAt) return { ok: true, already: true };
    const { file, bytes, record: rec } = await load(entry.path);
    if (rec.error) throw new RequestError(rec.error, 'NOT_A_RECORD');
    const col = rec.columns.find((c) => c.key === entry.column);
    if (!col) throw new RequestError(`${entry.columnLabel} is no longer in ${file.name}.`, 'NO_COLUMN');
    const now0 = rec.scores[entry.column] || {};
    const changedSince = entry.cells.filter((c) => (now0[c.lrn] ?? null) !== c.after);
    if (changedSince.length) {
      throw new RequestError(`Not undone: ${changedSince.length} score(s) in ${entry.columnLabel} were changed after this recording (${changedSince.slice(0, 3).map((c) => c.name).join(', ')}). Fix them on KaTuroDesk.`, 'CHANGED_SINCE');
    }
    const rows = new Map(rec.learners.map((l) => [l.lrn, l.row]));
    const edits = entry.cells.filter((c) => rows.has(c.lrn)).map((c) => ({ sheet: rec.sheet, cell: `${col.cell}${rows.get(c.lrn)}`, value: c.before }));
    if (entry.hps && col.hpsCell && col.hps === entry.hps.after) edits.push({ sheet: rec.sheet, cell: col.hpsCell, value: entry.hps.before });
    if (edits.length) await writeRecord(file, bytes, edits);
    history.update(id, { undoneAt: now(), undoneBy: device?.name || 'Phone' });
    return { ok: true, restored: edits.length, class: entry.class, column: entry.columnLabel };
  }

  // ── attendance (Records/Attendance/<class>.xlsx) ──
  async function attendanceFor(path) {
    const { file, record: rec } = await load(String(path || ''));
    if (rec.error) throw new RequestError(rec.error, 'NOT_A_RECORD');
    if (!rec.ready) throw new RequestError('This class record is not ready yet: every learner needs a clear full name and a 12-digit LRN. Fix it on KaTuroDesk first.', 'NOT_READY');
    const attPath = attendancePathFor(file.path);
    const exists = await fileExists(handle, attPath);
    return { file, rec, attPath, exists };
  }

  async function attendanceGet({ path, date } = {}) {
    const { rec, attPath, exists } = await attendanceFor(path);
    const marks = exists ? await readAttendance(await readFileBytes(handle, attPath), String(date || '')) : {};
    return { learners: rec.learners.map(({ lrn, name, sex }) => ({ lrn, name, sex })), marks, file: attPath };
  }

  async function attendance({ id, path, date, marks = {} } = {}) {
    if (id && applied.get(id)) return { ...applied.get(id), repeated: true };
    const { file, rec, attPath, exists } = await attendanceFor(path);
    const known = new Set(rec.learners.map((l) => l.lrn));
    const clean = Object.fromEntries(Object.entries(marks || {}).filter(([lrn, m]) => known.has(lrn) && MARKS.includes(String(m).toUpperCase())));
    if (!Object.keys(clean).length) throw new RequestError('Mark at least one learner.', 'INVALID');
    const learners = rec.learners.map(({ lrn, name }) => ({ lrn, name }));
    const start = exists ? await readFileBytes(handle, attPath) : await newAttendanceWorkbook({ title: file.name.replace(RECORD_FILE, ''), learners });
    const out = await writeAttendance(start, { date, marks: clean, learners });
    try {
      // KaTuro's own attendance file: backed up, then updated in place (never a copy).
      if (exists) await backupFile(handle, attPath, new Date(now()));
      await writeFileToDirectory(handle, attPath, out.bytes, XLSX_MIME, { overwrite: exists });
    } catch (err) {
      if (err.code === 'FILE_OPEN' || isFileOpenError(err)) throw new RequestError(`${attPath.split('/').pop()} is open in Excel on the computer. Close it there, then send again.`, 'FILE_OPEN');
      throw err;
    }
    onWrote(attPath);
    const counts = Object.values(clean).reduce((m, x) => ({ ...m, [x.toUpperCase()]: (m[x.toUpperCase()] || 0) + 1 }), {});
    const result = { ok: true, file: attPath, date, counts, absentStreaks: out.absentStreaks };
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

  // Writes go one at a time (two phones, or a recording and an undo, never mix).
  const serial = (fn) => {
    const run = queue.then(fn);
    queue = run.catch(() => {});
    return run;
  };

  return async function handleRequest(op, args = {}, device = null) {
    switch (op) {
      case 'classes': return classes();
      case 'class': return oneClass(args);
      case 'record': return serial(() => record(args, device));
      case 'history': return recordings(args);
      case 'undo': return serial(() => undo(args, device));
      case 'attendanceGet': return attendanceGet(args);
      case 'attendance': return serial(() => attendance(args));
      case 'quizzes': return quizzes();
      case 'quiz': return oneQuiz(args);
      default: throw new RequestError('KaTuroDesk does not know that request. Update KaTuroDesk.', 'UNKNOWN_OP');
    }
  };
}
