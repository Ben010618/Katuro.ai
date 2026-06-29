import {
  Document, Packer, Paragraph, TextRun, AlignmentType,
  Table, TableRow, TableCell, WidthType, BorderStyle,
  HeightRule, VerticalAlign, VerticalMergeType, PageOrientation,
} from 'docx';

// A4 landscape, Word "Narrow" margins (0.5 inch = 720 DXA each side)
const PAGE_W = 16838;   // 297 mm landscape
const PAGE_H = 11906;   // 210 mm landscape
const MARGIN  =   720;  // 0.5 inch (Word Narrow preset)
const TBL_W   = 15398;  // PAGE_W - 2*MARGIN

// 7 columns: [0]=section# [1]=label [2-6]=Mon–Fri
// C0+C1+5*day = 400+2398+5*2520 = 15398 ✓
const COL = [400, 2398, 2520, 2520, 2520, 2520, 2520];
const W = {
  c0:   400,
  c1:   2398,
  c01:  2798,   // C0+C1
  c12:  4918,   // C1+C2
  c34:  5040,   // C3+C4
  day:  2520,
  days: 12600,  // C2–C6 (5 × 2520)
  full: 15398,
};

const DAY_LABELS  = ['Monday','Tuesday','Wednesday','Thursday','Friday'];
const PROC_DAYS   = ['monday','tuesday','wednesday','thursday','friday'];
const DAILY_KEYS  = ['mon','tue','wed','thu','fri'];
const STEPS       = ['A','B','C','D','E','F','G','H','I','J'];
const STEP_LABELS = {
  A: 'A. Reviewing previous lesson or presenting the new lesson',
  B: 'B. Establishing a purpose for the lesson',
  C: 'C. Presenting examples/instances of the new lesson',
  D: 'D. Discussing new concepts and practicing new skills #1',
  E: 'E. Discussing new concepts and practicing new skills #2',
  F: 'F. Developing mastery (Leads to Formative Assessment 3)',
  G: 'G. Finding practical applications of concepts and skills in daily living',
  H: 'H. Making generalizations and abstractions about the lesson',
  I: 'I. Evaluating Learning',
  J: 'J. Additional activities for application or remediation',
};

const mm = v => Math.round(v * 56.7);

const BNone = { style: BorderStyle.NIL,    size: 0, color: 'FFFFFF' };
const BThin = { style: BorderStyle.SINGLE, size: 4, color: '888888' };
const BMed  = { style: BorderStyle.SINGLE, size: 8, color: '000000' };
const BAll  = { top: BThin, bottom: BThin, left: BThin, right: BThin };
const hdrBg = { type: 'clear', color: 'auto', fill: 'D9E1F2' };
const gryBg = { type: 'clear', color: 'auto', fill: 'F2F2F2' };

function run(text, { bold=false, italic=false, size=18, color } = {}) {
  return new TextRun({ text: String(text ?? ''), bold, italics: italic, size, font: 'Arial', ...(color ? { color } : {}) });
}

function p(children, align = AlignmentType.LEFT) {
  return new Paragraph({
    children: Array.isArray(children) ? children : [run(children)],
    alignment: align,
    spacing: { before: 0, after: 0 },
  });
}

function tc(paras, { colSpan, vMerge, width, borders = BAll, vAlign = VerticalAlign.CENTER, shading } = {}) {
  const props = {
    children: Array.isArray(paras) ? paras : [paras],
    borders,
    verticalAlign: vAlign,
    margins: { top: mm(0.8), bottom: mm(0.8), left: mm(1.2), right: mm(1.2) },
  };
  if (colSpan > 1) props.columnSpan = colSpan;
  if (vMerge)      props.verticalMerge = vMerge;
  if (width)       props.width = { size: width, type: WidthType.DXA };
  if (shading)     props.shading = shading;
  return new TableCell(props);
}

function tr(cells, hmm) {
  return new TableRow({
    children: cells,
    ...(hmm ? { height: { value: mm(hmm), rule: HeightRule.AT_LEAST } } : {}),
  });
}

// Section-# cell that starts a vertical merge (first row of a section)
const secStart = label => tc(
  [p([run(label, { bold: true, size: 18 })], AlignmentType.CENTER)],
  { width: W.c0, vAlign: VerticalAlign.CENTER, vMerge: VerticalMergeType.RESTART,
    borders: { top: BMed, bottom: BMed, left: BMed, right: BThin } },
);

// Continuation cell for section-# column
const secCont = () => tc(
  [p('')],
  { width: W.c0, vMerge: VerticalMergeType.CONTINUE,
    borders: { top: BThin, bottom: BThin, left: BMed, right: BThin } },
);

// Single-row section-# (no vMerge)
const secSingle = label => tc(
  [p([run(label, { bold: true, size: 18 })], AlignmentType.CENTER)],
  { width: W.c0, vAlign: VerticalAlign.CENTER,
    borders: { top: BMed, bottom: BMed, left: BMed, right: BThin } },
);

// Label cell (C1)
const lblCell = (text, { bold=false, size=16, bg } = {}) => tc(
  [p([run(text, { bold, size })], AlignmentType.LEFT)],
  { width: W.c1, vAlign: VerticalAlign.CENTER, ...(bg ? { shading: bg } : {}) },
);

// Wide cell spanning C2–C6
const wideCell = text => tc(
  [p([run(text || '', { size: 15 })], AlignmentType.LEFT)],
  { colSpan: 5, width: W.days, vAlign: VerticalAlign.TOP },
);

// Single day content cell
const dayCell = text => tc(
  [p([run(text || '', { size: 15 })], AlignmentType.LEFT)],
  { width: W.day, vAlign: VerticalAlign.TOP },
);

// Day header cell
const dayHdr = text => tc(
  [p([run(text, { bold: true, size: 16 })], AlignmentType.CENTER)],
  { width: W.day, vAlign: VerticalAlign.CENTER, shading: hdrBg },
);

// Build colspan'd TableCell array from a BOW list [{ text, days }]
function bowCells(list) {
  const cells = [];
  let used = 0;
  for (const item of (list || [])) {
    const span = Math.max(1, item.days || 1);
    cells.push(tc(
      [p([run(item.text?.trim() || '', { size: 15 })], AlignmentType.LEFT)],
      { colSpan: span, width: span * W.day, vAlign: VerticalAlign.TOP },
    ));
    used += span;
  }
  if (used < 5) {
    const rem = 5 - used;
    cells.push(tc([p('')], { colSpan: rem, width: rem * W.day, vAlign: VerticalAlign.TOP }));
  }
  return cells;
}

// ── Build DLL table ───────────────────────────────────────────────────────────
function buildTable(store, profile) {
  const { subject, gradeLevel, term, teachingDates, section,
          contentStandards, performanceStandards,
          melcList, contentList, melc, dailyContent,
          objectives, procedure, resources } = store;

  // Fall back to legacy flat fields when BOW lists are unavailable
  const mList = (melcList?.length && melcList.some(m => m.text?.trim()))
    ? melcList
    : (melc ? [{ text: melc, days: 5 }] : [{ text: '', days: 5 }]);

  const cList = (contentList?.length && contentList.some(c => c.text?.trim()))
    ? contentList
    : DAILY_KEYS
        .filter(d => dailyContent?.[d]?.trim())
        .map(d => ({ text: dailyContent[d], days: 1 }));

  const proc = procedure || {};
  const objs = objectives || {};
  const rows = [];

  // Row 0 — "DAILY LESSON LOG" full-width title
  // 1 cell, colSpan 7 → covers all 7 columns exactly
  rows.push(tr([
    tc(
      [p([run('DAILY LESSON LOG', { bold: true, size: 26 })], AlignmentType.CENTER)],
      { colSpan: 7, width: W.full, vAlign: VerticalAlign.CENTER,
        borders: { top: BMed, bottom: BMed, left: BMed, right: BMed },
        shading: hdrBg },
    ),
  ], 10));

  // Row 1 — info row: 6 cells covering all 7 columns
  // C0(1) + C1+C2(2) + C3+C4(2) + C5(1) + C6(1) = 7 ✓
  rows.push(tr([
    tc([p([run('○', { size: 52 })], AlignmentType.CENTER)],
      { width: W.c0 }),

    tc([
      p([run('School: ', { bold: true, size: 16 }), run(profile?.school || '', { size: 16 })]),
      p([run('Teacher: ', { bold: true, size: 16 }), run(profile?.name || '', { size: 16 })]),
    ], { colSpan: 2, width: W.c12 }),

    tc([
      p([run('Grade Level: ', { bold: true, size: 16 }), run(gradeLevel || '', { size: 16 })]),
      p([run('Learning Area: ', { bold: true, size: 16 }), run(subject || '', { size: 16 })]),
    ], { colSpan: 2, width: W.c34 }),

    tc([
      p([run('Teaching Dates: ', { bold: true, size: 15 }), run(teachingDates || '', { size: 15 })]),
      p([run('Term: ', { bold: true, size: 15 }), run(term || '', { size: 15 })]),
      ...(section ? [p([run('Section: ', { bold: true, size: 15 }), run(section, { size: 15 })])] : []),
    ], { width: W.day }),

    tc([p([run('○', { size: 52 })], AlignmentType.CENTER)],
      { width: W.day }),
  ], 16));

  // Row 2 — day-column headers
  // C0+C1(2) + C2+C3+C4+C5+C6(5) = 7 ✓
  rows.push(tr([
    tc([p('')], { colSpan: 2, width: W.c01, shading: hdrBg }),
    ...DAY_LABELS.map(d => dayHdr(d)),
  ], 8));

  // ── Section I — Objectives ─────────────────────────────────────────────────
  // Each row: C0(1) + C1(1) + C2-C6(colSpan5) = 7 ✓
  rows.push(tr([secStart('I'), lblCell('A. Content Standards'), wideCell(contentStandards)], 10));
  rows.push(tr([secCont(), lblCell('B. Performance Standards'), wideCell(performanceStandards)], 10));
  // C. Learning Competency — colspan merged by melcList days
  rows.push(tr([
    secCont(),
    lblCell('C. Learning Competencies / Objectives\n(Write the LC Code for each)'),
    ...bowCells(mList),
  ], 14));

  // Per-day learning objectives (one per day, AI-generated)
  rows.push(tr([
    secCont(),
    lblCell('Learning Objectives\n(per day)'),
    ...PROC_DAYS.map(dk => dayCell(objs[dk] || '')),
  ], 14));

  // ── Section II — Content (colspan merged by contentList days) ─────────────
  rows.push(tr([
    secSingle('II'),
    tc([
      p([run('CONTENT', { bold: true, size: 16 })], AlignmentType.CENTER),
      p([run('(Subject Matter)', { size: 14, italic: true })], AlignmentType.CENTER),
    ], { width: W.c1, vAlign: VerticalAlign.CENTER }),
    ...bowCells(cList),
  ], 12));

  // ── Section III — Learning Resources ──────────────────────────────────────
  const r = resources || {};
  const resRows = [
    ['A. References',                                true,  true,  ''],
    ["1. Teacher's Guide pages",                     false, false, r.teacherGuidePages     || ''],
    ["2. Learner's Materials pages",                 false, false, r.learnersMaterialPages || ''],
    ['3. Textbook pages',                            false, false, r.textbookPages         || ''],
    ['4. Additional Materials from LRMDS portal',    false, false, r.lrmdsPortal           || ''],
    ['B. Other Learning Resources',                  false, false, r.otherResources        || ''],
  ];
  resRows.forEach(([label, isFirst, isGray, value]) => {
    rows.push(tr([
      isFirst ? secStart('III') : secCont(),
      lblCell(label, isGray ? { bg: gryBg } : {}),
      wideCell(value),
    ], 7));
  });

  // ── Section IV — Procedure ─────────────────────────────────────────────────
  // Header: C0(1) + C1(1) + C2+C3+C4+C5+C6(1 each) = 7 ✓
  rows.push(tr([
    secStart('IV'),
    tc([p([run('PROCEDURES', { bold: true, size: 16 })], AlignmentType.CENTER)],
      { width: W.c1, vAlign: VerticalAlign.CENTER, shading: hdrBg }),
    ...DAY_LABELS.map(d => tc(
      [p([run(d, { bold: true, size: 15 })], AlignmentType.CENTER)],
      { width: W.day, shading: hdrBg },
    )),
  ], 7));

  // Step rows: C0(1) + C1(1) + C2+C3+C4+C5+C6(1 each) = 7 ✓
  STEPS.forEach(s => {
    rows.push(tr([
      secCont(),
      lblCell(STEP_LABELS[s], { size: 15 }),
      ...PROC_DAYS.map(dk => dayCell(proc[dk]?.[s] || '')),
    ], 16));
  });

  // ── Section V — Remarks ────────────────────────────────────────────────────
  rows.push(tr([secSingle('V'), lblCell('REMARKS'), wideCell('')], 12));

  // ── Section VI — Reflection ────────────────────────────────────────────────
  const reflRows = [
    ['REFLECTION', true, true],
    ['A. No. of learners who earned 80% in the evaluation', false, false],
    ['B. No. of learners who require additional activities for remediation', false, false],
    ['C. Did the remedial lessons work? No. of learners who have caught up with the lesson', false, false],
    ['D. No. of learners who continue to require remediation', false, false],
    ['E. Which of my teaching strategies worked well? Why did these work?', false, false],
    ['F. What difficulties did I encounter which my principal or supervisor can help me solve?', false, false],
    ['G. What innovation or localized materials did I use/discover which I wish to share with other teachers?', false, false],
  ];
  reflRows.forEach(([label, isFirst, isHdr], i) => {
    rows.push(tr([
      i === 0 ? secStart('VI') : secCont(),
      isHdr
        ? tc([p([run(label, { bold: true, size: 16 })], AlignmentType.CENTER)],
            { width: W.c1, shading: hdrBg, vAlign: VerticalAlign.CENTER })
        : lblCell(label, { size: 15 }),
      wideCell(''),
    ], 9));
  });

  return new Table({
    rows,
    width: { size: TBL_W, type: WidthType.DXA },
    columnWidths: COL,
    alignment: AlignmentType.CENTER,
  });
}

// ── Signature block ───────────────────────────────────────────────────────────
function signatureBlock(profile) {
  const colW  = [Math.floor(TBL_W / 3), Math.floor(TBL_W / 3), TBL_W - 2 * Math.floor(TBL_W / 3)];
  const blank = '________________________';

  function sigCell(lines) {
    return new TableCell({
      children: lines.map(({ text, bold=false, italic=false }) =>
        p([run(text, { bold, italic, size: 18 })], AlignmentType.CENTER),
      ),
      borders: { top: BNone, bottom: BNone, left: BNone, right: BNone },
      verticalAlign: VerticalAlign.TOP,
      margins: { top: mm(2), bottom: mm(1), left: mm(2), right: mm(2) },
    });
  }

  return new Table({
    rows: [
      new TableRow({ children: [
        sigCell([
          { text: 'Prepared by:', bold: true },
          { text: '' },
          { text: profile?.name || blank, bold: !!profile?.name },
          { text: profile?.designation || profile?.position || 'Teacher', italic: true },
        ]),
        sigCell([
          { text: 'Checked by:', bold: true },
          { text: '' },
          { text: profile?.supervisorName || blank, bold: !!profile?.supervisorName },
          { text: profile?.supervisorPosition || 'Master Teacher / Head Teacher', italic: true },
        ]),
        sigCell([
          { text: 'Noted by:', bold: true },
          { text: '' },
          { text: blank },
          { text: 'School Principal', italic: true },
        ]),
      ]}),
    ],
    width: { size: TBL_W, type: WidthType.DXA },
    columnWidths: colW,
    alignment: AlignmentType.CENTER,
    borders: { top: BNone, bottom: BNone, left: BNone, right: BNone, insideH: BNone, insideV: BNone },
  });
}

// ── Public API ────────────────────────────────────────────────────────────────
export async function downloadDLLDocx({ store, profile }) {
  const doc = new Document({
    sections: [{
      properties: {
        page: {
          // docx.js v9 swaps width↔height when LANDSCAPE — pass portrait dims
          // so it outputs w:w=16838 (landscape physical width), not w:w=11906.
          size: { width: PAGE_H, height: PAGE_W, orientation: PageOrientation.LANDSCAPE },
          margin: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN },
        },
      },
      children: [
        buildTable(store, profile),
        new Paragraph({ children: [], spacing: { before: mm(4), after: mm(4) } }),
        signatureBlock(profile),
      ],
    }],
  });

  const blob = await Packer.toBlob(doc);
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `DLL_${(store.subject || 'lesson').replace(/\s+/g, '_')}_${(store.gradeLevel || '').replace(/\s+/g, '_')}.docx`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
