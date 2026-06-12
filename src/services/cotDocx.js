import {
  Document, Packer, Table, TableRow, TableCell,
  Paragraph, TextRun, AlignmentType, WidthType,
  ShadingType, BorderStyle, Header,
} from 'docx';

// ── Page geometry (A4 portrait, narrow margins) ───────────────────────────────
// A4: 210mm × 297mm → 11906 × 16838 DXA
// Narrow margin: 0.5in = 720 DXA all sides
// Usable width: 11906 − 1440 = 10466 DXA

const PAGE_W   = 10466; // usable width in DXA
const L_COL    = 2600;  // left label column
const R_COL    = PAGE_W - L_COL; // right content column = 7866

const CM = { top: 60, bottom: 60, left: 80, right: 80 };
const NO_BORDER = { style: BorderStyle.NONE, size: 0, color: 'auto' };
const THIN = { style: BorderStyle.SINGLE, size: 4, color: '000000' };

// ── Primitive helpers ─────────────────────────────────────────────────────────

function r(text, opts = {}) {
  return new TextRun({
    text:    String(text ?? ''),
    bold:    opts.bold    || false,
    italics: opts.italic  || false,
    size:    opts.size    || 16,   // half-points; 16 = 8pt (compact)
    font:    'Times New Roman',
    color:   opts.color  || undefined,
    underline: opts.underline ? { type: 'single' } : undefined,
  });
}

function p(children, opts = {}) {
  return new Paragraph({
    children: Array.isArray(children) ? children : [children],
    alignment: opts.align || AlignmentType.LEFT,
    spacing:   opts.spacing || { before: 0, after: 20 },
  });
}

function pBold(text, size = 16) {
  return p([r(text, { bold: true, size })]);
}

function pText(text, size = 16) {
  return p([r(text, { size })]);
}

function blank() {
  return p([r('')]);
}

// Split on \n → multiple Paragraphs
function textLines(text, opts = {}) {
  return String(text ?? '').split('\n').map(line =>
    p([r(line, opts)])
  );
}

// ── Cell builders ─────────────────────────────────────────────────────────────

function cell(children, opts = {}) {
  return new TableCell({
    children: Array.isArray(children) ? children : [children],
    width:    opts.width ? { size: opts.width, type: WidthType.DXA } : undefined,
    columnSpan: opts.span || undefined,
    rowSpan:    opts.rowSpan || undefined,
    shading:  opts.shading || undefined,
    margins:  opts.margins || CM,
    borders:  opts.borders || undefined,
    verticalAlign: opts.vAlign || undefined,
  });
}

function labelCell(lines, opts = {}) {
  const paragraphs = Array.isArray(lines) ? lines : [pBold(lines)];
  return cell(paragraphs, {
    width: L_COL,
    shading: opts.shading || { fill: 'F2F2F2', type: ShadingType.CLEAR, color: 'auto' },
    ...opts,
  });
}

function contentCell(children, opts = {}) {
  return cell(
    Array.isArray(children) ? children : [p([r(children)])],
    { width: R_COL, ...opts }
  );
}

function fullWidthCell(children, opts = {}) {
  return cell(
    Array.isArray(children) ? children : [children],
    { span: 2, width: PAGE_W, ...opts }
  );
}

// ── Row builders ──────────────────────────────────────────────────────────────

function row(cells) {
  return new TableRow({ children: cells });
}

function sectionHeaderRow(text) {
  return row([
    fullWidthCell([pBold(text, 16)], {
      shading: { fill: 'D9D9D9', type: ShadingType.CLEAR, color: 'auto' },
    }),
  ]);
}

function labelContentRow(label, contentParas, opts = {}) {
  const labelParas = typeof label === 'string'
    ? [pBold(label, 16)]
    : label;
  return row([
    labelCell(labelParas, opts.labelOpts || {}),
    contentCell(contentParas, opts.contentOpts || {}),
  ]);
}

// ── Rubric table (nested inside a cell) ──────────────────────────────────────

function rubricTable(criteria, columns = ['Criterion', 'Description', 'Points']) {
  const headerRow = new TableRow({
    children: columns.map((col, i) => new TableCell({
      children: [p([r(col, { bold: true, size: 14 })], { align: AlignmentType.CENTER })],
      width:    { size: i === 1 ? Math.floor(R_COL * 0.6) : Math.floor(R_COL * 0.2), type: WidthType.DXA },
      shading:  { fill: 'BFBFBF', type: ShadingType.CLEAR, color: 'auto' },
      margins:  CM,
    })),
  });

  const dataRows = criteria.map((c, idx) => new TableRow({
    children: [
      new TableCell({
        children: [p([r(c.criterion, { bold: true, size: 14 })])],
        shading:  { fill: idx % 2 === 0 ? 'FFFFFF' : 'F7F7F7', type: ShadingType.CLEAR, color: 'auto' },
        margins:  CM,
      }),
      new TableCell({
        children: textLines(c.description || c.annotation || '', { size: 14 }),
        shading:  { fill: idx % 2 === 0 ? 'FFFFFF' : 'F7F7F7', type: ShadingType.CLEAR, color: 'auto' },
        margins:  CM,
      }),
      new TableCell({
        children: [p([r(String(c.points ?? ''), { size: 14 })], { align: AlignmentType.CENTER })],
        shading:  { fill: idx % 2 === 0 ? 'FFFFFF' : 'F7F7F7', type: ShadingType.CLEAR, color: 'auto' },
        margins:  CM,
      }),
    ],
  }));

  return new Table({
    width:    { size: R_COL, type: WidthType.DXA },
    rows:     [headerRow, ...dataRows],
  });
}

// ── Indicator label block for left column ─────────────────────────────────────

function indicatorBlock(indicators) {
  const paras = [];
  paras.push(p([r('Possible Indicators/', { bold: true, size: 14 })]));
  indicators.forEach(ind => {
    paras.push(p([r(`Indicator ${ind.num}`, { bold: true, size: 14 })]));
    paras.push(p([r(ind.description, { size: 12, color: '444444', italic: true })]));
  });
  return paras;
}

// ── Phase mapping: which indicators appear in which IDEA phase ───────────────

const PHASE_INDICATOR_MAP = {
  introduction: ['ppst-2-4-2', 'ppst-3-4-2'],
  activity:     ['ppst-1-5-2', 'ppst-2-4-2', 'ppst-3-1-2'],
  analysis:     ['ppst-1-1-2', 'ppst-1-5-2', 'ppst-4-5-2'],
  abstraction:  ['ppst-1-1-2', 'ppst-1-2-2', 'ppst-1-4-2'],
  application:  ['ppst-3-3-2', 'ppst-3-4-2', 'ppst-5-1-2'],
};

function phaseIndicators(phase, selectedIndicators) {
  const phaseIds = PHASE_INDICATOR_MAP[phase] || [];
  return selectedIndicators.filter(ind => phaseIds.includes(ind.id));
}

// ── Main export ───────────────────────────────────────────────────────────────

export async function downloadCotDocx({ lessonMeta, plan, teacherProfile }) {
  const {
    teacherName, school, subject, grade, quarter,
    topic, melc, materials, teachingDate,
  } = lessonMeta;

  const {
    objectives, contentStandards, performanceStandards, enablingCompetencies,
    introduction, activity, analysis, abstraction, application,
    reflection, homework, cotEvidenceMap,
  } = plan;

  const selectedIndicators = lessonMeta.selectedIndicators || [];

  const teacherDisplay   = (teacherProfile?.name || teacherName || 'Teacher').toUpperCase();
  const supervisorName   = (teacherProfile?.supervisorName || '').toUpperCase();
  const supervisorPos    = teacherProfile?.supervisorPosition || 'Head Teacher I';
  const principalName    = (teacherProfile?.principalName || '').toUpperCase();
  const principalPos     = teacherProfile?.principalPosition || 'Principal IV';
  const schoolName       = school || teacherProfile?.school || '';
  const dateDisplay      = teachingDate || '';
  const subjectUpper     = (subject || '').toUpperCase();
  const sy               = '2024-2025';

  // ── Document page header ─────────────────────────────────────────────────
  const pageHeader = new Header({
    children: [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 0, after: 40 },
        children: [r(`PIVOT 4A LESSON EXEMPLAR USING THE IDEA INSTRUCTIONAL PROCESS – ${subjectUpper}`, { bold: true, size: 16 })],
      }),
    ],
  });

  // ── School info block ─────────────────────────────────────────────────────
  const infoTable = new Table({
    width: { size: PAGE_W, type: WidthType.DXA },
    rows: [
      new TableRow({
        children: [
          new TableCell({
            children: [p([r('DepEd', { bold: true, size: 16 })], { align: AlignmentType.CENTER })],
            rowSpan: 4,
            width:   { size: 900, type: WidthType.DXA },
            margins: CM,
            verticalAlign: 'center',
          }),
          new TableCell({
            children: [
              p([r('School', { bold: true, size: 14 }), r(`      ${schoolName}`, { size: 14 })]),
            ],
            width:   { size: 6266, type: WidthType.DXA },
            margins: CM,
          }),
          new TableCell({
            children: [
              p([r('Grade Level', { bold: true, size: 14 }), r(`      ${grade}`, { size: 14 })]),
            ],
            width:   { size: 3300, type: WidthType.DXA },
            margins: CM,
          }),
        ],
      }),
      new TableRow({
        children: [
          new TableCell({
            children: [p([r('Teacher', { bold: true, size: 14 }), r(`      ${teacherName}`, { size: 14 })])],
            width:   { size: 6266, type: WidthType.DXA },
            margins: CM,
          }),
          new TableCell({
            children: [p([r('Learning Area', { bold: true, size: 14 }), r(`      ${subject}`, { size: 14 })])],
            width:   { size: 3300, type: WidthType.DXA },
            margins: CM,
          }),
        ],
      }),
      new TableRow({
        children: [
          new TableCell({
            children: [p([r('Teaching Date and Time', { bold: true, size: 14 }), r(`      ${dateDisplay}`, { size: 14 })])],
            width:   { size: 6266, type: WidthType.DXA },
            margins: CM,
          }),
          new TableCell({
            children: [p([r('Quarter', { bold: true, size: 14 }), r(`      ${quarter}`, { size: 14 })])],
            width:   { size: 3300, type: WidthType.DXA },
            margins: CM,
          }),
        ],
      }),
      new TableRow({
        children: [
          new TableCell({
            children: [pBold('Lesson Exemplar', 14)],
            width:   { size: 6266, type: WidthType.DXA },
            margins: CM,
          }),
          new TableCell({
            children: [
              p([r(objectives?.cognitive || '', { size: 14 })]),
            ],
            width:   { size: 3300, type: WidthType.DXA },
            margins: CM,
          }),
        ],
      }),
    ],
  });

  // ── Main content table ────────────────────────────────────────────────────
  const objText = [
    `a. ${objectives?.cognitive || ''}`,
    `b. ${objectives?.affective || ''}`,
    `c. ${objectives?.psychomotor || ''}`,
  ].join('\n');

  const enabling = Array.isArray(enablingCompetencies)
    ? enablingCompetencies.map((e, i) => `${i + 1}. ${e}`).join('\n')
    : String(enablingCompetencies || '');

  const pretestText = (introduction?.pretest?.items || []).map(item =>
    `${item.num}. ${item.type}\n   ${item.stem}\n   A. ${item.A}\n   B. ${item.B}\n   C. ${item.C}\n   D. ${item.D}\n   Answer: ${item.answer}`
  ).join('\n\n');

  const moodSetting = introduction?.moodSetting || {};
  const moodText    = [
    `Game Name: ${moodSetting.gameName || ''}`,
    `Duration: ${moodSetting.duration || '5 minutes'}`,
    moodSetting.objective ? `Objective: ${moodSetting.objective}` : '',
    '',
    moodSetting.instructions || '',
    moodSetting.callAndResponse
      ? `\n🎤 Teacher: ${moodSetting.callAndResponse.teacher}\n👥 Students: ${moodSetting.callAndResponse.students}`
      : '',
  ].filter(Boolean).join('\n');

  const introContent = [
    pBold('CLASSROOM ROUTINES (5 minutes)', 14),
    pText('Prayer', 14),
    pText('Greetings', 14),
    pText('Checking Attendance', 14),
    pText('Classroom Management / Class Rules', 14),
    blank(),
    pBold(`MOOD SETTING (${moodSetting.duration || '5 minutes'})`, 14),
    pBold(`Game Name: ${moodSetting.gameName || ''}`, 14),
    ...textLines(moodSetting.instructions || '', { size: 14 }),
    moodSetting.callAndResponse ? p([r(`🎤 Teacher: ${moodSetting.callAndResponse.teacher}`, { size: 14 })]) : blank(),
    moodSetting.callAndResponse ? p([r(`👥 Students: ${moodSetting.callAndResponse.students}`, { size: 14 })]) : blank(),
    blank(),
    pBold(`PRE-TEST: ${introduction?.pretest?.title || 'PISA-Like Quiz'} (${introduction?.pretest?.duration || '5 minutes'})`, 14),
    p([r('Instructions: Read each question carefully and choose the best answer. Some questions may require reasoning or real-life application.', { size: 14, italic: true })]),
    blank(),
    ...textLines(pretestText, { size: 14 }),
    blank(),
    pBold('REVIEW OF THE PAST LESSON (5 minutes)', 14),
    ...textLines(introduction?.reviewOfPastLesson || '', { size: 14 }),
  ];

  const introIndicators = phaseIndicators('introduction', selectedIndicators);
  const actIndicators   = phaseIndicators('activity',     selectedIndicators);
  const anlIndicators   = phaseIndicators('analysis',     selectedIndicators);
  const absIndicators   = phaseIndicators('abstraction',  selectedIndicators);
  const appIndicators   = phaseIndicators('application',  selectedIndicators);

  // Activity content
  const actContent = [
    pBold(`${activity?.title || 'Learning Task #1'} (${activity?.duration || '10 minutes'})`, 14),
    blank(),
    pBold('A. Objective:', 14),
    pText(activity?.objective || '', 14),
    blank(),
    pBold('B. Materials Needed:', 14),
    ...(activity?.materials || []).map(m => pText(`• ${m}`, 14)),
    blank(),
    pBold('C. Instructions:', 14),
    ...(activity?.instructions || []).map((inst, i) => pText(`${i + 1}. ${inst}`, 14)),
    blank(),
    ...(activity?.scenarios?.length ? [
      pBold('Possible Scenarios:', 14),
      ...(activity.scenarios || []).map((s, i) => pText(`${i + 1}. ${s}`, 14)),
      blank(),
    ] : []),
    pBold(`Scoring Criteria (Total: 100 Points)`, 14),
    rubricTable(
      [...(activity?.rubric || []), { criterion: 'TOTAL SCORE', description: '', points: 100 }],
      ['Criteria', 'Description', 'Points']
    ),
  ];

  // Analysis content
  const anlContent = [
    pBold(`${analysis?.title || 'ANALYSIS Activity'} (${analysis?.duration || '15 minutes'})`, 14),
    blank(),
    pBold('Objective:', 14),
    pText(analysis?.objective || '', 14),
    blank(),
    pBold('Materials Needed:', 14),
    ...(analysis?.materials || []).map(m => pText(`• ${m}`, 14)),
    blank(),
    pBold('Instructions:', 14),
    ...(analysis?.instructions || []).map((inst, i) => pText(`${i + 1}. ${inst}`, 14)),
  ];

  // Abstraction content
  const absRef = abstraction?.reference || '';
  const absContent = [
    pBold(`${abstraction?.module || topic} (${abstraction?.duration || '10 minutes'})`, 14),
    blank(),
    ...textLines(abstraction?.historicalBackground || '', { size: 14 }),
    blank(),
    p([r(abstraction?.corePrinciple || '', { bold: true, size: 14 })]),
    blank(),
    ...(abstraction?.keyTerms || []).flatMap(kt => [
      p([r(`${kt.term} `, { bold: true, size: 14 }), r(`refers to ${kt.definition}`, { size: 14 })]),
      kt.additionalInfo ? pText(kt.additionalInfo, 14) : blank(),
    ]),
    blank(),
    absRef ? p([r(absRef, { size: 14, color: '1F5C8B', underline: true })]) : blank(),
  ];

  // Application content
  const appOptions = (application?.options || []).map(opt =>
    p([r(`${opt.type} – `, { bold: true, size: 14 }), r(opt.description || '', { size: 14 })])
  );

  const appContent = [
    pBold(`${application?.title || 'DIFFERENTIATED ACTIVITIES'} (${application?.duration || '15 minutes'})`, 14),
    blank(),
    pBold('GUIDE QUESTIONS:', 14),
    ...(application?.guideQuestions || []).map((q, i) => pText(`${i + 1}. ${q}`, 14)),
    blank(),
    p([r('Students will explain their answers in ', { size: 14 }), r('creative ways', { bold: true, size: 14 }), r(', choosing from:', { size: 14 })]),
    blank(),
    ...appOptions,
    blank(),
    rubricTable(
      [...(application?.rubric || []), { criterion: 'TOTAL SCORE', description: '', points: 100 }],
      ['Criteria', 'Description', 'Points']
    ),
  ];

  // Reflection content
  const reflContent = [
    pText(reflection?.overview || '', 14),
    blank(),
    pBold('Importance of Understanding This Relationship', 14),
    ...(reflection?.categories || []).flatMap(cat => [
      pBold(`${cat.label}`, 14),
      ...(cat.examples || []).map(ex => pText(`○ ${ex}`, 14)),
    ]),
  ];

  const mainTable = new Table({
    width: { size: PAGE_W, type: WidthType.DXA },
    rows: [
      // ── I. OBJECTIVES ──────────────────────────────────────────────────────
      sectionHeaderRow('I. OBJECTIVES'),
      labelContentRow(
        [pBold('A. Content Standards', 14)],
        textLines(contentStandards || '', { size: 14 }),
      ),
      labelContentRow(
        [pBold('B. Performance Standards', 14)],
        textLines(performanceStandards || '', { size: 14 }),
      ),
      labelContentRow(
        [
          pBold('C. Most Essential Learning Competencies (MELC)', 14),
          p([r('(If available, write the indicated MELC)', { size: 12, italic: true, color: '888888' })]),
        ],
        [
          ...textLines(melc || '', { size: 14 }),
          blank(),
        ],
      ),
      labelContentRow(
        [pBold('D. Enabling Competencies', 14)],
        textLines(enabling, { size: 14 }),
      ),
      labelContentRow(
        [
          pBold('E. Enrichment Competencies', 14),
          p([r('(If available, write the attached enrichment competencies)', { size: 12, italic: true, color: '888888' })]),
        ],
        [pText('The learners should be able to:', 14), pText(`a. ${objectives?.cognitive || ''}`, 14)],
      ),

      // ── II. CONTENT ────────────────────────────────────────────────────────
      sectionHeaderRow('II. CONTENT'),
      labelContentRow(
        [blank()],
        [pText(topic || '', 14)],
      ),

      // ── III. LEARNING RESOURCES ────────────────────────────────────────────
      sectionHeaderRow('III. LEARNING RESOURCES'),
      labelContentRow(
        [
          pBold('A. References', 14),
          p([r("1. Teacher's Guide Pages", { size: 14 })]),
          p([r("2. Learner's Material Pages", { size: 14 })]),
          p([r('3. Textbook Pages', { size: 14 })]),
          p([r('4. Additional Materials from LR Portal', { size: 14 })]),
        ],
        [pText(materials || '(List references from DepEd materials)', 14)],
      ),
      labelContentRow(
        [pBold('B. List of Learning Resources for Development and Engagement Activities', 14)],
        [
          pBold('Development and Engagement Activities:', 14),
          ...(activity ? [pText(`1. ${activity.title || ''}`, 14)] : []),
          ...(analysis ? [pText(`2. ${analysis.title || ''}`, 14)] : []),
          ...(application ? [pText('3. DIFFERENTIATED ACTIVITIES', 14)] : []),
          pText('4. 5-Item PISA-Like Quiz', 14),
        ],
      ),

      // ── IV. PROCEDURES ─────────────────────────────────────────────────────
      sectionHeaderRow('IV. PROCEDURES'),

      // Introduction
      row([
        labelCell([
          pBold('1.  Introduction', 14),
          blank(),
          ...indicatorBlock(introIndicators),
        ]),
        contentCell(introContent),
      ]),

      // Activity
      row([
        labelCell([
          pBold('ACTIVITY', 14),
          p([r('(Anticipatory Set – Engage)', { size: 14, italic: true })]),
          blank(),
          ...indicatorBlock(actIndicators),
        ]),
        contentCell(actContent),
      ]),

      // Analysis
      row([
        labelCell([
          pBold('ANALYSIS', 14),
          p([r('(Exploration) – Discover', { size: 14, italic: true })]),
          blank(),
          ...indicatorBlock(anlIndicators),
        ]),
        contentCell(anlContent),
      ]),

      // Abstraction
      row([
        labelCell([
          pBold('ABSTRACTION', 14),
          p([r('(Concept Introduction) – Explain', { size: 14, italic: true })]),
          blank(),
          ...indicatorBlock(absIndicators),
        ]),
        contentCell(absContent),
      ]),

      // Application
      row([
        labelCell([
          pBold('APPLICATION', 14),
          p([r('(Practice & Assessment) – Extend', { size: 14, italic: true })]),
          blank(),
          ...indicatorBlock(appIndicators),
        ]),
        contentCell(appContent),
      ]),

      // ── V. REFLECTION ──────────────────────────────────────────────────────
      sectionHeaderRow('V. REFLECTION'),
      labelContentRow(
        [blank()],
        reflContent,
      ),

      // ── VI. HOMEWORK ───────────────────────────────────────────────────────
      sectionHeaderRow('VI. HOMEWORK'),
      labelContentRow(
        [blank()],
        textLines(homework || '', { size: 14 }),
      ),
    ],
  });

  // ── Performance Management & Evaluation System ───────────────────────────
  const pmeHeader = new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 240, after: 40 },
    children: [r('PERFORMANCE MANAGEMENT & EVALUATION SYSTEM', { bold: true, size: 18 })],
  });
  const pmeSubA = new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 0, after: 20 },
    children: [r('Proficient Teachers', { bold: true, size: 16 })],
  });
  const pmeSubB = new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 0, after: 100 },
    children: [r(`S.Y. ${sy}`, { size: 16 })],
  });

  const PME_OBJ = Math.floor(PAGE_W * 0.35);
  const PME_MOV = Math.floor(PAGE_W * 0.25);
  const PME_ANN = PAGE_W - PME_OBJ - PME_MOV;

  const pmeHeaderRow = new TableRow({
    children: [
      new TableCell({
        children: [p([r('OBJECTIVE', { bold: true, size: 16 })], { align: AlignmentType.CENTER })],
        width:   { size: PME_OBJ, type: WidthType.DXA },
        shading: { fill: 'D9D9D9', type: ShadingType.CLEAR, color: 'auto' },
        margins: CM,
      }),
      new TableCell({
        children: [p([r('MOVs', { bold: true, size: 16 })], { align: AlignmentType.CENTER })],
        width:   { size: PME_MOV, type: WidthType.DXA },
        shading: { fill: 'D9D9D9', type: ShadingType.CLEAR, color: 'auto' },
        margins: CM,
      }),
      new TableCell({
        children: [p([r('ANNOTATION', { bold: true, size: 16 })], { align: AlignmentType.CENTER })],
        width:   { size: PME_ANN, type: WidthType.DXA },
        shading: { fill: 'D9D9D9', type: ShadingType.CLEAR, color: 'auto' },
        margins: CM,
      }),
    ],
  });

  const pmeDataRows = (cotEvidenceMap || []).map((item, idx) =>
    new TableRow({
      children: [
        new TableCell({
          children: [
            p([r(item.objectiveLabel || `Objective No. ${idx + 1}`, { bold: true, size: 14 })]),
            blank(),
            p([r(item.indicatorCode, { bold: true, size: 14 })]),
            p([r(item.description || '', { size: 14, italic: true })]),
          ],
          width:   { size: PME_OBJ, type: WidthType.DXA },
          shading: { fill: idx % 2 === 0 ? 'FFFFFF' : 'F7F7F7', type: ShadingType.CLEAR, color: 'auto' },
          margins: CM,
        }),
        new TableCell({
          children: textLines(item.mov || '', { size: 14 }),
          width:   { size: PME_MOV, type: WidthType.DXA },
          shading: { fill: idx % 2 === 0 ? 'FFFFFF' : 'F7F7F7', type: ShadingType.CLEAR, color: 'auto' },
          margins: CM,
        }),
        new TableCell({
          children: textLines(item.annotation || '', { size: 14 }),
          width:   { size: PME_ANN, type: WidthType.DXA },
          shading: { fill: idx % 2 === 0 ? 'FFFFFF' : 'F7F7F7', type: ShadingType.CLEAR, color: 'auto' },
          margins: CM,
        }),
      ],
    })
  );

  const pmeTable = new Table({
    width: { size: PAGE_W, type: WidthType.DXA },
    rows: [pmeHeaderRow, ...pmeDataRows],
  });

  // ── Signature block ───────────────────────────────────────────────────────
  const NB = { top: NO_BORDER, bottom: NO_BORDER, left: NO_BORDER, right: NO_BORDER };
  const sigPrepared = new Table({
    width: { size: PAGE_W, type: WidthType.DXA },
    rows: [
      new TableRow({
        children: [
          new TableCell({
            children: [
              pText('Prepared by:', 14),
              blank(), blank(),
              p([r(teacherDisplay, { bold: true, size: 16 })]),
              p([r(teacherProfile?.designation || 'Teacher III', { size: 14, color: '444444' })]),
            ],
            borders: NB, margins: { top: 0, bottom: 0, left: 0, right: 0 },
          }),
          new TableCell({
            children: [
              p([r('Checked by:', { size: 14 })], { align: AlignmentType.CENTER }),
              blank(), blank(),
              p([r(supervisorName, { bold: true, size: 16 })], { align: AlignmentType.CENTER }),
              p([r(supervisorPos, { size: 14, color: '444444' })], { align: AlignmentType.CENTER }),
            ],
            borders: NB, margins: { top: 0, bottom: 0, left: 0, right: 0 },
          }),
        ],
      }),
    ],
  });

  const sigNoted = new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 200, after: 0 },
    children: [r('Noted by:', { size: 14 })],
  });
  const sigPrincipal = new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 120, after: 0 },
    children: [r(principalName, { bold: true, size: 16 })],
  });
  const sigPrincipalPos = new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 0, after: 0 },
    children: [r(principalPos, { size: 14, color: '444444' })],
  });

  // ── Build document ────────────────────────────────────────────────────────
  const doc = new Document({
    sections: [{
      headers: { default: pageHeader },
      properties: {
        page: {
          size:   { width: 11906, height: 16838 },
          margin: { top: 720, bottom: 720, left: 720, right: 720 },
        },
      },
      children: [
        infoTable,
        new Paragraph({ children: [r('')], spacing: { before: 0, after: 60 } }),
        mainTable,
        new Paragraph({ children: [r('')], spacing: { before: 0, after: 60 } }),
        pmeHeader,
        pmeSubA,
        pmeSubB,
        pmeTable,
        new Paragraph({ children: [r('')], spacing: { before: 0, after: 120 } }),
        sigPrepared,
        sigNoted,
        sigPrincipal,
        sigPrincipalPos,
      ],
    }],
  });

  const blob     = await Packer.toBlob(doc);
  const url      = URL.createObjectURL(blob);
  const a        = document.createElement('a');
  a.href         = url;
  a.download     = `COT Lesson Plan – ${topic || subject || 'Lesson'}.docx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
