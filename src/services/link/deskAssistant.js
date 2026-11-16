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
 */
import { scheduleDays } from '../desk/agent/calendarTools.js';
import { eventProblem } from '../../pages/desk/calendar/reminders.js';
import { addDays, isoDay } from '../desk/teaching/teachingDay.js';
import { RequestError } from './deskRequests.js';

const MAX_DAYS = 31;
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const MAX_HISTORY = 12;
const MAX_PROMPT = 4000;

const clean = (v) => String(v ?? '').replace(/\s+/g, ' ').trim();

/**
 * getState()            → { calendarEvents, myClasses, lessonSequences, teachingLog, scheduledTasks, persona, privacyMode, eSignature }
 * calendar              → { add(ev), update(id, patch), remove(id) }
 * getWorkspace()        → Promise of the KaTuro folder as a workspace ({ handle, files, name })
 * getAccount()          → { user, profile } of the teacher signed in on KaTuroDesk
 * runTurn(options)      → runDeskAgentTurn
 */
export function createAssistantHandler({ getState, calendar, getWorkspace, getAccount, runTurn, now = Date.now }) {
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

  return async function handleAssistantRequest(op, args = {}) {
    switch (op) {
      case 'schedule': return schedule(args);
      case 'reminders': return reminders();
      case 'addEvent': return addEvent(args);
      case 'doneEvent': ownEvent(args.id); calendar.update(args.id, { doneAt: now() }); return { ok: true };
      case 'removeEvent': ownEvent(args.id); calendar.remove(args.id); return { ok: true };
      case 'ask': return ask(args);
      default: return undefined; // not an assistant request
    }
  };
}

export const ASSISTANT_OPS = new Set(['schedule', 'reminders', 'addEvent', 'doneEvent', 'removeEvent', 'ask']);
