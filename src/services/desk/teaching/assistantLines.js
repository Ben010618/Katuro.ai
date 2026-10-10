/**
 * assistantLines.js — what the persona says in the bubble and the notifications.
 * The facts (class, time, lesson, file status) always come from the schedule and the
 * prepared files; the persona only changes the wording. No emoji.
 */

const list = (xs) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);

/** facts: { name, cls, time, minutes, topic, status: 'ready'|'preparing'|'missing'|'failed', count, classes, special } */
const LINES = {
  matt: {
    brief: (f) => `Yow ${f.name}! ${f.count} class${f.count > 1 ? 'es' : ''} today: ${list(f.classes)}. ${f.readyText}`,
    remind: (f) => `${f.name}, ${f.cls} in ${f.minutes} minutes! ${f.statusText} Kaya natin 'to!`,
    special: (f) => `Heads up ${f.name}: ${f.cls} at ${f.time}. ${f.special}. No new lesson today.`,
    after: (f) => `Done with ${f.cls}, ${f.name}? Did you finish "${f.topic}"? If you don't answer, I'll count it as done.`,
    noSequence: (f) => `${f.name}, ${f.cls} at ${f.time}, but I don't know which lesson is next. Set the lessons in My classes!`,
  },
  luna: {
    brief: (f) => `Good morning, ${f.name}. You have ${f.count} class${f.count > 1 ? 'es' : ''} today: ${list(f.classes)}. ${f.readyText}`,
    remind: (f) => `If I may, ${f.name}: your ${f.cls} class begins in ${f.minutes} minutes. ${f.statusText}`,
    special: (f) => `Kindly note, ${f.name}: ${f.cls} at ${f.time}. ${f.special}. No new lesson is prepared for today.`,
    after: (f) => `${f.name}, I hope the class went well. Were you able to finish "${f.topic}" with ${f.cls}? If I do not hear from you, I will mark it as finished.`,
    noSequence: (f) => `${f.name}, your ${f.cls} class is at ${f.time}, but I do not yet know the next lesson. Kindly set the lessons in My classes.`,
  },
  grey: {
    brief: (f) => `Good day, ${f.name}. Classes today: ${f.count} (${list(f.classes)}). ${f.readyText}`,
    remind: (f) => `${f.name}, ${f.cls} in ${f.minutes} minutes. ${f.statusText}`,
    special: (f) => `${f.name}, ${f.cls} at ${f.time}. Calendar: ${f.special}. No new lesson today.`,
    after: (f) => `${f.name}, ${f.cls} has ended. Was "${f.topic}" finished? No answer counts as finished.`,
    noSequence: (f) => `${f.name}, ${f.cls} at ${f.time}. The next lesson is unknown: set the lesson sequence in My classes.`,
  },
  carmen: {
    brief: (f) => `${f.name}. ${f.count} class${f.count > 1 ? 'es' : ''} today: ${list(f.classes)}. ${f.readyText} Be ready before the bell.`,
    remind: (f) => `${f.name}, ${f.minutes} minutes. ${f.cls} is waiting. ${f.statusText} Check it before you walk in.`,
    special: (f) => `${f.name}, ${f.cls} at ${f.time}. ${f.special}. No new lesson today, so prepare for that instead.`,
    after: (f) => `${f.name}, ${f.cls} is done. Did you really finish "${f.topic}"? Tell me the truth. No answer means finished.`,
    noSequence: (f) => `${f.name}, ${f.cls} is at ${f.time} and you have not told me the lessons. Set them in My classes. Now.`,
  },
};

const statusText = (status, topic) => ({
  ready: `Lesson "${topic}" and slides are ready.`,
  preparing: `I'm still preparing "${topic}"; it will be ready in a few minutes.`,
  failed: `I could not prepare "${topic}". Open My classes to try again.`,
  missing: `"${topic}" is not prepared yet; I'm starting it now.`,
}[status] || '');

/**
 * The line for one event, in the persona's voice.
 *   kind: 'brief' | 'remind' | 'special' | 'after' | 'noSequence'
 * → { title, text }
 */
export function assistantLine(personaId, kind, facts) {
  const p = LINES[personaId] || LINES.matt;
  const f = { ...facts };
  f.statusText = statusText(f.status, f.topic);
  if (kind === 'brief') {
    f.readyText = f.notReady ? `${f.ready} of ${f.count} lesson${f.count > 1 ? 's are' : ' is'} ready; I'm preparing the rest.` : 'All lessons are ready.';
  }
  const title = { brief: 'Today\'s classes', remind: `${f.cls} at ${f.time}`, special: `${f.cls} at ${f.time}`, after: `${f.cls} ended`, noSequence: `${f.cls} at ${f.time}` }[kind] || 'KaTuroDesk';
  const say = p[kind] || LINES.matt[kind];
  return { title, text: say ? say(f).replace(/\s+/g, ' ').trim() : '' };
}
