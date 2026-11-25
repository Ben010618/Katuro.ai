/**
 * pilot.js — how routines are used on this computer (Routines › History › "How it is going").
 * For the teacher, and for a pilot (docs/ROUTINES_PILOT.md): counts only, no learner names,
 * no file names, nothing sent anywhere; the teacher can copy the text to share it.
 *
 * Time saved is a ROUGH ESTIMATE: KaTuro's typical minutes for doing each task by hand, counted
 * once per card that finished. It is labelled as an estimate everywhere it is shown.
 */
import { cardDef, say } from './catalog.js';

export const TWO_WEEKS_MS = 14 * 24 * 60 * 60 * 1000;

/** Typical minutes a teacher spends doing the task by hand (rough, for the estimate). */
export const MANUAL_MINUTES = {
  'do.attendance': 20,
  'do.itemAnalysis': 45,
  'do.classGrades': 60,
  'do.reportCards': 120,
  'do.reading': 40,
  'do.checkPapers': 60,
  'do.typeScores': 15,
  'do.consolidate': 30,
  'do.checkGrades': 30,
  'do.toPdf': 5,
  'do.submissionPack': 20,
  'do.dll': 45,
};

/**
 * → { routines, on, onTwoWeeks, runs, finished, stopped, approved, notApproved, waiting, minutes, byCard: [{ type, label, done, minutes }] }
 * onTwoWeeks: routines switched on for at least two weeks and still on.
 */
export function pilotSummary(routines = [], runs = [], meta = {}, now = Date.now(), lang = 'en') {
  const on = routines.filter((r) => r.enabled);
  const byType = new Map();
  let approved = 0;
  let notApproved = 0;
  for (const run of runs) {
    for (const c of run.routine?.cards || []) {
      const st = run.steps?.[c.id]?.status;
      if (st === 'approved') approved += 1;
      if (st === 'rejected') notApproved += 1;
      if (st === 'done' && MANUAL_MINUTES[c.type]) byType.set(c.type, (byType.get(c.type) || 0) + 1);
    }
  }
  const byCard = [...byType.entries()]
    .map(([type, done]) => ({ type, label: say(cardDef(type)?.label, lang), done, minutes: done * MANUAL_MINUTES[type] }))
    .sort((a, b) => b.minutes - a.minutes);
  return {
    routines: routines.length,
    on: on.length,
    onTwoWeeks: on.filter((r) => meta[r.id]?.enabledAt && now - meta[r.id].enabledAt >= TWO_WEEKS_MS).length,
    runs: runs.length,
    finished: runs.filter((r) => r.status === 'done').length,
    stopped: runs.filter((r) => r.status === 'error').length,
    waiting: runs.filter((r) => r.status === 'waiting').length,
    approved,
    notApproved,
    minutes: byCard.reduce((n, x) => n + x.minutes, 0),
    byCard,
  };
}

/** The summary as plain text to copy (counts only). */
export function pilotText(s, lang = 'en') {
  const h = (m) => (m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m} min`);
  const fil = lang === 'fil';
  return [
    fil ? 'KaTuro Routines — buod (bilang lamang, walang pangalan)' : 'KaTuro Routines — summary (counts only, no names)',
    `${fil ? 'Mga routine' : 'Routines'}: ${s.routines} · ${fil ? 'naka-on' : 'switched on'}: ${s.on} · ${fil ? 'naka-on nang 2+ linggo' : 'on for 2+ weeks'}: ${s.onTwoWeeks}`,
    `${fil ? 'Mga takbo' : 'Runs'}: ${s.runs} · ${fil ? 'natapos' : 'finished'}: ${s.finished} · ${fil ? 'huminto' : 'stopped'}: ${s.stopped} · ${fil ? 'naghihintay' : 'waiting'}: ${s.waiting}`,
    `"${fil ? 'Itanong muna sa akin' : 'Ask me first'}": ${fil ? 'inaprubahan' : 'approved'} ${s.approved} · ${fil ? 'hindi' : 'not approved'} ${s.notApproved}`,
    `${fil ? 'Tinatayang oras na natipid (magaspang na tantiya)' : 'Estimated time saved (rough estimate)'}: ${h(s.minutes)}`,
    ...s.byCard.map((x) => `  - ${x.label}: ${x.done}× ≈ ${h(x.minutes)}`),
  ].join('\n');
}
