// kaTuro Test Builder — DOCX export: three separate downloads (test questions,
// answer key, TOS) instead of one bundled file. A4 portrait, narrow margins —
// mirrors src/services/gamificationDocx.js's layout (the current, non-buggy
// A4 portrait reference; avoids the ILAW/DLL landscape width/height-swap quirk).
//
// Matching Type uses a random shuffle for its Column B — buildTestPaperParts()
// must be called ONCE and its result reused for both the Test Questions and
// Answer Key downloads, or the two documents' letters would disagree.

import {
  Document, Packer, Paragraph, TextRun, AlignmentType,
  Table, TableRow, TableCell, WidthType, BorderStyle,
} from 'docx';
import { COGNITIVE_LEVELS, testTypeLabel } from '../config/testBuilderConfig';
import { gShuffle } from '../components/GameWorksheet';

// ── Layout constants — A4 portrait, narrow margins (12.7mm / 0.5 in) ─────────
const DXA    = (v) => Math.round(v * 56.7);
const A4_W   = DXA(210);
const A4_H   = DXA(297);
const MARGIN = DXA(12.7);
const PAGE_W = DXA(184.6);

// ── Primitive helpers ─────────────────────────────────────────────────────────
function run(text, { bold = false, italic = false, size = 22, color } = {}) {
  return new TextRun({ text: String(text ?? ''), bold, italics: italic, size, font: 'Arial', color });
}
function para(children, opts = {}) {
  return new Paragraph({ children: Array.isArray(children) ? children : [run(children)], ...opts });
}
function centered(children, opts = {}) {
  return para(children, { alignment: AlignmentType.CENTER, ...opts });
}

const BNone = { style: BorderStyle.NIL, size: 0, color: 'FFFFFF' };
const BThin = { style: BorderStyle.SINGLE, size: 4, color: '999999' };
const BMed  = { style: BorderStyle.SINGLE, size: 10, color: '000000' };
const BNoneAll = { top: BNone, bottom: BNone, left: BNone, right: BNone };

const pageProps = {
  page: {
    size:   { width: A4_W, height: A4_H },
    margin: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN },
  },
};

// ── Page header ───────────────────────────────────────────────────────────────
function makeHeader(profile, meta, docLabel) {
  const out = [];
  if (profile?.school) out.push(centered([run(profile.school, { bold: true, size: 26 })]));
  const nameDesig = [profile?.name, profile?.designation].filter(Boolean).join(' · ');
  if (nameDesig) out.push(centered([run(nameDesig, { size: 20 })]));

  const title = `${meta.subject || 'Test'} — ${meta.testTypeLabel}`.toUpperCase() + (docLabel ? ` (${docLabel})` : '');
  out.push(centered([run(title, { bold: true, size: 28 })], { spacing: { before: 80, after: 40 } }));

  const sub = [meta.gradeLevel, meta.terms].filter(Boolean).join(' | ');
  if (sub) out.push(centered([run(sub, { size: 20 })], { spacing: { after: 80 } }));

  if (docLabel === 'TEST QUESTIONS' || !docLabel) {
    out.push(para(
      [run('Name: _______________________________   Section: _______________   Date: _______________   Score: ______', { size: 20 })],
      { spacing: { before: 120, after: 120 } },
    ));
  }
  out.push(para([], { spacing: { before: 60, after: 220 }, border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: '000000' } } }));
  return out;
}

// ── TOS table (mirrors StepTOS.jsx's shape) ───────────────────────────────────
function tosTable(tos, itemCeiling) {
  const labelW = Math.floor(PAGE_W * 0.4);
  const cellW  = Math.floor((PAGE_W - labelW) / 7);
  const headers = ['Competency', ...COGNITIVE_LEVELS.map((l) => l.short), 'Total'];

  function headerCell(text, i) {
    return new TableCell({
      children: [i === 0 ? para([run(text, { bold: true, size: 20, color: 'FFFFFF' })]) : centered([run(text, { bold: true, size: 20, color: 'FFFFFF' })])],
      width: { size: i === 0 ? labelW : cellW, type: WidthType.DXA },
      borders: { ...BNoneAll, bottom: BMed },
      shading: { fill: '1A3D2B' },
      margins: { left: DXA(2), right: DXA(2), top: DXA(1), bottom: DXA(1) },
    });
  }
  function dataCell(text, i, bold = false) {
    return new TableCell({
      children: [i === 0 ? para([run(text, { size: 20 })]) : centered([run(String(text), { size: 20, bold })])],
      width: { size: i === 0 ? labelW : cellW, type: WidthType.DXA },
      borders: { top: BThin, bottom: BThin, left: BThin, right: BThin },
      margins: { left: DXA(2), right: DXA(2), top: DXA(1), bottom: DXA(1) },
    });
  }

  const rows = [new TableRow({ children: headers.map((h, i) => headerCell(h, i)) })];
  tos.rows.forEach((r) => {
    rows.push(new TableRow({ children: [r.label || 'Untitled competency', ...r.cells, r.total].map((v, i) => dataCell(v, i)) }));
  });
  const grandTotal = tos.columnTotals.reduce((a, b) => a + b, 0);
  rows.push(new TableRow({ children: ['TOTAL', ...tos.columnTotals, grandTotal].map((v, i) => dataCell(v, i, true)) }));

  return [
    new Table({ width: { size: PAGE_W, type: WidthType.DXA }, rows }),
    para([run(`Total items: ${grandTotal} of ${itemCeiling}`, { italic: true, size: 18 })], { spacing: { before: 60, after: 220 } }),
  ];
}

// ── Per-format directions ─────────────────────────────────────────────────────
const DIRECTIONS = {
  'Multiple Choice': 'Read each question carefully and write the letter of the correct answer.',
  'True or False':   'Write TRUE if the statement is correct and FALSE if it is not.',
  'Matching Type':   'Match Column A with Column B. Write the letter of the correct answer on the blank.',
  'Identification':  'Identify what is being described or asked in each item.',
  'Enumeration':      'List/enumerate what is being asked in each item.',
  'Essay':            'Answer the following completely and clearly.',
};
const FORMAT_ORDER = ['Multiple Choice', 'True or False', 'Matching Type', 'Identification', 'Enumeration', 'Essay'];
const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI'];

function partHeading(romanNum, format) {
  return [
    para([run(`PART ${romanNum}. ${format.toUpperCase()}`, { bold: true, size: 24 })], { spacing: { before: 220, after: 40 } }),
    para([run(`Directions: ${DIRECTIONS[format] || ''}`, { italic: true, size: 20 })], { spacing: { after: 140 } }),
  ];
}

function mcBlock(items, startNum) {
  const out = [];
  items.forEach((it, i) => {
    out.push(para([run(`${startNum + i}.  ${it.question}`, { size: 22 })], { spacing: { before: 120, after: 50 } }));
    const choices = it.choices || {};
    const choiceText = ['A', 'B', 'C', 'D'].map((k) => `${k}. ${choices[k] || ''}`).join('     ');
    out.push(para([run(choiceText, { size: 20, color: '374151' })], { spacing: { after: 40 } }));
  });
  return out;
}

function tfBlock(items, startNum) {
  return items.map((it, i) => para(
    [run(`${startNum + i}. _______________  `, { size: 22 }), run(it.question, { size: 22 })],
    { spacing: { after: 140 } },
  ));
}

function freeTextBlock(items, startNum, format) {
  const gap = format === 'Essay' ? 280 : 160;
  return items.map((it, i) => para([run(`${startNum + i}.  ${it.question}`, { size: 22 })], { spacing: { before: 120, after: gap } }));
}

// Combines every "Matching Type" item across the whole test into one block —
// Column A keeps the running item numbers, Column B is shuffled ONCE here.
function matchingBlock(items, startNum) {
  const half = Math.floor(PAGE_W / 2);
  const tagged = items.map((it, i) => ({ ...it, __idx: i }));
  const shuffled = gShuffle(tagged);

  const rows = [
    new TableRow({ children: [
      new TableCell({ children: [para([run('Column A', { bold: true, size: 22 })])], width: { size: half, type: WidthType.DXA }, borders: { ...BNoneAll, bottom: BMed, right: BThin } }),
      new TableCell({ children: [para([run('Column B', { bold: true, size: 22 })])], width: { size: half, type: WidthType.DXA }, borders: { ...BNoneAll, bottom: BMed, left: BThin } }),
    ] }),
    ...tagged.map((it, i) => new TableRow({ children: [
      new TableCell({
        children: [para([run(`___ ${startNum + i}.  ${it.question}`, { size: 22 })], { spacing: { before: DXA(1.5), after: DXA(1.5) } })],
        width: { size: half, type: WidthType.DXA }, borders: { ...BNoneAll, bottom: BThin, right: BThin }, margins: { left: DXA(3), right: DXA(3) },
      }),
      new TableCell({
        children: [para([run(`${String.fromCharCode(65 + i)}.  ${shuffled[i].matchDefinition || ''}`, { size: 22 })], { spacing: { before: DXA(1.5), after: DXA(1.5) } })],
        width: { size: half, type: WidthType.DXA }, borders: { ...BNoneAll, bottom: BThin, left: BThin }, margins: { left: DXA(3), right: DXA(3) },
      }),
    ] })),
  ];

  const answers = tagged.map((it, i) => {
    const j = shuffled.findIndex((s) => s.__idx === it.__idx);
    return `${startNum + i}. ${j >= 0 ? String.fromCharCode(65 + j) : '?'}`;
  });

  return { block: [new Table({ width: { size: PAGE_W, type: WidthType.DXA }, rows })], answers };
}

// ── Answer key grid (5 per row) — short answers only ──────────────────────────
function answerGrid(answers) {
  const COLS = 5;
  const colW = Math.floor(PAGE_W / COLS);
  const rows = [];
  for (let r = 0; r < Math.ceil(answers.length / COLS); r++) {
    const cells = Array.from({ length: COLS }, (_, c) => {
      const i = r * COLS + c;
      return new TableCell({
        children: [para([run(i < answers.length ? answers[i] : '', { size: 22 })])],
        width: { size: colW, type: WidthType.DXA },
        borders: BNoneAll,
        margins: { left: DXA(3), right: DXA(3) },
      });
    });
    rows.push(new TableRow({ children: cells }));
  }
  return new Table({ width: { size: PAGE_W, type: WidthType.DXA }, rows });
}

/**
 * Groups/numbers a flat items array (each already tagged with `format` by
 * buildItemSlots) into the test-proper blocks and the matching answer-key
 * blocks. Call this ONCE per generation and reuse the result for both
 * downloads — matchingBlock() shuffles randomly, so calling this twice would
 * make the Answer Key's letters disagree with the Test Questions document.
 */
export function buildTestPaperParts(items) {
  const byFormat = FORMAT_ORDER
    .map((fmt) => ({ format: fmt, items: items.filter((it) => it.format === fmt) }))
    .filter((g) => g.items.length > 0);

  const testBlocks = [];
  const shortAnswers = [];   // MC / True or False / Matching Type
  const longAnswers   = [];  // Identification / Enumeration / Essay
  let num = 1;

  byFormat.forEach((group, gi) => {
    testBlocks.push(...partHeading(ROMAN[gi] || String(gi + 1), group.format));

    if (group.format === 'Multiple Choice') {
      testBlocks.push(...mcBlock(group.items, num));
      group.items.forEach((it, i) => shortAnswers.push(`${num + i}. ${it.answer}`));
      num += group.items.length;
    } else if (group.format === 'True or False') {
      testBlocks.push(...tfBlock(group.items, num));
      group.items.forEach((it, i) => shortAnswers.push(`${num + i}. ${String(it.answer).toUpperCase()}`));
      num += group.items.length;
    } else if (group.format === 'Matching Type') {
      const { block, answers } = matchingBlock(group.items, num);
      testBlocks.push(...block);
      shortAnswers.push(...answers);
      num += group.items.length;
    } else {
      testBlocks.push(...freeTextBlock(group.items, num, group.format));
      group.items.forEach((it, i) => longAnswers.push(`${num + i}. ${it.answer}`));
      num += group.items.length;
    }
  });

  const keyBlocks = [];
  if (shortAnswers.length) {
    keyBlocks.push(para([run('Answer Key', { bold: true, size: 22 })], { spacing: { after: 120 } }));
    keyBlocks.push(answerGrid(shortAnswers));
  }
  if (longAnswers.length) {
    keyBlocks.push(para([run('Suggested Answers', { bold: true, size: 22 })], { spacing: { before: 220, after: 100 } }));
    longAnswers.forEach((a) => keyBlocks.push(para([run(a, { size: 20 })], { spacing: { after: 80 } })));
  }

  return { testBlocks, keyBlocks };
}

function download(doc, filename) {
  return Packer.toBlob(doc).then((blob) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  });
}

function slugify(meta) {
  return [meta.subject, meta.gradeLevel, meta.testType].filter(Boolean).join('_').replace(/[^a-zA-Z0-9_]/g, '_') || 'test';
}

// ── Public API — three independent downloads ──────────────────────────────────

export async function downloadTestQuestionsDocx({ testBlocks, meta, profile }) {
  const fullMeta = { ...meta, testTypeLabel: testTypeLabel(meta.testType) };
  const doc = new Document({
    sections: [{ properties: pageProps, children: [...makeHeader(profile, fullMeta, 'TEST QUESTIONS'), ...testBlocks] }],
  });
  await download(doc, `${slugify(meta)}_TestQuestions.docx`);
}

export async function downloadAnswerKeyDocx({ keyBlocks, meta, profile }) {
  const fullMeta = { ...meta, testTypeLabel: testTypeLabel(meta.testType) };
  const doc = new Document({
    sections: [{ properties: pageProps, children: [...makeHeader(profile, fullMeta, 'ANSWER KEY'), ...keyBlocks] }],
  });
  await download(doc, `${slugify(meta)}_AnswerKey.docx`);
}

export async function downloadTosDocx({ tos, itemCeiling, meta, profile }) {
  const fullMeta = { ...meta, testTypeLabel: testTypeLabel(meta.testType) };
  const doc = new Document({
    sections: [{ properties: pageProps, children: [...makeHeader(profile, fullMeta, 'TABLE OF SPECIFICATIONS'), ...tosTable(tos, itemCeiling)] }],
  });
  await download(doc, `${slugify(meta)}_TOS.docx`);
}
