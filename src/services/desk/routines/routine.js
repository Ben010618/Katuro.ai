/**
 * routine.js — a KaTuro Routine as data: cleaned, checked and explained (no UI, no running).
 *
 *   routine = { id, name, version: 1, enabled, cards: [{ id, type, settings, x, y }], wires: [{ from, to }] }
 *
 * cleanRoutine() rebuilds every routine from the catalog's fields only, so anything else in a
 * file (extra keys, "__proto__", code, huge strings) is dropped, never kept or run.
 * checkRoutine() lists every problem in plain words; a routine with problems cannot be switched
 * on or run. The rules (docs/ROUTINES.md):
 *   - exactly one When card, and it starts the routine
 *   - every other card has exactly one wire coming in, and is reached from the When card
 *   - no loops; at most MAX_CARDS cards
 *   - a wire only joins plugs that fit (a sheet into a card that takes a sheet)
 *   - a card that changes a record has "Ask me first" before it
 *   - every setting is a valid value; files and folders are inside the open folder
 */

import { CARDS, MAX_CARDS, MAX_TEXT, cardDef, say, PLUG_LABEL } from './catalog.js';

export const ROUTINE_VERSION = 1;
export const MAX_NAME = 80;
export const MAX_IMPORT_BYTES = 200_000;

const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const plainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
// Control characters are dropped from every text (a file cannot hide instructions in them).
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;
const cleanText = (v, max = MAX_TEXT) => String(v ?? '').replace(CONTROL, '').replace(/\s+/g, ' ').trim().slice(0, max);
const ID = /^[A-Za-z0-9_-]{1,40}$/;

/**
 * A path inside the open folder, or '' when it is not one: no "..", no drive or root, no
 * backslashes, no control characters. Folders lose a trailing slash.
 */
export function cleanPath(v) {
  const raw = String(v ?? '');
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001F\u007F]/.test(raw)) return ''; // a path with hidden characters is refused, not repaired
  const s = raw.trim();
  if (!s || s.length > 400) return '';
  if (/^[a-zA-Z]:|^[\\/]|\\|:/.test(s)) return '';
  const parts = s.split('/').filter(Boolean);
  if (!parts.length || parts.some((p) => p === '.' || p === '..' || p.trim() !== p)) return '';
  return parts.join('/');
}

const TIME = /^([01]\d|2[0-3]):([0-5]\d)$/;

/**
 * One setting, cleaned by its field definition → { value } or { value, problem }.
 * A wrong value is replaced by the field's usual value (or left empty) AND reported, so the
 * teacher is told (checkRoutine on a draft, `dropped` from cleanRoutine) instead of it changing quietly.
 */
function cleanSetting(field, raw) {
  const empty = field.kind === 'days' ? [] : '';
  const fallback = field.default ?? empty;
  const missing = raw === undefined || raw === null || raw === '' || (Array.isArray(raw) && !raw.length);
  if (missing) return { value: fallback };
  switch (field.kind) {
    case 'text':
      return { value: cleanText(raw, field.max || MAX_TEXT) };
    case 'number':
    case 'offset': {
      const n = Number(raw);
      if (!Number.isFinite(n) || (field.int !== false && !Number.isInteger(n))) return { value: fallback, problem: 'is not a whole number' };
      if (n < field.min || n > field.max) return { value: fallback, problem: `must be from ${field.min} to ${field.max}` };
      return { value: n };
    }
    case 'choice': {
      const hit = field.options.find((o) => String(o.value) === String(raw));
      return hit ? { value: hit.value } : { value: fallback, problem: 'is not one of the choices' };
    }
    case 'days': {
      const list = (Array.isArray(raw) ? raw : []).map(Number).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6);
      return { value: [...new Set(list)].sort() };
    }
    case 'time':
      return TIME.test(String(raw)) ? { value: String(raw) } : { value: fallback, problem: 'is not a time (HH:MM)' };
    case 'file': {
      const p = cleanPath(raw);
      if (!p) return { value: '', problem: 'must be a file inside your KaTuro folder' };
      if (field.accept && !field.accept.test(p)) return { value: p, problem: 'is not the right kind of file' };
      return { value: p };
    }
    case 'folder': {
      const p = cleanPath(raw);
      return p ? { value: p } : { value: '', problem: 'must be a folder inside your KaTuro folder' };
    }
    default:
      return { value: '' };
  }
}

/** True when a field is shown (and so required) with these settings. */
export function fieldShown(field, settings) {
  if (!field.showIf) return true;
  return Object.entries(field.showIf).every(([k, v]) => settings?.[k] === v);
}

/** Settings rebuilt from a card's fields only (defaults filled). → { settings, problems: [text] } */
export function cleanSettings(def, raw = {}) {
  const src = plainObject(raw) ? raw : {};
  const settings = {};
  const problems = [];
  for (const field of def.fields) {
    const { value, problem } = cleanSetting(field, own(src, field.key) ? src[field.key] : undefined);
    settings[field.key] = value;
    if (problem) problems.push(`${say(field.label)} ${problem}`);
  }
  for (const field of def.fields) {
    const v = settings[field.key];
    const empty = v === '' || v === null || v === undefined || (Array.isArray(v) && !v.length);
    if (field.required && fieldShown(field, settings) && empty) problems.push(`${say(field.label)} is needed`);
  }
  return { settings, problems };
}

let counter = 0;
export const newId = (prefix = 'c') => `${prefix}${Date.now().toString(36)}${(counter++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/** A new card of a type, with its default settings. */
export function newCard(type, pos = {}) {
  const def = cardDef(type);
  if (!def) throw new Error(`Unknown card "${type}".`);
  return { id: newId('c'), type, settings: cleanSettings(def, {}).settings, x: Number(pos.x) || 0, y: Number(pos.y) || 0 };
}

/** A new, empty routine (just a "When I press Play" card). */
export function newRoutine(name = 'My routine') {
  return { id: newId('r'), name: cleanText(name, MAX_NAME) || 'My routine', version: ROUTINE_VERSION, enabled: false, cards: [newCard('when.manual')], wires: [] };
}

/**
 * Any object (a saved routine, an imported file, the AI's draft) → a clean routine built only
 * from known cards and fields. Unknown cards and broken wires are dropped (and listed).
 * → { routine, dropped: [text] }
 */
export function cleanRoutine(raw) {
  const src = plainObject(raw) ? raw : {};
  const dropped = [];
  const cards = [];
  const ids = new Set();
  for (const c of (Array.isArray(src.cards) ? src.cards : []).slice(0, MAX_CARDS * 2)) {
    if (!plainObject(c)) continue;
    const def = typeof c.type === 'string' ? cardDef(c.type) : null;
    if (!def) {
      dropped.push(`an unknown card${typeof c.type === 'string' ? ` "${cleanText(c.type, 40)}"` : ''}`);
      continue;
    }
    let id = typeof c.id === 'string' && ID.test(c.id) && !ids.has(c.id) ? c.id : newId('c');
    while (ids.has(id)) id = newId('c');
    ids.add(id);
    const num = (v) => (Number.isFinite(Number(v)) ? Math.max(-100000, Math.min(100000, Number(v))) : 0);
    const { settings, problems } = cleanSettings(def, c.settings);
    // Wrong values were set back to the usual value: say so (a missing required value is not
    // listed here; checkRoutine asks for it).
    for (const p of problems.filter((x) => !/ is needed$/.test(x))) dropped.push(`${say(def.label)}: ${p} (set back to the usual value)`);
    cards.push({ id, type: def.type, settings, x: num(c.x), y: num(c.y) });
  }
  const wires = [];
  const seen = new Set();
  for (const w of Array.isArray(src.wires) ? src.wires : []) {
    if (!plainObject(w) || typeof w.from !== 'string' || typeof w.to !== 'string') continue;
    if (!ids.has(w.from) || !ids.has(w.to) || w.from === w.to) {
      dropped.push('a wire to a card that is not there');
      continue;
    }
    const key = `${w.from}>${w.to}`;
    if (!seen.has(key)) wires.push({ from: w.from, to: w.to });
    seen.add(key);
  }
  return {
    routine: {
      id: typeof src.id === 'string' && ID.test(src.id) ? src.id : newId('r'),
      name: cleanText(src.name, MAX_NAME) || 'My routine',
      version: ROUTINE_VERSION,
      enabled: src.enabled === true,
      cards,
      wires,
    },
    dropped,
  };
}

/** A routine file the teacher picked (JSON text) → { routine, dropped } or throws a plain message. */
export function importRoutineText(text) {
  const s = String(text ?? '');
  if (s.length > MAX_IMPORT_BYTES) throw new Error('This routine file is too big to be a KaTuro routine.');
  let raw;
  try {
    raw = JSON.parse(s);
  } catch {
    throw new Error('This is not a KaTuro routine file.');
  }
  if (!plainObject(raw) || !Array.isArray(raw.cards)) throw new Error('This is not a KaTuro routine file.');
  const out = cleanRoutine({ ...raw, enabled: false }); // an imported routine always starts switched off
  return out;
}

/** The routine as a file to share (no run history, switched off). */
export function exportRoutineText(routine) {
  const { routine: r } = cleanRoutine(routine);
  return JSON.stringify({ kind: 'katuro-routine', version: ROUTINE_VERSION, name: r.name, cards: r.cards, wires: r.wires }, null, 2);
}

/** What flows out of each card (Ask me first passes on what came in). → Map(cardId → plug|null) */
export function plugsOf(routine) {
  const byId = new Map(routine.cards.map((c) => [c.id, c]));
  const incoming = new Map();
  for (const w of routine.wires) incoming.set(w.to, w.from);
  const memo = new Map();
  const out = (id, depth = 0) => {
    if (memo.has(id)) return memo.get(id);
    const card = byId.get(id);
    const def = card && cardDef(card.type);
    let plug = def ? def.gives : null;
    if (plug === 'same') plug = depth > MAX_CARDS || !incoming.has(id) ? null : out(incoming.get(id), depth + 1);
    memo.set(id, plug ?? null);
    return plug ?? null;
  };
  return new Map(routine.cards.map((c) => [c.id, out(c.id)]));
}

/** True when a plug fits a card's input. */
export function fits(plug, def) {
  if (!plug || !def || !def.accepts.length) return false;
  return def.accepts.includes('any') || def.accepts.includes(plug);
}

/** Cards in running order (from the When card, breadth-first). Unreached cards are left out. */
export function runOrder(routine) {
  const start = routine.cards.find((c) => cardDef(c.type)?.kind === 'when');
  if (!start) return [];
  const next = new Map();
  for (const w of routine.wires) next.set(w.from, [...(next.get(w.from) || []), w.to]);
  const byId = new Map(routine.cards.map((c) => [c.id, c]));
  const order = [];
  const seen = new Set([start.id]);
  const queue = [start.id];
  while (queue.length) {
    const id = queue.shift();
    order.push(byId.get(id));
    for (const to of next.get(id) || []) {
      if (!seen.has(to) && byId.has(to)) {
        seen.add(to);
        queue.push(to);
      }
    }
  }
  return order;
}

/** Every card after this one (its whole branch). */
export function downstreamOf(routine, cardId) {
  const next = new Map();
  for (const w of routine.wires) next.set(w.from, [...(next.get(w.from) || []), w.to]);
  const out = new Set();
  const stack = [...(next.get(cardId) || [])];
  while (stack.length) {
    const id = stack.pop();
    if (out.has(id)) continue;
    out.add(id);
    stack.push(...(next.get(id) || []));
  }
  return out;
}

/** The cards before this one, nearest first. */
export function upstreamOf(routine, cardId) {
  const prev = new Map(routine.wires.map((w) => [w.to, w.from]));
  const out = [];
  let id = prev.get(cardId);
  while (id && !out.includes(id) && out.length <= MAX_CARDS) {
    out.push(id);
    id = prev.get(id);
  }
  return out;
}

/**
 * Every problem with a routine, in plain words (empty = ready to run).
 * → [{ cardId?, text }]
 */
export function checkRoutine(routine, lang = 'en') {
  const problems = [];
  const add = (text, cardId) => problems.push({ ...(cardId ? { cardId } : {}), text });
  const cards = routine?.cards || [];
  const wires = routine?.wires || [];
  const byId = new Map(cards.map((c) => [c.id, c]));
  const name = (c) => `"${say(cardDef(c.type)?.label, lang)}"`;

  if (!cards.length) add('The routine has no cards.');
  if (cards.length > MAX_CARDS) add(`A routine can have at most ${MAX_CARDS} cards.`);
  const whens = cards.filter((c) => cardDef(c.type)?.kind === 'when');
  if (!whens.length) add('Add a purple "When" card to say when the routine starts.');
  if (whens.length > 1) add('A routine starts in one way only: keep one purple "When" card.');

  const incoming = new Map();
  for (const w of wires) incoming.set(w.to, [...(incoming.get(w.to) || []), w.from]);
  const plugs = plugsOf({ cards, wires });

  for (const c of cards) {
    const def = cardDef(c.type);
    if (!def) {
      add('A card is not known to KaTuro.', c.id);
      continue;
    }
    const { problems: bad } = cleanSettings(def, c.settings);
    for (const p of bad) add(`${name(c)}: ${p}.`, c.id);
    const ins = incoming.get(c.id) || [];
    if (def.kind === 'when') {
      if (ins.length) add(`${name(c)} starts the routine, so nothing can come before it.`, c.id);
      continue;
    }
    if (!ins.length) {
      add(`${name(c)} is not joined to anything. Join it to the card before it.`, c.id);
      continue;
    }
    if (ins.length > 1) add(`${name(c)} can take only one wire coming in.`, c.id);
    const from = byId.get(ins[0]);
    const plug = from ? plugs.get(from.id) : null;
    if (from && !fits(plug, def)) {
      const want = def.accepts.filter((a) => a !== 'any').map((a) => say(PLUG_LABEL[a], lang)).join(' or ');
      add(`${name(c)} needs ${want || 'something'}, but ${name(from)} gives ${plug ? say(PLUG_LABEL[plug], lang) : 'nothing'}.`, c.id);
    }
  }

  // Loops, and cards not reached from the When card.
  const order = runOrder({ cards, wires });
  const reached = new Set(order.map((c) => c?.id));
  if (whens.length === 1) {
    for (const c of cards) if (!reached.has(c.id) && cardDef(c.type)?.kind !== 'when' && (incoming.get(c.id) || []).length) add(`${name(c)} is in a loop or not reached from the "When" card.`, c.id);
  }

  // A card that changes a record needs "Ask me first" before it.
  for (const c of cards) {
    if (!cardDef(c.type)?.changesRecords) continue;
    const asked = upstreamOf({ cards, wires }, c.id).some((id) => byId.get(id)?.type === 'ask.approve');
    if (!asked) add(`${name(c)} changes your class record, so put a yellow "Ask me first" card before it.`, c.id);
  }
  return problems;
}

/** A one-line, plain description of what the routine does. */
export function describeRoutine(routine, lang = 'en') {
  const order = runOrder(routine);
  if (!order.length) return '';
  return order.map((c) => say(cardDef(c.type)?.label, lang)).join(' → ');
}

/** The catalog grouped by kind, for the card shelf. */
export function shelf() {
  const groups = { when: [], get: [], do: [], ask: [], save: [] };
  for (const c of CARDS) groups[c.kind].push(c);
  return groups;
}
