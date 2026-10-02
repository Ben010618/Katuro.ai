/**
 * docSpec.js — the structured document format shared by the KaTuroDesk agent,
 * the Canvas preview, and every file generator.
 *
 * The AI never writes .docx/.pptx bytes. It returns one of these JSON specs,
 * and code renders the spec into exact DepEd layouts (docx, pdf, html, pptx, xlsx).
 *
 * DocumentSpec  { kind:'document', title, subtitle?, hideTitle?, paper?, orientation?, header?, meta?, blocks[], signatures? }
 *   hideTitle:    true = title is used for the file name/Canvas only, not printed (e.g. 2-up slips)
 *   paper:        'long' (8.5x13, DepEd default) | 'a4' | 'letter'
 *   orientation:  'portrait' | 'landscape'
 *   header:       { deped: true, region?, division?, school? } | null
 *   meta:         [{ label, value }]  — info strip (Learning Area, Grade, Quarter...)
 *   blocks:
 *     { type:'heading',   text, level: 1|2|3 }
 *     { type:'paragraph', text }               — inline **bold** allowed
 *     { type:'bullets',   items: string[], ordered?: boolean }
 *     { type:'table',     columns: string[], rows: string[][], widths?: number[] }
 *     { type:'questions', items: [{ question, choices?: string[], answer? }], showAnswers?: boolean, start?: number }  — start: first item number (continue across Test I / Test II)
 *     { type:'answerLines', count }
 *     { type:'pageBreak' }
 *     { type:'cutLine' }                       — dashed "cut here" line for 2-up slips
 *   signatures:   [{ label, name?, role? }]
 *
 * SlidesSpec    { kind:'slides', title, subtitle?, slides: [{ title, bullets?: string[], notes?, layout?: 'title'|'bullets'|'twoColumn', left?: string[], right?: string[] }] }
 *
 * SheetSpec     { kind:'sheet', title, sheets: [{ name, columns: [{ header, width? }], rows: (string|number|null)[][], freezeHeader?: boolean }] }
 */

export const PAPER_SIZES = {
  long: { label: 'Long Bond (8.5" × 13")', widthIn: 8.5, heightIn: 13 },
  a4: { label: 'A4', widthIn: 8.27, heightIn: 11.69 },
  letter: { label: 'Letter (8.5" × 11")', widthIn: 8.5, heightIn: 11 },
};

const BLOCK_TYPES = new Set(['heading', 'paragraph', 'bullets', 'table', 'questions', 'answerLines', 'pageBreak', 'cutLine']);

const str = (v) => (v === null || v === undefined ? '' : String(v));

function normalizeBlock(b) {
  if (!b || typeof b !== 'object') return null;
  const type = BLOCK_TYPES.has(b.type) ? b.type : b.text ? 'paragraph' : null;
  switch (type) {
    case 'heading':
      return { type, text: str(b.text), level: [1, 2, 3].includes(Number(b.level)) ? Number(b.level) : 2 };
    case 'paragraph':
      return str(b.text).trim() ? { type, text: str(b.text) } : null;
    case 'bullets': {
      const items = (Array.isArray(b.items) ? b.items : []).map(str).filter((s) => s.trim());
      return items.length ? { type, items, ordered: Boolean(b.ordered) } : null;
    }
    case 'table': {
      const columns = (Array.isArray(b.columns) ? b.columns : []).map(str);
      const width = Math.max(columns.length, ...(Array.isArray(b.rows) ? b.rows : []).map((r) => (Array.isArray(r) ? r.length : 0)));
      if (!width) return null;
      while (columns.length < width) columns.push('');
      const rows = (Array.isArray(b.rows) ? b.rows : []).map((r) => {
        const row = (Array.isArray(r) ? r : [r]).map(str);
        while (row.length < width) row.push('');
        return row.slice(0, width);
      });
      const widths = Array.isArray(b.widths) && b.widths.length === width ? b.widths.map((w) => Math.max(0.5, Number(w) || 1)) : undefined;
      return { type, columns, rows, ...(widths ? { widths } : {}) };
    }
    case 'questions': {
      const items = (Array.isArray(b.items) ? b.items : [])
        .map((q) => (typeof q === 'string' ? { question: q } : q))
        .filter((q) => q && str(q.question).trim())
        .map((q) => ({
          question: str(q.question),
          ...(Array.isArray(q.choices) && q.choices.length ? { choices: q.choices.map(str) } : {}),
          ...(q.answer !== undefined && q.answer !== null && str(q.answer) ? { answer: str(q.answer) } : {}),
        }));
      const start = Math.max(1, Math.floor(Number(b.start) || 1));
      return items.length ? { type, items, showAnswers: Boolean(b.showAnswers), ...(start > 1 ? { start } : {}) } : null;
    }
    case 'answerLines':
      return { type, count: Math.min(30, Math.max(1, Number(b.count) || 3)) };
    case 'pageBreak':
    case 'cutLine':
      return { type };
    default:
      return null;
  }
}

/** Makes an AI-produced document spec safe to render. Never throws. */
export function normalizeDocumentSpec(raw = {}) {
  const spec = raw && typeof raw === 'object' ? raw : {};
  return {
    kind: 'document',
    title: str(spec.title) || 'KaTuro Document',
    ...(spec.subtitle ? { subtitle: str(spec.subtitle) } : {}),
    ...(spec.hideTitle ? { hideTitle: true } : {}),
    paper: PAPER_SIZES[spec.paper] ? spec.paper : 'long',
    orientation: spec.orientation === 'landscape' ? 'landscape' : 'portrait',
    header: spec.header === null ? null : { deped: true, ...(typeof spec.header === 'object' ? spec.header : {}) },
    meta: (Array.isArray(spec.meta) ? spec.meta : [])
      .filter((m) => m && str(m.label))
      .map((m) => ({ label: str(m.label), value: str(m.value) })),
    blocks: (Array.isArray(spec.blocks) ? spec.blocks : []).map(normalizeBlock).filter(Boolean),
    ...(Array.isArray(spec.signatures) && spec.signatures.length
      ? { signatures: spec.signatures.filter((s) => s && str(s.label)).map((s) => ({ label: str(s.label), name: str(s.name), role: str(s.role) })) }
      : {}),
  };
}

export function normalizeSlidesSpec(raw = {}) {
  const spec = raw && typeof raw === 'object' ? raw : {};
  const slides = (Array.isArray(spec.slides) ? spec.slides : [])
    .filter((s) => s && (s.title || (Array.isArray(s.bullets) && s.bullets.length)))
    .map((s) => ({
      title: str(s.title),
      layout: ['title', 'bullets', 'twoColumn'].includes(s.layout) ? s.layout : 'bullets',
      bullets: (Array.isArray(s.bullets) ? s.bullets : []).map(str).filter(Boolean),
      ...(Array.isArray(s.left) ? { left: s.left.map(str) } : {}),
      ...(Array.isArray(s.right) ? { right: s.right.map(str) } : {}),
      ...(s.notes ? { notes: str(s.notes) } : {}),
    }));
  return { kind: 'slides', title: str(spec.title) || 'KaTuro Slides', ...(spec.subtitle ? { subtitle: str(spec.subtitle) } : {}), slides };
}

export function normalizeSheetSpec(raw = {}) {
  const spec = raw && typeof raw === 'object' ? raw : {};
  const sheets = (Array.isArray(spec.sheets) ? spec.sheets : []).map((sh, i) => ({
    name: str(sh?.name).replace(/[\\/?*[\]:]/g, '').slice(0, 31) || `Sheet${i + 1}`,
    columns: (Array.isArray(sh?.columns) ? sh.columns : []).map((c) => (typeof c === 'string' ? { header: c } : { header: str(c?.header), ...(c?.width ? { width: Number(c.width) } : {}) })),
    rows: (Array.isArray(sh?.rows) ? sh.rows : []).map((r) => (Array.isArray(r) ? r : [r]).map((v) => (typeof v === 'number' || v === null ? v : str(v)))),
    freezeHeader: sh?.freezeHeader !== false,
  }));
  return { kind: 'sheet', title: str(spec.title) || 'KaTuro Workbook', sheets };
}

/** Splits "plain **bold** plain" into runs for renderers. */
export function parseInlineRuns(text) {
  const runs = [];
  const re = /\*\*([^*]+)\*\*/g;
  let last = 0;
  let m;
  const s = str(text);
  while ((m = re.exec(s))) {
    if (m.index > last) runs.push({ text: s.slice(last, m.index), bold: false });
    runs.push({ text: m[1], bold: true });
    last = m.index + m[0].length;
  }
  if (last < s.length) runs.push({ text: s.slice(last), bold: false });
  return runs.length ? runs : [{ text: '', bold: false }];
}

/** Plain-text rendering of a document spec (chat summaries, AI context, search). */
export function documentSpecToText(spec) {
  const s = normalizeDocumentSpec(spec);
  const out = [s.title];
  if (s.subtitle) out.push(s.subtitle);
  for (const m of s.meta) out.push(`${m.label}: ${m.value}`);
  for (const b of s.blocks) {
    if (b.type === 'heading' || b.type === 'paragraph') out.push(b.text.replace(/\*\*/g, ''));
    else if (b.type === 'bullets') b.items.forEach((it, i) => out.push(`${b.ordered ? `${i + 1}.` : '•'} ${it}`));
    else if (b.type === 'table') {
      out.push(b.columns.join(' | '));
      b.rows.forEach((r) => out.push(r.join(' | ')));
    } else if (b.type === 'questions') {
      b.items.forEach((q, i) => {
        out.push(`${i + 1}. ${q.question}`);
        (q.choices || []).forEach((c, j) => out.push(`   ${String.fromCharCode(65 + j)}. ${c}`));
      });
    }
  }
  return out.join('\n');
}

/**
 * Converts loose markdown (old AI replies, offline fallback) into a document spec,
 * so even unstructured text exports as a proper .docx instead of raw "###".
 */
export function markdownToDocumentSpec(markdown, { title } = {}) {
  const lines = str(markdown).replace(/\r/g, '').split('\n');
  const blocks = [];
  let bullets = null;
  let table = null;

  const flush = () => {
    if (bullets) blocks.push(bullets);
    if (table) blocks.push(table);
    bullets = null;
    table = null;
  };

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) {
      flush();
      continue;
    }
    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      flush();
      blocks.push({ type: 'heading', level: Math.min(3, heading[1].length), text: heading[2].replace(/\*\*/g, '') });
      continue;
    }
    if (/^\|.*\|$/.test(line)) {
      const cells = line.slice(1, -1).split('|').map((c) => c.trim().replace(/\*\*/g, ''));
      if (cells.every((c) => /^:?-{2,}:?$/.test(c))) continue;
      if (bullets) {
        blocks.push(bullets);
        bullets = null;
      }
      if (!table) table = { type: 'table', columns: cells, rows: [] };
      else table.rows.push(cells);
      continue;
    }
    const bullet = line.match(/^([-*•]|\d+[.)])\s+(.*)$/);
    if (bullet) {
      if (table) {
        blocks.push(table);
        table = null;
      }
      const ordered = /\d/.test(bullet[1]);
      if (!bullets || bullets.ordered !== ordered) {
        if (bullets) blocks.push(bullets);
        bullets = { type: 'bullets', ordered, items: [] };
      }
      bullets.items.push(bullet[2]);
      continue;
    }
    flush();
    blocks.push({ type: 'paragraph', text: line });
  }
  flush();

  let docTitle = title;
  if (!docTitle && blocks[0]?.type === 'heading') docTitle = blocks.shift().text;
  if (!docTitle && blocks[0]?.type === 'paragraph' && blocks[0].text.length < 90 && blocks[0].text === blocks[0].text.toUpperCase()) {
    docTitle = blocks.shift().text;
  }
  return normalizeDocumentSpec({ title: docTitle || 'KaTuro Document', blocks });
}
