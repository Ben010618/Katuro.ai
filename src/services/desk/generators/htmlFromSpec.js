/**
 * htmlFromSpec.js — renders a DocumentSpec into a self-contained HTML page that mirrors
 * the .docx layout. Used by the Canvas preview iframe and Electron's printToPDF.
 */

import { normalizeDocumentSpec, parseInlineRuns } from '../docSpec.js';
import { MARGIN_IN, pageInches, headerLines, choiceLetter, choiceLayout, isCompactSpec, answerKeyGroups, widthFractions, metaRows } from './shared.js';

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);
}

const inline = (text) => parseInlineRuns(text).map((r) => (r.bold ? `<strong>${escapeHtml(r.text)}</strong>` : escapeHtml(r.text))).join('');

function renderBlock(b) {
  switch (b.type) {
    case 'heading':
      return `<h${b.level + 1} class="h${b.level}">${escapeHtml(b.text)}</h${b.level + 1}>`;
    case 'paragraph':
      return `<p>${inline(b.text)}</p>`;
    case 'bullets': {
      const tag = b.ordered ? 'ol' : 'ul';
      return `<${tag}>${b.items.map((i) => `<li>${inline(i)}</li>`).join('')}</${tag}>`;
    }
    case 'table': {
      const fr = widthFractions(b.columns.length, b.widths);
      const cols = `<colgroup>${fr.map((f) => `<col style="width:${(f * 100).toFixed(2)}%">`).join('')}</colgroup>`;
      const head = b.columns.some((c) => c.trim()) ? `<thead><tr>${b.columns.map((c) => `<th>${inline(c)}</th>`).join('')}</tr></thead>` : '';
      const body = `<tbody>${b.rows.map((r) => `<tr>${r.map((v) => `<td>${inline(v)}</td>`).join('')}</tr>`).join('')}</tbody>`;
      return `<table class="data">${cols}${head}${body}</table>`;
    }
    case 'questions':
      return `<ol class="questions"${b.start > 1 ? ` start="${b.start}"` : ''}>${b.items.map((q) => {
        const choices = q.choices ? `<div class="choices ${choiceLayout(q.choices)}">${q.choices.map((c, j) => `<div>${choiceLetter(j)}. ${inline(c)}</div>`).join('')}</div>` : '';
        return `<li><div class="q">${inline(q.question)}</div>${choices}</li>`;
      }).join('')}</ol>`;
    case 'answerLines':
      return `<div class="answer-lines">${'<div class="line"></div>'.repeat(b.count)}</div>`;
    case 'pageBreak':
      return '<div class="page-break"></div>';
    case 'cutLine':
      return '<div class="cut-line"><span>&#9986; cut here</span></div>';
    default:
      return '';
  }
}

/** Body markup only (no <html>/<head>), for embedding. */
export function specToHtmlBody(rawSpec) {
  const spec = normalizeDocumentSpec(rawSpec);
  const out = [];
  const lines = headerLines(spec.header);
  if (lines.length) {
    out.push(`<header class="deped-header">${lines.map((l) => `<div class="hl-${l.size}${l.bold ? ' b' : ''}">${escapeHtml(l.text)}</div>`).join('')}</header>`);
  }
  if (!spec.hideTitle) {
    out.push(`<h1 class="doc-title">${escapeHtml(spec.title)}</h1>`);
    if (spec.subtitle) out.push(`<div class="doc-subtitle">${escapeHtml(spec.subtitle)}</div>`);
  }
  if (spec.meta.length) {
    out.push(`<table class="meta"><colgroup><col style="width:18%"><col style="width:32%"><col style="width:18%"><col style="width:32%"></colgroup><tbody>${metaRows(spec.meta).map(([a, b]) =>
      `<tr><th>${escapeHtml(a.label)}</th><td>${escapeHtml(a.value)}</td>${b ? `<th>${escapeHtml(b.label)}</th><td>${escapeHtml(b.value)}</td>` : '<td></td><td></td>'}</tr>`).join('')}</tbody></table>`);
  }
  for (const b of spec.blocks) out.push(renderBlock(b));
  if (spec.signatures?.length) {
    out.push(`<div class="signatures">${spec.signatures.map((s) => `<div class="sig"><div class="sig-label">${escapeHtml(s.label)}</div><div class="sig-name">${escapeHtml(s.name ? s.name.toUpperCase() : ' ')}</div><div class="sig-role">${escapeHtml(s.role)}</div></div>`).join('')}</div>`);
  }
  const keys = answerKeyGroups(spec.blocks);
  if (keys.length) {
    out.push('<section class="answer-key"><h2 class="h1">Answer Key</h2>');
    for (const g of keys) {
      if (g.label) out.push(`<h4 class="h3">${escapeHtml(g.label)}</h4>`);
      out.push(`<ol class="key"${g.answers[0]?.number > 1 ? ` start="${g.answers[0].number}"` : ''}>${g.answers.map((a) => `<li>${escapeHtml(a.answer)}</li>`).join('')}</ol>`);
    }
    out.push('</section>');
  }
  return out.join('\n');
}

function pageCss(spec) {
  const p = pageInches(spec);
  return `@page { size: ${p.width}in ${p.height}in; margin: ${MARGIN_IN.top}in ${MARGIN_IN.right}in ${MARGIN_IN.bottom}in ${MARGIN_IN.left}in; }`;
}

const CSS = `
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; background: #fff; color: #000; }
body { font-family: Arial, Calibri, Helvetica, sans-serif; font-size: 11pt; line-height: 1.35; }
.sheet { margin: 0 auto; }
.deped-header { text-align: center; border-bottom: 1.5px solid #000; padding-bottom: 6px; margin-bottom: 10px; }
.deped-header .hl-small { font-size: 10pt; }
.deped-header .hl-large { font-size: 14pt; }
.deped-header .hl-normal { font-size: 11pt; }
.deped-header .b { font-weight: bold; }
.doc-title { font-size: 14pt; font-weight: bold; text-align: center; margin: 6px 0 4px; }
.doc-subtitle { text-align: center; font-style: italic; margin-bottom: 10px; }
h2.h1 { font-size: 13pt; margin: 14px 0 6px; }
h3.h2 { font-size: 12pt; margin: 12px 0 5px; }
h4.h3 { font-size: 11pt; margin: 10px 0 4px; }
h2, h3, h4 { page-break-after: avoid; break-after: avoid; }
p { margin: 0 0 8px; }
ul, ol { margin: 0 0 8px; padding-left: 28px; }
li { margin-bottom: 2px; }
table { border-collapse: collapse; width: 100%; table-layout: fixed; margin: 4px 0 10px; }
th, td { border: 1px solid #000; padding: 3px 6px; font-size: 10pt; vertical-align: top; word-wrap: break-word; }
th { background: #e7e6e6; font-weight: bold; }
table.data th { text-align: center; }
thead { display: table-header-group; }
tr { page-break-inside: avoid; break-inside: avoid; }
table.meta th { text-align: left; }
ol.questions { padding-left: 26px; }
ol.questions > li { margin-bottom: 8px; page-break-inside: avoid; break-inside: avoid; }
.choices { padding-left: 14px; }
.choices.inline { display: flex; flex-wrap: wrap; column-gap: 28px; }
.choices.grid { display: grid; grid-template-columns: 1fr 1fr; column-gap: 16px; }
.compact ol.questions > li { margin-bottom: 4px; }
.compact p { margin-bottom: 4px; }
.compact h3.h2 { margin: 6px 0 3px; }
.answer-lines .line { border-bottom: 1px solid #000; height: 22px; }
.answer-lines { margin-bottom: 8px; }
.page-break { page-break-before: always; break-before: page; height: 0; }
.cut-line { border-top: 1.5px dashed #666; margin: 14px 0; text-align: center; line-height: 1; }
.cut-line span { display: inline-block; font-size: 8pt; color: #666; padding: 2px 6px; }
.signatures { display: flex; flex-wrap: wrap; gap: 24px; margin-top: 24px; page-break-inside: avoid; break-inside: avoid; }
.sig { flex: 1 1 28%; min-width: 180px; }
.sig-label { margin-bottom: 30px; }
.sig-name { border-top: 1px solid #000; text-align: center; font-weight: bold; padding-top: 2px; }
.sig-role { text-align: center; font-style: italic; font-size: 10pt; }
.answer-key { page-break-before: always; break-before: page; }
.answer-key h2 { text-align: center; }
`;

const SCREEN_CSS = `
@media screen {
  html { background: #e9ecef; }
  body { padding: 16px 0; background: #e9ecef; }
  .sheet { background: #fff; box-shadow: 0 1px 4px rgba(0,0,0,.2); }
}
`;

/** Complete HTML document string. */
export function buildHtml(rawSpec, { forPrint = false } = {}) {
  const spec = normalizeDocumentSpec(rawSpec);
  const p = pageInches(spec);
  const sheetCss = forPrint
    ? ''
    : `${SCREEN_CSS}@media screen { .sheet { width: ${p.width}in; min-height: ${p.height}in; padding: ${MARGIN_IN.top}in ${MARGIN_IN.right}in ${MARGIN_IN.bottom}in ${MARGIN_IN.left}in; max-width: 100%; } }`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(spec.title)}</title>
<style>
${pageCss(spec)}
${CSS}
${sheetCss}
</style>
</head>
<body>
<div class="sheet${isCompactSpec(spec) ? ' compact' : ''}">
${specToHtmlBody(spec)}
</div>
</body>
</html>`;
}
