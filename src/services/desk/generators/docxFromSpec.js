/**
 * docxFromSpec.js — renders a DocumentSpec into a DepEd-styled .docx (Uint8Array).
 */

import { normalizeDocumentSpec, parseInlineRuns } from '../docSpec.js';
import { MARGIN_IN, portraitInches, headerLines, choiceLetter, choiceLayout, isCompactSpec, answerKeyGroups, widthFractions, metaRows, toUint8 } from './shared.js';

const FONT = 'Arial';
const BODY = 22; // half-points (11pt)
const SMALL = 20; // 10pt (tables)
const TWIP = 1440;

export async function buildDocx(rawSpec) {
  const spec = normalizeDocumentSpec(rawSpec);
  const d = await import('docx');
  const {
    Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, AlignmentType,
    BorderStyle, ShadingType, PageOrientation, LevelFormat, TableLayoutType,
  } = d;

  const page = portraitInches(spec.paper);
  const landscape = spec.orientation === 'landscape';
  const contentW = Math.round(((landscape ? page.height : page.width) - MARGIN_IN.left - MARGIN_IN.right) * TWIP);

  const thin = { style: BorderStyle.SINGLE, size: 4, color: '000000' };
  const none = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
  const allThin = { top: thin, bottom: thin, left: thin, right: thin };
  const allNone = { top: none, bottom: none, left: none, right: none, insideHorizontal: none, insideVertical: none };
  const shade = { type: ShadingType.CLEAR, color: 'auto', fill: 'E7E6E6' };

  const run = (text, o = {}) => new TextRun({ text: String(text ?? ''), font: FONT, size: o.size || BODY, bold: o.bold, italics: o.italic, color: o.color });
  const inlineRuns = (text, o = {}) => parseInlineRuns(text).map((r) => run(r.text, { ...o, bold: o.bold || r.bold }));
  const para = (children, o = {}) => new Paragraph({
    children: Array.isArray(children) ? children : [run(children, o)],
    alignment: o.align,
    spacing: { after: o.after ?? 80, before: o.before ?? 0 },
    indent: o.indent ? { left: o.indent } : undefined,
    keepNext: o.keepNext,
    border: o.border,
    numbering: o.numbering,
  });

  const cell = (children, o = {}) => new TableCell({
    children: Array.isArray(children) ? children : [para([run(children, { size: o.size || SMALL, bold: o.bold })], { after: 0 })],
    width: { size: o.width, type: WidthType.DXA },
    shading: o.shade ? shade : undefined,
    borders: o.borders || allThin,
    margins: { top: 40, bottom: 40, left: 80, right: 80 },
    columnSpan: o.span,
  });

  const children = [];

  // DepEd letterhead
  const lines = headerLines(spec.header);
  lines.forEach((l, i) => {
    const size = l.size === 'large' ? 28 : l.size === 'normal' ? BODY : SMALL;
    children.push(para([run(l.text, { bold: l.bold, size })], {
      align: AlignmentType.CENTER,
      after: i === lines.length - 1 ? 160 : 0,
      border: i === lines.length - 1 ? { bottom: { style: BorderStyle.SINGLE, size: 6, color: '000000', space: 4 } } : undefined,
    }));
  });

  if (!spec.hideTitle) {
    children.push(para([run(spec.title, { bold: true, size: 28 })], { align: AlignmentType.CENTER, after: spec.subtitle ? 40 : 160 }));
    if (spec.subtitle) children.push(para([run(spec.subtitle, { italic: true })], { align: AlignmentType.CENTER, after: 160 }));
  }

  if (spec.meta.length) {
    const lw = Math.round(contentW * 0.18);
    const vw = Math.round(contentW * 0.32);
    const widths = [lw, vw, lw, contentW - 2 * lw - vw];
    children.push(new Table({
      width: { size: contentW, type: WidthType.DXA },
      columnWidths: widths,
      layout: TableLayoutType.FIXED,
      rows: metaRows(spec.meta).map(([a, b]) => new TableRow({
        children: [
          cell(a.label, { bold: true, shade: true, width: widths[0] }),
          cell(a.value, { width: widths[1] }),
          cell(b ? b.label : '', { bold: true, shade: Boolean(b), width: widths[2] }),
          cell(b ? b.value : '', { width: widths[3] }),
        ],
      })),
    }));
    children.push(para('', { after: 120 }));
  }

  const compact = isCompactSpec(spec);
  let orderedInstance = 0;
  for (const b of spec.blocks) {
    switch (b.type) {
      case 'heading': {
        const size = b.level === 1 ? 26 : b.level === 2 ? 24 : BODY;
        children.push(para([run(b.text, { bold: true, size })], { before: b.level === 1 ? 200 : 140, after: 80, keepNext: true }));
        break;
      }
      case 'paragraph':
        children.push(para(inlineRuns(b.text), { after: 120 }));
        break;
      case 'bullets': {
        orderedInstance += 1;
        for (const item of b.items) {
          children.push(para(inlineRuns(item), {
            after: 40,
            numbering: b.ordered ? { reference: 'ks-ordered', level: 0, instance: orderedInstance } : { reference: 'ks-bullets', level: 0 },
          }));
        }
        children.push(para('', { after: 40 }));
        break;
      }
      case 'table': {
        const fr = widthFractions(b.columns.length, b.widths);
        const widths = fr.map((f) => Math.round(f * contentW));
        const hasHeader = b.columns.some((c) => c.trim());
        const rows = [];
        if (hasHeader) {
          rows.push(new TableRow({
            tableHeader: true,
            cantSplit: true,
            children: b.columns.map((c, i) => cell([para(inlineRuns(c, { size: SMALL, bold: true }), { after: 0, align: AlignmentType.CENTER })], { shade: true, width: widths[i] })),
          }));
        }
        for (const r of b.rows) {
          rows.push(new TableRow({
            cantSplit: true,
            children: r.map((v, i) => cell([para(inlineRuns(v, { size: SMALL }), { after: 0 })], { width: widths[i] })),
          }));
        }
        if (!rows.length) break;
        children.push(new Table({ width: { size: contentW, type: WidthType.DXA }, columnWidths: widths, layout: TableLayoutType.FIXED, rows }));
        children.push(para('', { after: 120 }));
        break;
      }
      case 'questions':
        b.items.forEach((q, i) => {
          const gap = compact ? 40 : 100;
          children.push(para([run(`${(b.start || 1) + i}. `), ...inlineRuns(q.question)], { after: q.choices ? 0 : gap, keepNext: Boolean(q.choices), indent: 0 }));
          if (!q.choices) return;
          const layout = choiceLayout(q.choices);
          if (layout === 'inline') {
            const runs = [];
            q.choices.forEach((c, j) => {
              if (j) runs.push(run('      '));
              runs.push(run(`${choiceLetter(j)}. `), ...inlineRuns(c));
            });
            children.push(para(runs, { indent: 360, after: gap }));
          } else if (layout === 'grid') {
            const indent = 360;
            const colW = Math.round((contentW - indent) / 2);
            const rows = [];
            for (let j = 0; j < q.choices.length; j += 2) {
              rows.push(new TableRow({
                cantSplit: true,
                children: [j, j + 1].map((k) => cell(q.choices[k] === undefined ? [para('', { after: 0 })] : [para([run(`${choiceLetter(k)}. `), ...inlineRuns(q.choices[k])], { after: 0 })], { width: colW, borders: allNone })),
              }));
            }
            children.push(new Table({ width: { size: colW * 2, type: WidthType.DXA }, columnWidths: [colW, colW], borders: allNone, indent: { size: indent, type: WidthType.DXA }, rows }));
            children.push(para('', { after: 0, size: 8 }));
          } else {
            q.choices.forEach((c, j) => {
              const last = j === q.choices.length - 1;
              children.push(para([run(`${choiceLetter(j)}. `), ...inlineRuns(c)], { indent: 540, after: last ? gap : 0, keepNext: !last }));
            });
          }
        });
        break;
      case 'answerLines':
        for (let i = 0; i < b.count; i++) {
          children.push(para('', { after: 0, before: 240, border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: '000000', space: 1 } } }));
        }
        children.push(para('', { after: 80 }));
        break;
      case 'pageBreak':
        children.push(new Paragraph({ pageBreakBefore: true, children: [] }));
        break;
      case 'cutLine':
        children.push(para([run('✂ cut here', { size: 16, color: '666666' })], {
          align: AlignmentType.CENTER,
          before: 200,
          after: 200,
          border: { top: { style: BorderStyle.DASHED, size: 6, color: '666666', space: 4 } },
        }));
        break;
      default:
        break;
    }
  }

  if (spec.signatures?.length) {
    children.push(para('', { after: 240 }));
    const perRow = Math.min(3, spec.signatures.length);
    const w = Math.round(contentW / perRow);
    const rows = [];
    for (let i = 0; i < spec.signatures.length; i += perRow) {
      const group = spec.signatures.slice(i, i + perRow);
      while (group.length < perRow) group.push(null);
      rows.push(new TableRow({
        cantSplit: true,
        children: group.map((s) => cell(s ? [
          para([run(s.label)], { after: 360 }),
          para([run(s.name ? s.name.toUpperCase() : ' ', { bold: true })], {
            align: AlignmentType.CENTER,
            after: 0,
            border: { top: { style: BorderStyle.SINGLE, size: 4, color: '000000', space: 2 } },
          }),
          para([run(s.role || '', { size: SMALL, italic: true })], { align: AlignmentType.CENTER, after: 240 }),
        ] : [para('')], { width: w, borders: allNone })),
      }));
    }
    children.push(new Table({ width: { size: contentW, type: WidthType.DXA }, columnWidths: Array(perRow).fill(w), borders: allNone, rows }));
  }

  const keys = answerKeyGroups(spec.blocks);
  if (keys.length) {
    children.push(new Paragraph({ pageBreakBefore: true, children: [run('Answer Key', { bold: true, size: 28 })], alignment: AlignmentType.CENTER, spacing: { after: 160 } }));
    for (const g of keys) {
      if (g.label) children.push(para([run(g.label, { bold: true })], { before: 120 }));
      for (const a of g.answers) children.push(para(`${a.number}. ${a.answer}`, { after: 20 }));
    }
  }

  const doc = new Document({
    creator: 'KaTuroDesk',
    title: spec.title,
    styles: { default: { document: { run: { font: FONT, size: BODY } } } },
    numbering: {
      config: [
        { reference: 'ks-bullets', levels: [{ level: 0, format: LevelFormat.BULLET, text: '•', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 540, hanging: 270 } } } }] },
        { reference: 'ks-ordered', levels: [{ level: 0, format: LevelFormat.DECIMAL, text: '%1.', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 540, hanging: 360 } } } }] },
      ],
    },
    sections: [{
      properties: {
        page: {
          size: {
            width: Math.round(page.width * TWIP),
            height: Math.round(page.height * TWIP),
            orientation: landscape ? PageOrientation.LANDSCAPE : PageOrientation.PORTRAIT,
          },
          margin: {
            top: MARGIN_IN.top * TWIP,
            bottom: MARGIN_IN.bottom * TWIP,
            left: Math.round(MARGIN_IN.left * TWIP),
            right: Math.round(MARGIN_IN.right * TWIP),
          },
        },
      },
      children,
    }],
  });

  return toUint8(await Packer.toArrayBuffer(doc));
}
