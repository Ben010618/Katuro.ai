// Generates the Child Protection Case Report as a real, editable Word
// document (not a rasterized image) — same `docx` package + A4/DXA page
// geometry + label-column table grid already established by
// src/services/cotDocx.js elsewhere in this app, so the export reads like
// the rest of the school's official paperwork.
import {
  Document, Packer, Table, TableRow, TableCell,
  Paragraph, TextRun, AlignmentType, WidthType, BorderStyle, ShadingType,
} from 'docx';
import { CASE_STATE_LABELS } from '../types';

// A4: 210mm × 297mm → 11906 × 16838 DXA. Narrow margin 0.5in = 720 DXA all sides.
const PAGE_W = 10466; // usable width (11906 - 1440)
const L_COL = 2600;
const R_COL = PAGE_W - L_COL;
const CM = { top: 60, bottom: 60, left: 80, right: 80 };
const NO_BORDER = { style: BorderStyle.NONE, size: 0, color: 'auto' };

function r(text, opts = {}) {
  return new TextRun({
    text: String(text ?? ''), bold: opts.bold || false, italics: opts.italic || false,
    size: opts.size || 16, font: 'Arial', color: opts.color || undefined,
  });
}
function p(children, opts = {}) {
  return new Paragraph({
    children: Array.isArray(children) ? children : [children],
    alignment: opts.align || AlignmentType.LEFT,
    spacing: opts.spacing || { before: 0, after: 40 },
  });
}
function pBold(text, size = 16) { return p([r(text, { bold: true, size })]); }
function pText(text, size = 16) { return p([r(text, { size })]); }
function blank() { return p([r('')]); }
function textLines(text, opts = {}) {
  return String(text ?? '—').split('\n').map((line) => p([r(line, opts)]));
}

function cell(children, opts = {}) {
  return new TableCell({
    children: Array.isArray(children) ? children : [children],
    width: opts.width ? { size: opts.width, type: WidthType.DXA } : undefined,
    columnSpan: opts.span || undefined,
    shading: opts.shading || undefined,
    margins: opts.margins || CM,
  });
}
function labelCell(text) {
  return cell([pBold(text, 14)], { width: L_COL, shading: { fill: 'F2F2F2', type: ShadingType.CLEAR, color: 'auto' } });
}
function contentCell(children) {
  return cell(Array.isArray(children) ? children : [pText(children, 14)], { width: R_COL });
}
function row(cells) { return new TableRow({ children: cells }); }
function sectionHeaderRow(text) {
  return row([cell([pBold(text, 16)], { span: 2, width: PAGE_W, shading: { fill: 'D9D9D9', type: ShadingType.CLEAR, color: 'auto' } })]);
}
function labelContentRow(label, content) {
  return row([labelCell(label), contentCell(content)]);
}

function dateOnly(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('en-PH', { month: 'long', day: 'numeric', year: 'numeric' });
}
function ts(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleString('en-PH', { month: 'long', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export async function downloadCaseReportDocx({ caseData, schoolProfile }) {
  const sp = schoolProfile || {};
  const intake = caseData.intake || {};
  const c = intake.complainant || {};
  const respondent = intake.respondent || {};
  const receivedBy = intake.received_by || {};
  const timeline = caseData.timeline || [];
  const caseNo = caseData.id.slice(0, 8).toUpperCase();

  // ── Letterhead ──────────────────────────────────────────────────────────
  const letterhead = [
    p([r('Republic of the Philippines', { size: 18 })], { align: AlignmentType.CENTER, spacing: { after: 20 } }),
    p([r('DEPARTMENT OF EDUCATION', { bold: true, size: 22 })], { align: AlignmentType.CENTER, spacing: { after: 20 } }),
    p([r([sp.region, sp.division].filter(Boolean).join(' · ') || 'Region · Division', { size: 18 })], { align: AlignmentType.CENTER, spacing: { after: 20 } }),
    p([r(sp.schoolName || 'School Name', { bold: true, size: 20 })], { align: AlignmentType.CENTER, spacing: { after: 160 } }),
    p([r('CHILD PROTECTION CASE REPORT', { bold: true, size: 30 })], { align: AlignmentType.CENTER, spacing: { after: 40 } }),
    p([r('Initial Case Intake & Documentation — Child Protection Committee (DepEd Order No. 40, s. 2012)', { italic: true, size: 18 })], { align: AlignmentType.CENTER, spacing: { after: 200 } }),
  ];

  // ── Case meta strip ─────────────────────────────────────────────────────
  const metaTable = new Table({
    width: { size: PAGE_W, type: WidthType.DXA },
    rows: [row([
      cell([p([r('Case No.: ', { bold: true, size: 16 }), r(caseNo, { size: 16 })])], { width: Math.floor(PAGE_W / 3), margins: { top: 40, bottom: 40, left: 0, right: 0 } }),
      cell([p([r('Status: ', { bold: true, size: 16 }), r(CASE_STATE_LABELS[caseData.state] || caseData.state, { size: 16 })])], { width: Math.floor(PAGE_W / 3), margins: { top: 40, bottom: 40, left: 0, right: 0 } }),
      cell([p([r('Date Generated: ', { bold: true, size: 16 }), r(dateOnly(new Date().toISOString()), { size: 16 })])], { width: PAGE_W - 2 * Math.floor(PAGE_W / 3), margins: { top: 40, bottom: 40, left: 0, right: 0 } }),
    ])],
    borders: {
      top: { style: BorderStyle.SINGLE, size: 4, color: '000000' },
      bottom: { style: BorderStyle.SINGLE, size: 4, color: '000000' },
      left: NO_BORDER, right: NO_BORDER, insideHorizontal: NO_BORDER, insideVertical: NO_BORDER,
    },
  });

  // ── Main grid table ──────────────────────────────────────────────────────
  const mainTable = new Table({
    width: { size: PAGE_W, type: WidthType.DXA },
    rows: [
      sectionHeaderRow('I. INCIDENT BASICS'),
      labelContentRow('Date of Incident', dateOnly(intake.date_of_incident)),
      labelContentRow('Time', intake.time || '—'),
      labelContentRow('Date Reported', dateOnly(intake.date_reported)),
      labelContentRow('Location', intake.location || '—'),
      labelContentRow('Reporter Role', intake.reporter_role || '—'),
      labelContentRow('Filed By (Class Adviser)', receivedBy.name || '—'),

      sectionHeaderRow('II. PARTIES INVOLVED'),
      labelContentRow('Complainant', c.code_name || '—'),
      labelContentRow('Complainant Grade/Section', c.grade_section || '—'),
      labelContentRow('Complainant Role', c.role || '—'),
      labelContentRow('Respondent', respondent.code_name || '—'),
      labelContentRow('Respondent Grade/Section or Position', respondent.grade_section_or_position || '—'),
      labelContentRow('Respondent Role', respondent.role || '—'),

      sectionHeaderRow('III. MODALITY'),
      labelContentRow('Modality', (intake.modality || []).join(', ') || '—'),
      labelContentRow('Repeated / Pattern', intake.repeated_or_pattern ? 'Yes' : 'No'),

      sectionHeaderRow('IV. INCIDENT NARRATIVE'),
      row([cell([...textLines(intake.incident_narrative, { size: 14 })], { span: 2, width: PAGE_W })]),

      sectionHeaderRow('V. EVIDENCE AVAILABLE'),
      row([cell(
        (intake.evidence || []).length > 0
          ? intake.evidence.map((ev) => pText(`•  ${ev.replace(/_/g, ' ')}`, 14))
          : [pText('None listed.', 14)],
        { span: 2, width: PAGE_W },
      )]),

      sectionHeaderRow('VI. IMMEDIATE ACTIONS TAKEN'),
      row([cell([...textLines(intake.immediate_actions_taken, { size: 14 })], { span: 2, width: PAGE_W })]),
    ],
  });

  // ── Timeline table ───────────────────────────────────────────────────────
  const timelineHeaderRow = new TableRow({
    children: [
      new TableCell({ children: [pBold('Date/Time', 14)], width: { size: 3200, type: WidthType.DXA }, shading: { fill: 'BFBFBF', type: ShadingType.CLEAR, color: 'auto' }, margins: CM }),
      new TableCell({ children: [pBold('Event', 14)], width: { size: PAGE_W - 3200, type: WidthType.DXA }, shading: { fill: 'BFBFBF', type: ShadingType.CLEAR, color: 'auto' }, margins: CM }),
    ],
  });
  const timelineRows = timeline.length > 0
    ? timeline.map((entry, idx) => new TableRow({
      children: [
        new TableCell({ children: [pText(ts(entry.at), 14)], width: { size: 3200, type: WidthType.DXA }, shading: { fill: idx % 2 === 0 ? 'FFFFFF' : 'F7F7F7', type: ShadingType.CLEAR, color: 'auto' }, margins: CM }),
        new TableCell({
          children: [p([
            entry.state ? r(`${CASE_STATE_LABELS[entry.state] || entry.state}`, { bold: true, size: 14 }) : r(''),
            entry.state && entry.note ? r(' — ', { size: 14 }) : r(''),
            r(entry.note || '', { size: 14 }),
          ])],
          width: { size: PAGE_W - 3200, type: WidthType.DXA },
          shading: { fill: idx % 2 === 0 ? 'FFFFFF' : 'F7F7F7', type: ShadingType.CLEAR, color: 'auto' },
          margins: CM,
        }),
      ],
    }))
    : [new TableRow({ children: [new TableCell({ children: [pText('No timeline entries yet.', 14)], columnSpan: 2, margins: CM })] })];

  const timelineTable = new Table({
    width: { size: PAGE_W, type: WidthType.DXA },
    rows: [sectionHeaderRow('VII. CASE TIMELINE'), timelineHeaderRow, ...timelineRows],
  });

  // ── Signatories ───────────────────────────────────────────────────────────
  const NB = { top: NO_BORDER, bottom: NO_BORDER, left: NO_BORDER, right: NO_BORDER };
  const sigCol = Math.floor(PAGE_W / 3);
  const sigBlock = (title, name, role) => [
    p([r(title, { bold: true, size: 15 })], { align: AlignmentType.CENTER, spacing: { before: 0, after: 400 } }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 0, after: 20 },
      border: { top: { style: BorderStyle.SINGLE, size: 4, color: '000000', space: 1 } },
      children: [r(name || ' ', { size: 15 })],
    }),
    p([r(role, { size: 13, color: '444444' })], { align: AlignmentType.CENTER, spacing: { before: 0, after: 0 } }),
  ];

  const sigTable = new Table({
    width: { size: PAGE_W, type: WidthType.DXA },
    rows: [row([
      cell(sigBlock('PREPARED / REPORTED BY:', receivedBy.name, 'Class Adviser'), { width: sigCol, borders: NB, margins: { top: 0, bottom: 0, left: 0, right: 0 } }),
      cell(sigBlock('RECEIVED BY:', '', 'Guidance Designate'), { width: sigCol, borders: NB, margins: { top: 0, bottom: 0, left: 0, right: 0 } }),
      cell(sigBlock('NOTED BY:', '', 'School Head, CPC Chairperson'), { width: PAGE_W - 2 * sigCol, borders: NB, margins: { top: 0, bottom: 0, left: 0, right: 0 } }),
    ])],
  });

  // ── Build & download ──────────────────────────────────────────────────────
  const doc = new Document({
    sections: [{
      properties: {
        page: {
          size: { width: 11906, height: 16838 },
          margin: { top: 720, bottom: 720, left: 720, right: 720 },
        },
      },
      children: [
        ...letterhead,
        metaTable,
        blank(),
        mainTable,
        blank(),
        timelineTable,
        new Paragraph({ children: [r('')], spacing: { before: 300, after: 0 } }),
        sigTable,
      ],
    }],
  });

  const blob = await Packer.toBlob(doc);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `Case Report - ${caseNo}.docx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
