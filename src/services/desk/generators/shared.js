/**
 * shared.js — small helpers shared by the KaTuroDesk file generators.
 */

import { PAPER_SIZES } from '../docSpec.js';

/** Page size in inches for a normalized spec, already swapped for landscape. */
export function pageInches(spec) {
  const p = PAPER_SIZES[spec?.paper] || PAPER_SIZES.long;
  const landscape = spec?.orientation === 'landscape';
  return landscape ? { width: p.heightIn, height: p.widthIn, landscape } : { width: p.widthIn, height: p.heightIn, landscape };
}

/** Portrait page size in inches (renderers that swap on their own). */
export function portraitInches(paper) {
  const p = PAPER_SIZES[paper] || PAPER_SIZES.long;
  return { width: p.widthIn, height: p.heightIn };
}

export const MARGIN_IN = { top: 0.5, bottom: 0.5, left: 0.6, right: 0.6 };

/** Header lines for the DepEd letterhead, in order. */
export function headerLines(header) {
  if (!header) return [];
  const lines = [
    { text: 'Republic of the Philippines', bold: false, size: 'small' },
    { text: 'Department of Education', bold: true, size: 'large' },
  ];
  if (header.region) lines.push({ text: String(header.region).toUpperCase(), bold: false, size: 'small' });
  if (header.division) lines.push({ text: String(header.division).toUpperCase(), bold: false, size: 'small' });
  if (header.school) lines.push({ text: String(header.school).toUpperCase(), bold: true, size: 'normal' });
  return lines;
}

export const choiceLetter = (i) => String.fromCharCode(65 + i);

/** "B" when the answer is a letter or matches a choice text, otherwise the answer text. */
export function answerLabel(q) {
  const ans = String(q?.answer ?? '').trim();
  if (!ans) return '';
  const m = ans.match(/^([A-Za-z])[.)]?$/);
  if (m) return m[1].toUpperCase();
  const idx = (q.choices || []).findIndex((c) => String(c).trim().toLowerCase() === ans.toLowerCase());
  return idx >= 0 ? choiceLetter(idx) : ans;
}

/** Question blocks that should appear in the end-of-document answer key. */
export function answerKeyGroups(blocks) {
  const groups = blocks.filter((b) => b.type === 'questions' && b.showAnswers && b.items.some((q) => q.answer));
  return groups.map((b, gi) => ({
    label: groups.length > 1 ? `Set ${gi + 1}` : '',
    answers: b.items.map((q, i) => ({ number: (b.start || 1) + i, answer: answerLabel(q) || '—' })),
  }));
}

/** Column widths as fractions summing to 1. */
export function widthFractions(count, widths) {
  const w = Array.isArray(widths) && widths.length === count ? widths.map((x) => Math.max(0.1, Number(x) || 1)) : Array(count).fill(1);
  const total = w.reduce((a, b) => a + b, 0);
  return w.map((x) => x / total);
}

/** Pairs of meta items per row (2 pairs per row). */
export function metaRows(meta) {
  const rows = [];
  for (let i = 0; i < meta.length; i += 2) rows.push([meta[i], meta[i + 1] || null]);
  return rows;
}

export const toUint8 = (data) => (data instanceof Uint8Array && data.constructor === Uint8Array ? data : new Uint8Array(data));

/** Lazily loads a CommonJS/ESM module and returns its default export when present. */
export const interop = (mod) => (mod && mod.default ? mod.default : mod);

const plainLen = (s) => String(s ?? '').replace(/\*\*/g, '').length;

/** 'inline' (all choices on one line), 'grid' (2 columns) or 'stack' (one per line). */
export function choiceLayout(choices = []) {
  if (!choices.length) return 'stack';
  const lens = choices.map(plainLen);
  const inlineLen = lens.reduce((a, n) => a + n + 3, 0) + 4 * (choices.length - 1);
  if (lens.every((n) => n <= 18) && inlineLen <= 90) return 'inline';
  if (lens.every((n) => n <= 40)) return 'grid';
  return 'stack';
}

/** Slip-style documents (with cut lines) get tighter question spacing. */
export const isCompactSpec = (spec) => spec.blocks.some((b) => b.type === 'cutLine');
