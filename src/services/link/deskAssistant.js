/**
 * deskAssistant.js — KaTuroDesk answering the KaTuro App's assistant and schedule requests
 * (Phase 4). Runs in the KaTuroDesk window, next to deskRequests.js.
 *
 *   schedule    { from, to }           → the teacher's days (classes, own entries, school calendar)
 *   reminders   {}                     → own entries with a reminder, next 30 days (the phone rings them too)
 *   addEvent    { title, date, time, note, remindMinutes } → saved in the KaTuroDesk calendar
 *   doneEvent / removeEvent { id }
 *   ask         { prompt, history, persona, confirmedPlan } → one turn of the KaTuroDesk agent,
 *               on the KaTuro folder: the same agent, tools, privacy masking and rules as
 *               the chat on the computer. Files it makes are saved in Lessons / Records
 *               (default save places) and listed so the phone can open them.
 *   checkPhotos { path, photos }       → reads photos of written/other answer sheets of a Test with the
 *               AI (the check_answer_sheets reader) against the test's key and learner list:
 *               { rows: [{ photo, n, name, score, items, unclear, note? }] }. Nothing is saved or recorded.
 */
import { scheduleDays } from '../desk/agent/calendarTools.js';
import { eventProblem } from '../../pages/desk/calendar/reminders.js';
import { addDays, isoDay } from '../desk/teaching/teachingDay.js';
import { RequestError } from './deskRequests.js';
import { PHOTOS_DIR, PHOTO_FILE } from '../desk/bubble/quiz.js';
import { folderOf, loadTest } from '../desk/bubble/tests.js';
import { readFileBytes, fileExists, convertHeicToJpeg } from '../localFileSystem.js';

const MAX_DAYS = 31;
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const MAX_HISTORY = 12;
const MAX_PROMPT = 4000;
const MAX_PHOTOS = 60;
const CHECK_PHOTOS_MS = 4 * 60000;

const clean = (v) => String(v ?? '').replace(/\s+/g, ' ').trim();

/**
 * getState()            → { calendarEvents, myClasses, lessonSequences, teachingLog, scheduledTasks, persona, privacyMode, eSignature }
 * calendar              → { add(ev), update(id, patch), remove(id) }
 * getWorkspace()        → Promise of the KaTuro folder as a workspace ({ handle, files, name })
 * getAccount()          → { user, profile } of the teacher signed in on KaTuroDesk
 * runTurn(options)      → runDeskAgentTurn
 * getHandle()           → the KaTuro folder's handle (checkPhotos reads only what it needs)
 * llm(options)          → the AI for checkPhotos (callDeskLLM; replaced in tests)
 * checkPhotosMs         → checkPhotos stops reading at this time and answers with what it read
 *                         (KaTuroDesk's main process waits 15 s longer, the phone 5 minutes)
 */
const deskLLM = async (opts) => (await import('../desk/agent/llm.js')).callDeskLLM({ kind: 'task', ...opts });

export function createAssistantHandler({ getState, calendar, getWorkspace, getHandle = null, getAccount, runTurn, llm = deskLLM, checkPhotosMs = CHECK_PHOTOS_MS, now = Date.now }) {
  function schedule({ from, to } = {}) {
    const today = isoDay(now());
    const a = ISO.test(String(from || '')) ? from : today;
    let b = ISO.test(String(to || '')) ? to : addDays(a, 6);
    if (b < a) b = a;
    if (addDays(a, MAX_DAYS - 1) < b) b = addDays(a, MAX_DAYS - 1);
    return { from: a, to: b, today, days: scheduleDays({ from: a, to: b, state: getState(), now: now() }) };
  }

  function reminders() {
    const today = isoDay(now());
    const until = addDays(today, 30);
    return {
      reminders: (getState().calendarEvents || [])
        .filter((ev) => ev.time && ev.remindMinutes !== null && ev.remindMinutes !== undefined && !ev.doneAt && ev.date >= today && ev.date <= until)
        .map(({ id, title, date, time, remindMinutes, note }) => ({ id, title, date, time, remindMinutes, note: note || '' })),
    };
  }

  function addEvent(args = {}) {
    const ev = {
      title: clean(args.title),
      date: String(args.date || ''),
      time: String(args.time || ''),
      note: String(args.note || '').trim(),
      remindMinutes: args.remindMinutes === null || args.remindMinutes === undefined || args.remindMinutes === '' ? null : Number(args.remindMinutes),
    };
    if (ev.remindMinutes !== null && !(Number.isInteger(ev.remindMinutes) && ev.remindMinutes >= 0 && ev.remindMinutes <= 10080)) throw new RequestError('Choose when to be reminded.', 'INVALID');
    const problem = eventProblem(ev);
    if (problem) throw new RequestError(problem, 'INVALID');
    calendar.add(ev);
    const saved = [...(getState().calendarEvents || [])].reverse().find((e) => e.title === ev.title && e.date === ev.date && (e.time || '') === ev.time);
    return { ok: true, event: saved ? { id: saved.id, title: saved.title, date: saved.date, time: saved.time, remindMinutes: saved.remindMinutes } : ev };
  }

  function ownEvent(id) {
    const ev = (getState().calendarEvents || []).find((e) => e.id === id);
    if (!ev) throw new RequestError('That entry is not in your KaTuroDesk calendar any more.', 'NOT_FOUND');
    return ev;
  }

  async function ask({ prompt, history = [], persona, confirmedPlan = null } = {}) {
    const text = String(prompt || '').trim().slice(0, MAX_PROMPT);
    if (!text && !confirmedPlan) throw new RequestError('Type or say what you need.', 'INVALID');
    const { user, profile } = getAccount() || {};
    if (!user) throw new RequestError('Sign in to KaTuroDesk on the computer first.', 'NOT_SIGNED_IN');
    const state = getState();
    const workspace = await getWorkspace();
    const turnHistory = (Array.isArray(history) ? history : [])
      .filter((m) => (m?.role === 'user' || m?.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
      .slice(-MAX_HISTORY)
      .map((m) => ({ role: m.role, content: m.content.slice(0, MAX_PROMPT) }));
    const run = (options) => runTurn(options).catch((err) => {
      // Today's AI limit: the phone answers with the persona's own "limit reached" line.
      if (err?.dailyLimit || err?.status === 429) throw new RequestError(err.message || "Today's AI limit is reached.", 'DAILY_LIMIT');
      throw err;
    });
    const result = await run({
      prompt: text,
      workspace,
      history: turnHistory,
      user,
      profile,
      privacyMode: state.privacyMode !== false,
      persona: persona || state.persona,
      eSignature: state.eSignature || null,
      confirmedPlan: confirmedPlan && Array.isArray(confirmedPlan.tasks) ? confirmedPlan : null,
    });
    return {
      content: result.content || '',
      files: (result.createdFiles || []).map((f) => ({ path: f.path, name: f.name || f.path.split('/').pop() })),
      choices: result.choices || [],
      pendingPlan: result.pendingPlan || null,
    };
  }

  /** Photos of a Test's answer sheets → rows for the teacher to review on the phone. */
  async function checkPhotos({ path, photos } = {}) {
    const started = now();
    const { user } = getAccount() || {};
    if (!user) throw new RequestError('Sign in to KaTuroDesk on the computer first.', 'NOT_SIGNED_IN');
    const p = String(path || '');
    const handle = getHandle ? getHandle() : (await getWorkspace()).handle;
    let test;
    try {
      test = await loadTest({ path: p, readText: async (x) => new TextDecoder().decode(await readFileBytes(handle, x)) });
    } catch (err) {
      throw new RequestError(err.message, err.code || 'NOT_FOUND');
    }
    const { quiz, answerKey: key } = test;
    if (!key) throw new RequestError('Set the answer key of this test first.', 'NO_KEY');
    const dir = `${folderOf(p)}/${PHOTOS_DIR}/`;
    const list = [...new Set((Array.isArray(photos) ? photos : []).map((x) => String(x || '').replace(/\\/g, '/')))];
    if (!list.length) throw new RequestError('Send at least one photo.', 'INVALID');
    if (list.length > MAX_PHOTOS) throw new RequestError(`Send up to ${MAX_PHOTOS} photos at a time.`, 'INVALID');
    for (const x of list) {
      if (!x.startsWith(dir) || x.split('/').includes('..') || !PHOTO_FILE.test(x)) throw new RequestError("Those photos are not in this test's Photos folder.", 'INVALID');
      if (!(await fileExists(handle, x))) throw new RequestError(`${x.split('/').pop()} is not on KaTuroDesk. Send the photo again.`, 'NOT_FOUND');
    }
    const ctx = { llm, readBytes: (x) => readFileBytes(handle, x), heicToJpeg: (b, q) => convertHeicToJpeg(b, q) };
    const { readAnswerPhotos, sheetNote } = await import('../desk/agent/answerPhotos.js');
    const roster = quiz.learners.map((l) => l.name);
    let read;
    try {
      read = await readAnswerPhotos({ photos: list, key, roster, ctx, timeLimitMs: Math.max(1, checkPhotosMs - (now() - started)) });
    } catch (err) {
      if (err?.dailyLimit || err?.status === 429) throw new RequestError(err.message || "Today's AI limit is reached.", 'DAILY_LIMIT');
      if (err?.code === 'AI_UNAVAILABLE') throw new RequestError(err.message || 'The AI cannot be reached from KaTuroDesk right now. Check the internet on the computer.', 'AI_UNAVAILABLE');
      throw err;
    }
    const failed = new Map(read.failed.map((f) => [f.path, f.error]));
    const late = new Set(read.late);
    return {
      rows: list.map((photo, i) => {
        const r = read.results[i];
        if (!r && late.has(photo)) return { photo, n: null, name: null, score: null, items: quiz.items, unclear: [], note: 'Not read in time — check again' };
        if (!r) return { photo, n: null, name: null, score: null, items: quiz.items, unclear: [], note: `Could not be read (${failed.get(photo) || 'unclear photo'}). Retake the photo.` };
        const learner = r.matched ? quiz.learners.find((l) => l.name === r.matched) : null;
        const note = sheetNote(r, { hasRoster: roster.length > 0 });
        return { photo, n: learner?.n ?? null, name: learner?.name || r.name || null, score: r.score, items: quiz.items, unclear: r.unclear, ...(note ? { note } : {}) };
      }),
    };
  }

  return async function handleAssistantRequest(op, args = {}) {
    switch (op) {
      case 'schedule': return schedule(args);
      case 'reminders': return reminders();
      case 'addEvent': return addEvent(args);
      case 'doneEvent': ownEvent(args.id); calendar.update(args.id, { doneAt: now() }); return { ok: true };
      case 'removeEvent': ownEvent(args.id); calendar.remove(args.id); return { ok: true };
      case 'ask': return ask(args);
      case 'checkPhotos': return checkPhotos(args);
      default: return undefined; // not an assistant request
    }
  };
}

export const ASSISTANT_OPS = new Set(['schedule', 'reminders', 'addEvent', 'doneEvent', 'removeEvent', 'ask', 'checkPhotos']);
