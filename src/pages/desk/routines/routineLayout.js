/**
 * routineLayout.js — the Routine Builder's editing rules (pure; no React):
 * auto-arrange (dagre, MIT), "only plugs that fit can join", tap-to-add after the chosen card,
 * remove, and plain words for what each card will do.
 */
import { graphlib, layout } from '@dagrejs/dagre';
import { cardDef, say, PLUG_LABEL } from '../../../services/desk/routines/catalog';
import { cleanSettings, downstreamOf, fits, newCard, plugsOf, runOrder } from '../../../services/desk/routines/routine';
import { DAY_NAMES } from '../../../services/desk/schedule/schedule';

export const FIL_DAYS = ['Lin', 'Lun', 'Mar', 'Miy', 'Huw', 'Biy', 'Sab'];
export const CARD_W = 240;
export const CARD_H = 108;

/** Cards placed left to right in running order (branches below each other). */
export function arrange(routine) {
  const g = new graphlib.Graph();
  g.setGraph({ rankdir: 'LR', nodesep: 36, ranksep: 70, marginx: 20, marginy: 20 });
  g.setDefaultEdgeLabel(() => ({}));
  for (const c of routine.cards) g.setNode(c.id, { width: CARD_W, height: CARD_H });
  for (const w of routine.wires) g.setEdge(w.from, w.to);
  layout(g);
  return {
    ...routine,
    cards: routine.cards.map((c) => {
      const n = g.node(c.id);
      return n ? { ...c, x: Math.round(n.x - CARD_W / 2), y: Math.round(n.y - CARD_H / 2) } : c;
    }),
  };
}

/** Can a wire go from one card to another? → { ok, reason } (reason in plain words). */
export function canConnect(routine, from, to, lang = 'en') {
  const a = routine.cards.find((c) => c.id === from);
  const b = routine.cards.find((c) => c.id === to);
  if (!a || !b || a.id === b.id) return { ok: false, reason: '' };
  const defB = cardDef(b.type);
  if (!defB || defB.kind === 'when') return { ok: false, reason: 'Nothing can come before a purple "When" card.' };
  if (routine.wires.some((w) => w.to === to)) return { ok: false, reason: `"${say(defB.label, lang)}" already has a card before it.` };
  if (downstreamOf(routine, to).has(from)) return { ok: false, reason: 'That would make a loop.' };
  const plug = plugsOf(routine).get(from);
  if (!fits(plug, defB)) {
    const want = defB.accepts.filter((x) => x !== 'any').map((x) => say(PLUG_LABEL[x], lang)).join(' or ');
    return { ok: false, reason: `"${say(defB.label, lang)}" needs ${want}; this card gives ${plug ? say(PLUG_LABEL[plug], lang) : 'nothing'}.` };
  }
  return { ok: true, reason: '' };
}

export const connect = (routine, from, to) => (canConnect(routine, from, to).ok ? { ...routine, wires: [...routine.wires, { from, to }] } : routine);

export const disconnect = (routine, from, to) => ({ ...routine, wires: routine.wires.filter((w) => !(w.from === from && w.to === to)) });

/**
 * Adds a card. It is joined after `afterId` (or the last card in running order) when it fits;
 * a new "When" card replaces the old one. → { routine, card, joined }
 */
export function addCard(routine, type, afterId = null) {
  const def = cardDef(type);
  if (!def) return { routine, card: null, joined: false };
  const card = newCard(type);
  let next = { ...routine, cards: [...routine.cards, card] };
  if (def.kind === 'when') {
    // One way to start: the new When card takes the old one's place.
    const old = routine.cards.find((c) => cardDef(c.type)?.kind === 'when');
    if (old) {
      next = {
        ...next,
        cards: next.cards.filter((c) => c.id !== old.id),
        wires: routine.wires.map((w) => (w.from === old.id ? { ...w, from: card.id } : w)).filter((w) => w.to !== old.id),
      };
      next = { ...next, wires: next.wires.filter((w) => canConnectWire(next, w)) };
    }
    return { routine: arrange(next), card, joined: false };
  }
  const order = runOrder(routine);
  const after = (afterId && routine.cards.find((c) => c.id === afterId)) || order[order.length - 1] || null;
  let joined = false;
  if (after && canConnect(next, after.id, card.id).ok) {
    next = connect(next, after.id, card.id);
    joined = true;
  }
  return { routine: arrange(next), card, joined };
}

// A wire still fits after the cards around it changed.
function canConnectWire(routine, w) {
  const without = { ...routine, wires: routine.wires.filter((x) => x !== w) };
  return canConnect(without, w.from, w.to).ok;
}

/** Removes a card and its wires. */
export function removeCard(routine, id) {
  return arrange({ ...routine, cards: routine.cards.filter((c) => c.id !== id), wires: routine.wires.filter((w) => w.from !== id && w.to !== id) });
}

/** New settings for one card (cleaned by its fields). */
export function setSettings(routine, id, patch) {
  return {
    ...routine,
    cards: routine.cards.map((c) => {
      if (c.id !== id) return c;
      const def = cardDef(c.type);
      return { ...c, settings: { ...cleanSettings(def, { ...c.settings, ...patch }).settings, ...pickRaw(def, patch) } };
    }),
  };
}

// While the teacher is typing, keep what they typed (so a half-typed number is not replaced);
// checkRoutine shows the problem until it is right.
function pickRaw(def, patch) {
  const out = {};
  for (const f of def.fields) if (Object.prototype.hasOwnProperty.call(patch, f.key) && ['text', 'number', 'offset'].includes(f.kind)) out[f.key] = patch[f.key];
  return out;
}

const base = (p) => String(p || '').split('/').pop();

/** One short line under a card's name: what it will do with its settings. */
export function cardLine(card, lang = 'en') {
  const s = card.settings || {};
  const fil = lang === 'fil';
  switch (card.type) {
    case 'when.manual': return fil ? 'Kapag pinindot mo ang ▶' : 'When you press ▶';
    case 'when.schedule': {
      const t = s.time || '';
      if (s.repeat === 'daily') return `${fil ? 'Araw-araw' : 'Every day'} ${t}`;
      if (s.repeat === 'weekdays') return `${fil ? 'Lunes–Biyernes' : 'Mon–Fri'} ${t}`;
      if (s.repeat === 'monthly') return `${fil ? 'Tuwing ika-' : 'Day '}${s.dayOfMonth || '?'} ${t}`;
      const days = (s.weekdays || []).map((d) => (fil ? FIL_DAYS[d] : DAY_NAMES[d]?.slice(0, 3))).join(', ');
      return `${days || (fil ? 'Pumili ng araw' : 'Pick a day')} ${t}`;
    }
    case 'when.deped': {
      const def = cardDef(card.type);
      const ev = def.fields[0].options.find((o) => o.value === s.event);
      const n = Number(s.offsetDays) || 0;
      const when = n === 0 ? (fil ? 'mismong araw' : 'on the day') : n < 0 ? `${-n} ${fil ? 'araw bago' : 'day(s) before'}` : `${n} ${fil ? 'araw pagkatapos' : 'day(s) after'}`;
      return `${say(ev?.label, lang) || '?'}: ${when}`;
    }
    case 'when.newFiles': return s.folder ? base(s.folder) : (fil ? 'Pumili ng folder' : 'Pick a folder');
    case 'get.sheet': case 'get.record': case 'get.quiz': return s.path ? base(s.path) : (fil ? 'Pumili ng file' : 'Pick a file');
    case 'get.folder': return s.folder ? base(s.folder) : (fil ? 'Pumili ng folder' : 'Pick a folder');
    case 'do.attendance': return `${s.minConsecutive || 3}+ ${fil ? 'araw na sunod-sunod' : 'days in a row'}`;
    case 'do.typeScores': return `${base(s.targetPath) || '?'} · ${s.targetColumn || '?'}`;
    case 'do.recordTest': return `${base(s.targetPath) || '?'} · ${s.column || '?'}`;
    case 'do.checkPapers': return s.answerKeyPath ? `${fil ? 'Susi' : 'Key'}: ${base(s.answerKeyPath)}` : (fil ? 'Pumili ng answer key' : 'Pick the answer key');
    case 'do.reading': return [s.passageWords && `${s.passageWords} ${fil ? 'salita' : 'words'}`, s.questions && `${s.questions} ${fil ? 'tanong' : 'questions'}`, s.test].filter(Boolean).join(' · ');
    case 'do.classGrades': return [s.subject, s.gradeSection].filter(Boolean).join(' · ');
    case 'do.dll': return [s.subject, s.gradeLevel].filter(Boolean).join(' · ');
    case 'do.submissionPack': return s.title || '';
    case 'ask.approve': return s.note || (fil ? 'Hihintayin ang OK mo' : 'Waits for your OK');
    case 'save.folder': return s.folder ? base(s.folder) : (fil ? 'Pumili ng folder' : 'Pick a folder');
    case 'save.notify': return s.message || (fil ? 'Abiso sa computer na ito' : 'A notice on this computer');
    default: return '';
  }
}

/** What a card would do, as a sentence (Try, and reading a card aloud). */
export function cardSentence(card, lang = 'en') {
  const def = cardDef(card.type);
  if (!def) return '';
  const line = cardLine(card, lang);
  return `${say(def.label, lang)}${line ? `: ${line}` : ''}. ${say(def.help, lang)}`;
}
