/**
 * assistantMessages.js — turns a due event into the bubble's message: the persona's words
 * and the buttons. The lesson status and files come from what was really prepared.
 */
import { assistantLine } from './assistantLines.js';
import { className, clock } from './teachingDay.js';

const fmt = (min) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

/** The prepared files of a lesson by kind. */
export function lessonFiles(rec) {
  const files = rec?.files || [];
  return {
    slides: files.find((f) => /\.pptx$/i.test(f.path)) || null,
    plan: files.find((f) => /\.docx$/i.test(f.path) && !/worksheet/i.test(f.name)) || null,
    worksheet: files.find((f) => /worksheet/i.test(f.name)) || null,
  };
}

/** "ready" | "preparing" | "failed" | "missing" for a lesson record. */
export const lessonStatus = (rec) => (rec?.status === 'ready' ? 'ready' : rec?.status === 'preparing' ? 'preparing' : rec?.status === 'failed' ? 'failed' : 'missing');

/**
 * The message for one event.
 *   ev: from dueEvents(); ctx: { persona, name, prepared }
 * → { id, kind, title, text, actions: [{ id, label }], data }
 */
export function messageFor(ev, { persona, name, prepared = {} }) {
  if (ev.type === 'brief') {
    const lessons = ev.periods.filter((p) => p.lesson.kind === 'lesson');
    const ready = lessons.filter((p) => lessonStatus(prepared[p.lesson.key]) === 'ready').length;
    const { title, text } = assistantLine(persona, 'brief', { name, count: ev.periods.length, classes: ev.periods.map((p) => `${className(p.cls)} at ${clock(fmt(p.start))}`), ready, notReady: lessons.length - ready });
    return { id: ev.key, kind: 'brief', title, text, actions: [{ id: 'openClasses', label: 'See today' }, { id: 'dismiss', label: 'OK' }], data: {} };
  }
  const p = ev.period;
  const facts = { name, cls: className(p.cls), time: clock(fmt(p.start)), minutes: ev.minutes };
  if (ev.type === 'after') {
    const { title, text } = assistantLine(persona, 'after', { ...facts, topic: p.lesson.item.text });
    return { id: ev.key, kind: 'after', title, text, actions: [{ id: 'finished', label: 'Yes, finished' }, { id: 'notFinished', label: 'Not finished' }], data: { classId: p.cls.id, iso: ev.key.split('|')[1] } };
  }
  // A reminder: what kind of day it is for this class.
  if (p.lesson.kind === 'special') {
    const { title, text } = assistantLine(persona, 'special', { ...facts, special: p.lesson.special.title });
    return { id: ev.key, kind: 'special', title, text, actions: [{ id: 'dismiss', label: 'OK' }, { id: 'snooze', label: 'Remind me in 5 min' }], data: {} };
  }
  if (p.lesson.kind !== 'lesson') {
    const { title, text } = assistantLine(persona, 'noSequence', facts);
    return { id: ev.key, kind: 'noSequence', title, text, actions: [{ id: 'openClasses', label: 'Set the lessons' }, { id: 'dismiss', label: 'Later' }], data: {} };
  }
  const rec = prepared[p.lesson.key];
  const status = lessonStatus(rec);
  const files = lessonFiles(rec);
  const { title, text } = assistantLine(persona, 'remind', { ...facts, topic: p.lesson.item.text, status });
  const actions = [];
  if (files.slides) actions.push({ id: 'openSlides', label: 'Open slides' });
  if (files.plan) actions.push({ id: 'openPlan', label: 'Open lesson plan' });
  if (status === 'failed') actions.push({ id: 'prepareNow', label: 'Try again' });
  actions.push({ id: 'snooze', label: 'Remind me in 5 min' });
  actions.push({ id: 'dismiss', label: 'OK' });
  return { id: ev.key, kind: 'remind', title, text, actions: actions.slice(0, 4), data: { key: p.lesson.key, files } };
}

/**
 * The bubble's look right now.
 * → 'quiet' | 'preparing' | 'reminder' | 'needs' | 'ready' | 'resting'
 */
export function bubbleMood({ inClass, preparing, current, todayLessons = [], prepared = {}, problems = 0 }) {
  if (inClass) return 'quiet';
  if (current?.kind === 'remind' || current?.kind === 'brief' || current?.kind === 'special') return 'reminder';
  if (current?.kind === 'after' || current?.kind === 'noSequence' || problems > 0) return 'needs';
  if (preparing) return 'preparing';
  if (todayLessons.length && todayLessons.every((p) => lessonStatus(prepared[p.lesson.key]) === 'ready')) return 'ready';
  return 'resting';
}

/** A chat answer as plain short text for the bubble. */
export function bubbleReply(content) {
  const plain = String(content || '').replace(/\*{1,3}|<\/?u>|`/g, '').replace(/\n{2,}/g, '\n').trim();
  return plain.length > 420 ? `${plain.slice(0, 400).trim()}… (the full answer is in KaTuroDesk)` : plain;
}
