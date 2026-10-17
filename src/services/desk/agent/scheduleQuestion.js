/**
 * scheduleQuestion.js — spots a plain question about the teacher's schedule ("what's my schedule
 * tomorrow?") so fastRoute answers it with my_schedule without the planner. Pure, no store.
 */
import { addDays, isoDay, weekday } from '../teaching/teachingDay.js';

const SCHEDULE_WORD = /\b(schedule|sched|iskedyul|agenda|calendar|next class|upcoming|coming up|holidays?|school activities|deped activities)\b/i;
const DAY_WORD = /\b(today|tomorrow|bukas|ngayon|this week|next week|this afternoon|this morning)\b/i;
const ITEM_WORD = /\b(class|classes|events?|activities|meetings?)\b/i;
const IS_COMMAND = /\b(add|set|create|put|book|move|cancel|delete|remove|rename|reschedule|change|remind me|make|write|prepare|schedule (a|an|my|the|ng)|i-?schedule|paki)\b/i;
const IS_CONTENT = /\b(lesson plan|dll|dlp|quiz|test items?|topic|ideas?|examples?|for my lesson|about|file|folder)\b/i;
const IS_QUESTION = /\?|\b(what|what's|whats|ano|anong|may|meron|do i have|is there|are there|any|show|tell me|list|when)\b/i;

/**
 * "What's my schedule tomorrow?" → { from, to, focus } for my_schedule, or null when the
 * request is not a plain question about the schedule (then the planner decides).
 */
export function scheduleQuestion(text, now = new Date()) {
  const t = String(text || '').toLowerCase();
  if (t.length > 100 || IS_COMMAND.test(t) || IS_CONTENT.test(t) || !IS_QUESTION.test(t)) return null;
  if (!SCHEDULE_WORD.test(t) && !(ITEM_WORD.test(t) && DAY_WORD.test(t))) return null;
  const today = isoDay(now.getTime ? now.getTime() : now);
  const focus = /\bnext class\b/.test(t) ? 'next'
    : /\b(holidays?|school activities|deped|calendar updates?)\b/.test(t) ? 'school'
      : /\b(class|classes|teach)\b/.test(t) ? 'classes' : 'all';
  if (focus === 'next') return { from: today, to: today, focus };
  if (/\b(tomorrow|bukas)\b/.test(t)) return { from: addDays(today, 1), to: addDays(today, 1), focus };
  if (/\bnext week\b/.test(t)) {
    const toMonday = ((8 - weekday(today)) % 7) || 7;
    const mon = addDays(today, toMonday);
    return { from: mon, to: addDays(mon, 6), focus };
  }
  if (/\b(this week|week)\b/.test(t)) return { from: today, to: addDays(today, 6 - weekday(today) > 0 ? 6 - weekday(today) : 6), focus };
  if (/\b(upcoming|coming up|updates?|next two weeks|soon)\b/.test(t)) return { from: today, to: addDays(today, 13), focus };
  if (/\b(today|ngayon|tonight|this afternoon|this morning)\b/.test(t) || focus !== 'school') return { from: today, to: today, focus };
  return { from: today, to: addDays(today, 13), focus };
}
