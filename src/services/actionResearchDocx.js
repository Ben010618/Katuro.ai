import {
  Document, Packer, Paragraph, TextRun, AlignmentType,
  Table, TableRow, TableCell, WidthType, BorderStyle,
  PageOrientation,
} from 'docx';
import { saveAs } from 'file-saver';

// A4 Portrait, 1-inch margins (academic standard)
const PAGE_W = 11906;
const PAGE_H = 16838;
const MARGIN  = 1440;   // 1 inch = 1440 DXA
const TBL_W   = PAGE_W - 2 * MARGIN; // 9026 DXA

const FONT   = 'Times New Roman';
const SZ     = 24;  // 12pt (half-points)
const SZ_H1  = 28;  // 14pt
const SZ_SM  = 20;  // 10pt

const DSPACE = 480; // double spacing (line height)
const INDENT = 720; // 0.5 inch first-line

const GREEN = '1a3d2b';
const GRAY  = '4a6357';

/* ── Paragraph builders ──────────────────────────────────────────────────── */

function run(text, opts = {}) {
  return new TextRun({ text, font: FONT, size: opts.size ?? SZ, bold: opts.bold ?? false, color: opts.color, italics: opts.italic });
}

function blankLine() {
  return new Paragraph({ children: [run('')], spacing: { before: 0, after: 0, line: 240 } });
}

function centered(text, opts = {}) {
  return new Paragraph({
    children: [run(text, opts)],
    alignment: AlignmentType.CENTER,
    spacing: { before: opts.spaceBefore ?? 80, after: opts.spaceAfter ?? 80, line: opts.line ?? 240 },
  });
}

function chapterTitle(title) {
  return new Paragraph({
    children: [run(title.toUpperCase(), { bold: true, size: SZ_H1 })],
    alignment: AlignmentType.CENTER,
    spacing: { before: 480, after: 120, line: 240 },
  });
}

function sectionHead(text) {
  return new Paragraph({
    children: [run(text.toUpperCase(), { bold: true })],
    alignment: AlignmentType.LEFT,
    spacing: { before: 320, after: 120, line: 240 },
  });
}

function bodyPara(text, noIndent = false) {
  return new Paragraph({
    children: [run(text)],
    alignment: AlignmentType.JUSTIFIED,
    spacing: { before: 0, after: 0, line: DSPACE },
    indent: noIndent ? {} : { firstLine: INDENT },
  });
}

function bulletItem(text) {
  return new Paragraph({
    children: [run(`•  ${text}`)],
    alignment: AlignmentType.JUSTIFIED,
    spacing: { before: 0, after: 60, line: DSPACE },
    indent: { left: INDENT },
  });
}

function numberedItem(n, text) {
  return new Paragraph({
    children: [run(`${n}.  ${text}`)],
    alignment: AlignmentType.JUSTIFIED,
    spacing: { before: 0, after: 80, line: DSPACE },
    indent: { left: INDENT },
  });
}

function labeledPara(label, text) {
  return new Paragraph({
    children: [run(label + ': ', { bold: true }), run(text)],
    alignment: AlignmentType.JUSTIFIED,
    spacing: { before: 60, after: 60, line: DSPACE },
  });
}

/* ── Table builder (for timeline) ───────────────────────────────────────── */

const NO_BORDER = { style: BorderStyle.NONE, size: 0, color: 'auto' };
const CELL_BORDER = { top: NO_BORDER, bottom: NO_BORDER, left: NO_BORDER, right: NO_BORDER };

function tlCell(text, opts = {}) {
  return new TableCell({
    children: [new Paragraph({
      children: [run(text, { bold: opts.bold, size: SZ_SM })],
      spacing: { before: 60, after: 60, line: 240 },
    })],
    shading: opts.header ? { fill: 'D8F3DC' } : undefined,
    width: opts.width ? { size: opts.width, type: WidthType.DXA } : undefined,
    margins: { top: 80, bottom: 80, left: 120, right: 120 },
  });
}

function buildTimelineTable(timeline) {
  const cols = [1500, 1500, 3500, 2526];
  const header = new TableRow({
    children: [
      tlCell('Phase', { bold: true, header: true, width: cols[0] }),
      tlCell('Duration', { bold: true, header: true, width: cols[1] }),
      tlCell('Activities', { bold: true, header: true, width: cols[2] }),
      tlCell('Outputs', { bold: true, header: true, width: cols[3] }),
    ],
    tableHeader: true,
  });
  const rows = (timeline ?? []).map(row =>
    new TableRow({
      children: [
        tlCell(row.phase ?? '', { width: cols[0] }),
        tlCell(row.duration ?? '', { width: cols[1] }),
        tlCell((row.activities ?? []).join('\n'), { width: cols[2] }),
        tlCell(row.outputs ?? '', { width: cols[3] }),
      ],
    })
  );
  return new Table({
    width: { size: TBL_W, type: WidthType.DXA },
    rows: [header, ...rows],
    borders: {
      top:    { style: BorderStyle.SINGLE, size: 4, color: '2d6a4f' },
      bottom: { style: BorderStyle.SINGLE, size: 4, color: '2d6a4f' },
      left:   { style: BorderStyle.SINGLE, size: 4, color: '2d6a4f' },
      right:  { style: BorderStyle.SINGLE, size: 4, color: '2d6a4f' },
      insideH:{ style: BorderStyle.SINGLE, size: 1, color: 'C8DDD4' },
      insideV:{ style: BorderStyle.SINGLE, size: 1, color: 'C8DDD4' },
    },
  });
}

function statsTable(rows) {
  const cols = [2500, 3000, 3526];
  const header = new TableRow({
    children: [
      tlCell('Formula / Treatment', { bold: true, header: true, width: cols[0] }),
      tlCell('Purpose', { bold: true, header: true, width: cols[1] }),
      tlCell('Interpretation', { bold: true, header: true, width: cols[2] }),
    ],
    tableHeader: true,
  });
  const dataRows = (rows ?? []).map(r =>
    new TableRow({
      children: [
        tlCell(r.formula ?? '', { width: cols[0] }),
        tlCell(r.purpose ?? '', { width: cols[1] }),
        tlCell(r.interpretation ?? '', { width: cols[2] }),
      ],
    })
  );
  return new Table({
    width: { size: TBL_W, type: WidthType.DXA },
    rows: [header, ...dataRows],
    borders: {
      top:    { style: BorderStyle.SINGLE, size: 4, color: '2d6a4f' },
      bottom: { style: BorderStyle.SINGLE, size: 4, color: '2d6a4f' },
      left:   { style: BorderStyle.SINGLE, size: 4, color: '2d6a4f' },
      right:  { style: BorderStyle.SINGLE, size: 4, color: '2d6a4f' },
      insideH:{ style: BorderStyle.SINGLE, size: 1, color: 'C8DDD4' },
      insideV:{ style: BorderStyle.SINGLE, size: 1, color: 'C8DDD4' },
    },
  });
}

/* ── Section builders ────────────────────────────────────────────────────── */

function buildTitlePage(data, teacherName) {
  return [
    blankLine(), blankLine(), blankLine(),
    centered(data.selectedTitle ?? data.problemText?.slice(0, 80) ?? 'Action Research', { bold: true, size: SZ_H1, line: 480, spaceBefore: 0, spaceAfter: 240 }),
    blankLine(),
    centered('An Action Research Paper', { spaceAfter: 0 }),
    centered('Presented to the Schools Division of _______________', { spaceAfter: 0 }),
    centered('Department of Education', { spaceAfter: 240 }),
    blankLine(),
    centered('In Partial Fulfillment of the Requirements for', { spaceAfter: 0 }),
    centered('Action Research Completion', { spaceAfter: 240 }),
    blankLine(), blankLine(),
    centered('By:', { bold: true, spaceBefore: 200, spaceAfter: 0 }),
    centered(teacherName || 'Teacher-Researcher', { spaceAfter: 0 }),
    data.gradeLevel  ? centered(`${data.gradeLevel}${data.subjectArea ? ' — ' + data.subjectArea : ''}`, { spaceAfter: 0 }) : null,
    data.schoolName  ? centered(data.schoolName, { spaceAfter: 0 }) : null,
    data.schoolYear  ? centered(`School Year ${data.schoolYear}`, { spaceAfter: 240 }) : null,
  ].filter(Boolean);
}

function buildChapterI(data) {
  const items = [
    chapterTitle('Chapter I'),
    chapterTitle('The Problem and Its Background'),
    blankLine(),
    sectionHead('Introduction'),
    bodyPara(data.aiProblemStatement ?? data.problemText ?? ''),
  ];
  if (data.selectedQuestions?.length) {
    items.push(blankLine(), sectionHead('Objectives of the Study'));
    items.push(bodyPara('This action research specifically aims to:', true));
    data.selectedQuestions.forEach((q, i) => items.push(numberedItem(i + 1, q)));
  }
  return items;
}

function buildChapterII(lr) {
  if (!lr) return [];
  const sections = [
    ['Global Perspective', lr.globalPerspective],
    ['National Perspective', lr.nationalPerspective],
    ['Local Perspective', lr.localPerspective],
    ['Classroom Perspective', lr.classroomPerspective],
    ['Synthesis', lr.synthesis],
  ];
  const items = [
    chapterTitle('Chapter II'),
    chapterTitle('Review of Related Literature'),
    blankLine(),
  ];
  sections.forEach(([label, text]) => {
    if (!text) return;
    items.push(sectionHead(label));
    text.split('\n').filter(Boolean).forEach(para => items.push(bodyPara(para)));
    items.push(blankLine());
  });
  return items;
}

function buildChapterIII(ap) {
  if (!ap) return [];
  const items = [
    chapterTitle('Chapter III'),
    chapterTitle('Action Plan'),
    blankLine(),
    sectionHead('Objectives'),
  ];
  (ap.objectives ?? []).forEach((o, i) => items.push(numberedItem(i + 1, o)));
  items.push(blankLine(), sectionHead('Intervention Description'));
  items.push(bodyPara(ap.interventionDescription ?? ''));
  items.push(blankLine(), sectionHead('Timeline of Activities'));
  items.push(buildTimelineTable(ap.timeline));
  items.push(blankLine(), sectionHead('Resources Needed'));
  (ap.resources ?? []).forEach(r => items.push(bulletItem(r)));
  items.push(blankLine(), sectionHead('Success Indicators'));
  (ap.successIndicators ?? []).forEach(s => items.push(bulletItem(s)));
  if (ap.ethicalConsiderations) {
    items.push(blankLine(), sectionHead('Ethical Considerations'));
    items.push(bodyPara(ap.ethicalConsiderations));
  }
  return items;
}

function buildChapterIV(dc) {
  if (!dc) return [];
  const items = [
    chapterTitle('Chapter IV'),
    chapterTitle('Methodology: Data Collection'),
    blankLine(),
    sectionHead('Primary Data Collection Tool'),
    labeledPara('Tool', dc.primaryTool?.name ?? ''),
    labeledPara('Type', dc.primaryTool?.type ?? ''),
    bodyPara(dc.primaryTool?.description ?? ''),
    bodyPara(dc.primaryTool?.rationale ?? ''),
    bodyPara(dc.primaryTool?.administration ?? ''),
  ];
  if (dc.primaryTool?.sampleItems?.length) {
    items.push(sectionHead('Sample Items (Primary Tool)'));
    dc.primaryTool.sampleItems.forEach((s, i) => items.push(numberedItem(i + 1, s)));
  }
  items.push(blankLine(), sectionHead('Secondary Data Collection Tool'));
  items.push(labeledPara('Tool', dc.secondaryTool?.name ?? ''));
  items.push(bodyPara(dc.secondaryTool?.description ?? ''));
  if (dc.secondaryTool?.sampleItems?.length) {
    dc.secondaryTool.sampleItems.forEach((s, i) => items.push(numberedItem(i + 1, s)));
  }
  items.push(blankLine(), sectionHead('Statistical Treatment'));
  items.push(statsTable(dc.statisticalTreatment));
  items.push(blankLine(), sectionHead('Data Analysis Approach'));
  items.push(bodyPara(dc.analysisApproach ?? ''));
  return items;
}

function buildChapterV(findings) {
  if (!findings) return [];
  const items = [
    chapterTitle('Chapter V'),
    chapterTitle('Results, Discussion, Conclusions, and Recommendations'),
    blankLine(),
    sectionHead('Findings'),
  ];
  (findings.findings ?? []).forEach(f => {
    items.push(new Paragraph({
      children: [run(`${f.questionNumber}. ${f.question}`, { bold: true })],
      spacing: { before: 160, after: 80, line: DSPACE },
    }));
    items.push(bodyPara(f.analysis ?? ''));
    if (f.significance) items.push(bodyPara(f.significance));
  });
  items.push(blankLine(), sectionHead('Discussion'));
  (findings.discussion ?? '').split('\n').filter(Boolean).forEach(p => items.push(bodyPara(p)));
  items.push(blankLine(), sectionHead('Conclusions'));
  (findings.conclusions ?? []).forEach((c, i) => items.push(numberedItem(i + 1, c)));
  items.push(blankLine(), sectionHead('Recommendations'));
  (findings.recommendations ?? []).forEach(r => {
    items.push(new Paragraph({
      children: [run(`For ${r.for}: `, { bold: true }), run(r.text ?? '')],
      spacing: { before: 80, after: 60, line: DSPACE },
      indent: { left: INDENT },
    }));
  });
  if (findings.reflections) {
    items.push(blankLine(), sectionHead("Teacher-Researcher's Reflection"));
    (findings.reflections ?? '').split('\n').filter(Boolean).forEach(p => items.push(bodyPara(p)));
  }
  return items;
}

/* ── Main export function ────────────────────────────────────────────────── */

export async function downloadResearchDocx(data, teacherName = '') {
  const children = [
    ...buildTitlePage(data, teacherName),
    blankLine(), blankLine(),
    ...buildChapterI(data),
  ];

  if (data.literatureReview) {
    children.push(blankLine(), blankLine());
    children.push(...buildChapterII(data.literatureReview));
  }
  if (data.actionPlan) {
    children.push(blankLine(), blankLine());
    children.push(...buildChapterIII(data.actionPlan));
  }
  if (data.dataCollection) {
    children.push(blankLine(), blankLine());
    children.push(...buildChapterIV(data.dataCollection));
  }
  if (data.findings) {
    children.push(blankLine(), blankLine());
    children.push(...buildChapterV(data.findings));
  }

  const doc = new Document({
    sections: [{
      properties: {
        page: {
          size:   { width: PAGE_W, height: PAGE_H },
          margin: { top: MARGIN, bottom: MARGIN, left: 1800, right: MARGIN },
        },
      },
      children: children.filter(Boolean),
    }],
  });

  const blob = await Packer.toBlob(doc);
  const safeName = (data.selectedTitle ?? 'Action-Research').replace(/[^a-z0-9\s-]/gi, '').replace(/\s+/g, '-').slice(0, 60);
  saveAs(blob, `${safeName}.docx`);
}
