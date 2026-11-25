/**
 * talk.js — "talk to build": a sentence (English or Filipino) → a routine drawn from the catalog.
 *
 *   "Every Friday, check attendance and make notices for 3+ absences"
 *     → When (Fri 3 PM) → A sheet → Find frequent absences → Tell me when done
 *
 * The AI only PROPOSES cards: its answer goes through cleanRoutine (unknown cards, code and extra
 * keys dropped, paths checked) and checkRoutine like any imported file, and nothing runs or is
 * switched on until the teacher looks at the cards and saves them. Only card names, their
 * settings and the folder's file and folder names are sent (as for every KaTuroDesk request);
 * no file contents.
 */
import { CARDS, MAX_CARDS } from './catalog.js';
import { checkRoutine, cleanRoutine } from './routine.js';

const MAX_LIST = 150;
const RELEVANT = /\.(xlsx|xlsm|xls|csv|tsv|docx|pdf|txt)$/i;

/** The catalog as compact text for the AI: type, kind, plugs, fields (allowed values). */
function catalogForAI() {
  return CARDS.map((c) => {
    const fields = c.fields.map((f) => {
      if (f.kind === 'choice') return `${f.key}: one of ${f.options.map((o) => JSON.stringify(o.value)).join('|')}`;
      if (f.kind === 'days') return `${f.key}: [0-6] (0 = Sunday)`;
      if (f.kind === 'number' || f.kind === 'offset') return `${f.key}: whole number ${f.min}..${f.max}`;
      if (f.kind === 'time') return `${f.key}: "HH:MM"`;
      if (f.kind === 'file') return `${f.key}: a file path from FILES${f.records ? ' (in Records)' : ''}`;
      if (f.kind === 'folder') return `${f.key}: a folder path from FOLDERS`;
      return `${f.key}: short text`;
    }).join('; ');
    return `- ${c.type} [${c.kind}] takes ${c.accepts.length ? c.accepts.join('/') : 'nothing'} gives ${c.gives || 'nothing'}${c.changesRecords ? ' CHANGES A RECORD (needs ask.approve before it)' : ''} — ${c.label.en}: ${c.help.en}${fields ? ` Settings: ${fields}` : ''}`;
  }).join('\n');
}

export const TALK_SYSTEM = `You build KaTuro Routines for a Filipino DepEd teacher from what they say (English, Filipino or Taglish).
A routine is a row of cards wired left to right. Use ONLY these cards and settings:
${catalogForAI()}

Rules:
1. Exactly one "when" card, first. Every other card has exactly one wire coming in from a card whose "gives" it "takes" (ask.approve, save.notify take anything; ask.approve passes on what it got).
2. Put ask.approve directly before any card that CHANGES A RECORD. save.folder comes directly after a "do" card (put any ask.approve before that "do" card); at most one save.folder per "do" card.
3. File and folder settings: use ONLY exact paths from FILES / FOLDERS. If you are not sure which file the teacher means, leave the setting "" (the teacher will choose). Never invent a path.
4. Never invent numbers the teacher did not say (passage words, questions, columns): leave them "".
5. At most ${MAX_CARDS} cards. Keep it as short as possible.
6. If the teacher asks for something no card can do, build what you can and say what is missing in "message".
Reply with JSON only: {"name": string, "cards": [{"id": "c1", "type": string, "settings": object}], "wires": [{"from": "c1", "to": "c2"}], "message": string (one or two short sentences for the teacher, in their language)}`;

/** The prompt: what the teacher said, the current routine (when changing it), files and folders. */
export function talkPrompt(text, current, { files = [], folders = [] } = {}) {
  const list = (arr) => arr.slice(0, MAX_LIST).map((p) => `- ${p}`).join('\n') || '(none)';
  const now = current?.cards?.length > 1 ? `\nCURRENT ROUTINE (change it as asked; keep what they did not ask to change):\n${JSON.stringify({ name: current.name, cards: current.cards.map(({ id, type, settings }) => ({ id, type, settings })), wires: current.wires })}\n` : '';
  return `TEACHER: ${String(text).slice(0, 400)}\n${now}\nFILES:\n${list(files.filter((p) => RELEVANT.test(p)))}\n\nFOLDERS:\n${list(folders)}`;
}

/**
 * text → { routine, message, problems } using `ask(system, prompt)` (the Desk's AI call, JSON).
 * The routine keeps the current routine's id when it was a change.
 */
export async function talkToRoutine(text, current, ask, ctx = {}) {
  if (!String(text || '').trim()) throw new Error('Say what the routine should do.');
  const reply = await ask(TALK_SYSTEM, talkPrompt(text, current, ctx));
  if (!reply || typeof reply !== 'object' || !Array.isArray(reply.cards)) throw new Error('KaTuro could not draw that routine. Try saying it another way, or build it from the cards.');
  const { routine, dropped } = cleanRoutine({ ...reply, id: current?.id, enabled: false });
  if (!routine.cards.length) throw new Error('KaTuro could not draw that routine. Try saying it another way, or build it from the cards.');
  const problems = checkRoutine(routine);
  const parts = [String(reply.message || '').slice(0, 300)];
  if (dropped.length) parts.push(`Left out: ${dropped.slice(0, 3).join('; ')}.`);
  if (problems.length) parts.push(`Before it can be switched on: ${problems.slice(0, 2).map((p) => p.text).join(' ')}`);
  return { routine, message: parts.filter(Boolean).join(' '), problems };
}
