/**
 * specEdits.js — the Canvas editor's changes to a DocumentSpec. Pure code: every function
 * returns a new spec (or block) and never changes the one it was given.
 */
import { normalizeStyle, normalizeMargins, normalizeFont, MARGIN_PRESETS, DEFAULT_FONT } from './docSpec.js';

/** A block with its formatting changed; `null` in the patch clears that setting. */
export function setBlockStyle(block, patch) {
  const merged = { ...(block.style || {}) };
  for (const [k, v] of Object.entries(patch)) {
    if (v === null || v === undefined || v === false) delete merged[k];
    else merged[k] = v;
  }
  const style = normalizeStyle(merged);
  const next = { ...block };
  if (style) next.style = style;
  else delete next.style;
  return next;
}

/** Moves the block's left indent by `step` inches (0 to 4). */
export function shiftIndent(block, step) {
  const now = block.style?.indent || 0;
  const to = Math.max(0, Math.min(4, Math.round((now + step) * 100) / 100));
  return setBlockStyle(block, { indent: to || null });
}

/** The margin preset the margins match, or 'custom'. */
export function marginPresetOf(margins) {
  const m = margins || MARGIN_PRESETS.katuro;
  const hit = Object.entries(MARGIN_PRESETS).find(([, p]) => ['top', 'bottom', 'left', 'right'].every((k) => p[k] === m[k]));
  return hit ? hit[0] : 'custom';
}

/** The spec with new margins; refused (null) when they leave too little room for the text. */
export function setMargins(spec, margins) {
  const m = normalizeMargins(margins, spec.paper, spec.orientation);
  if (!m) return null;
  const next = { ...spec };
  if (marginPresetOf(m) === 'katuro') delete next.margins;
  else next.margins = m;
  return next;
}

/** The spec with a new paper or orientation; margins that no longer fit fall back to KaTuro's. */
export function setPage(spec, patch) {
  const next = { ...spec, ...patch };
  if (next.margins && !normalizeMargins(next.margins, next.paper, next.orientation)) delete next.margins;
  return next;
}

export function setFont(spec, patch) {
  const font = normalizeFont({ ...(spec.font || DEFAULT_FONT), ...patch });
  const next = { ...spec };
  if (font) next.font = font;
  else delete next.font;
  return next;
}

/** A new block of a kind, ready to edit. */
export function newBlock(type) {
  switch (type) {
    case 'heading': return { type, level: 2, text: 'New heading' };
    case 'bullets': return { type, items: ['New item'], ordered: false };
    case 'numbered': return { type: 'bullets', items: ['New item'], ordered: true };
    case 'table': return { type, columns: ['Column 1', 'Column 2', 'Column 3'], rows: [['', '', ''], ['', '', '']] };
    case 'answerLines': return { type, count: 3 };
    case 'pageBreak': return { type };
    case 'cutLine': return { type };
    default: return { type: 'paragraph', text: 'New paragraph' };
  }
}

export function insertBlock(spec, index, type) {
  const blocks = [...spec.blocks];
  blocks.splice(index + 1, 0, newBlock(type));
  return { ...spec, blocks };
}

/** Table columns: add one after `col` (or at the end), or delete one (a table keeps at least one). */
export function addColumn(table, col = table.columns.length - 1) {
  const at = col + 1;
  const ins = (arr, v) => [...arr.slice(0, at), v, ...arr.slice(at)];
  const next = { ...table, columns: ins(table.columns, `Column ${table.columns.length + 1}`), rows: table.rows.map((r) => ins(r, '')) };
  delete next.widths;
  return next;
}

export function deleteColumn(table, col) {
  if (table.columns.length <= 1) return table;
  const del = (arr) => arr.filter((_, i) => i !== col);
  const next = { ...table, columns: del(table.columns), rows: table.rows.map(del) };
  if (table.widths) next.widths = del(table.widths);
  return next;
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Find and replace in every piece of text the teacher can see: title, subtitle, the info
 * strip, headings, paragraphs, lists, tables, questions, choices and answers.
 * → { spec, count }
 */
export function findReplace(spec, find, replace, { matchCase = false, wholeWord = false } = {}) {
  if (!find) return { spec, count: 0 };
  const re = new RegExp(`${wholeWord ? '\\b' : ''}${escapeRe(find)}${wholeWord ? '\\b' : ''}`, matchCase ? 'g' : 'gi');
  let count = 0;
  const swap = (text) => {
    if (typeof text !== 'string' || !text) return text;
    return text.replace(re, () => {
      count += 1;
      return replace;
    });
  };
  const blocks = spec.blocks.map((b) => {
    switch (b.type) {
      case 'heading':
      case 'paragraph':
        return { ...b, text: swap(b.text) };
      case 'bullets':
        return { ...b, items: b.items.map(swap) };
      case 'table':
        return { ...b, columns: b.columns.map(swap), rows: b.rows.map((r) => r.map(swap)) };
      case 'questions':
        return { ...b, items: b.items.map((q) => ({ ...q, question: swap(q.question), ...(q.choices ? { choices: q.choices.map(swap) } : {}), ...(q.answer !== undefined ? { answer: swap(q.answer) } : {}) })) };
      default:
        return b;
    }
  });
  const next = {
    ...spec,
    title: swap(spec.title),
    ...(spec.subtitle !== undefined ? { subtitle: swap(spec.subtitle) } : {}),
    meta: (spec.meta || []).map((m) => ({ ...m, value: swap(m.value) })),
    blocks,
  };
  return { spec: next, count };
}

/** How many times `find` appears (for "3 found" before replacing). */
export const countMatches = (spec, find, opts) => findReplace(spec, find, find, opts).count;

// ── Undo / redo ───────────────────────────────────────────────
// Typing in one box quickly is one step: changes less than `mergeMs` apart are merged.
export const emptyHistory = () => ({ past: [], future: [], at: 0 });

export function record(history, before, now = Date.now(), mergeMs = 800) {
  if (history.past.length && now - history.at < mergeMs) return { ...history, at: now, future: [] };
  return { past: [...history.past.slice(-99), before], future: [], at: now };
}

/** → { history, spec } or null when there is nothing to undo. */
export function undo(history, current) {
  if (!history.past.length) return null;
  const spec = history.past[history.past.length - 1];
  return { spec, history: { past: history.past.slice(0, -1), future: [current, ...history.future], at: 0 } };
}

export function redo(history, current) {
  if (!history.future.length) return null;
  const [spec, ...future] = history.future;
  return { spec, history: { past: [...history.past, current], future, at: 0 } };
}
