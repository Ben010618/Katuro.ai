import {
  Document, Packer, Table, TableRow, TableCell,
  Paragraph, TextRun, AlignmentType, WidthType,
  ShadingType, PageOrientation,
} from 'docx';

// ── Primitive helpers ──────────────────────────────────────────────────────

function r(text, opts = {}) {
  return new TextRun({
    text:    String(text ?? ''),
    bold:    opts.bold    || false,
    italics: opts.italic  || false,
    size:    opts.size    || 20,   // half-points; 20 = 10pt
    font:    'Times New Roman',
    color:   opts.color  || undefined,
  });
}

// Split on \n → one Paragraph per line
function lines(text, opts = {}) {
  return String(text ?? '').split('\n').map(t =>
    new Paragraph({ children: [r(t, opts)] })
  );
}

// ── Cell builders ──────────────────────────────────────────────────────────

const CM = { top: 80, bottom: 80, left: 100, right: 100 };

function labelCell(text, note) {
  return new TableCell({
    children: [
      new Paragraph({ children: [r(text, { bold: true })] }),
      ...(note ? [new Paragraph({ children: [r(note, { italic: true, size: 16, color: '6B7280' })] })] : []),
    ],
    shading: { fill: 'F9FAFB', type: ShadingType.CLEAR, color: 'auto' },
    width:   { size: 2200, type: WidthType.DXA },
    margins: CM,
  });
}

function mergedCell(text, n) {
  return new TableCell({
    columnSpan: n,
    children:   lines(text),
    margins:    CM,
  });
}

function sessionCell(text, shading) {
  return new TableCell({
    children: lines(text),
    shading:  shading,
    margins:  CM,
  });
}

function bannerRow(title, desc, n) {
  return new TableRow({
    children: [new TableCell({
      columnSpan: n + 1,
      children: [new Paragraph({
        children: [
          r(title + '  ', { bold: true, italic: true, size: 26 }),
          r(desc, { italic: true, size: 17, color: '4B5563' }),
        ],
      })],
      shading:  { fill: 'E5E7EB', type: ShadingType.CLEAR, color: 'auto' },
      margins:  { top: 100, bottom: 100, left: 120, right: 120 },
    })],
  });
}

// ── Objective formatter ────────────────────────────────────────────────────

function fmtObjective(s) {
  return s.objective || '';
}

// ── Main export ────────────────────────────────────────────────────────────

/**
 * Build and trigger a .docx download of the ILAW lesson plan.
 *
 * @param {object} lessonMeta  - store fields: lessonName, subject, gradeLevel, term, weekNumber,
 *                               competencyText, declarationOfAIUse
 * @param {array}  sessions    - enriched session objects from store.generatedPlan.sessions
 * @param {object} teacherProfile - Firestore teacher profile (name, position, supervisorName, …)
 * @param {object} user        - Firebase auth user
 */
export async function downloadIlawDocx({ lessonMeta, sessions, teacherProfile, user }) {
  const n = sessions.length;

  // ── Display values ─────────────────────────────────────────────────────
  const teacherName  = (teacherProfile?.name || user?.displayName || user?.email?.split('@')[0] || 'Teacher').toUpperCase();
  const position     = teacherProfile?.designation || teacherProfile?.position || 'Teacher';
  const supervisor   = (teacherProfile?.supervisorName || '(School Head / Supervisor)').toUpperCase();
  const supPosition  = teacherProfile?.supervisorPosition || 'Master Teacher';
  const gradeSection = `${lessonMeta.gradeLevel || '—'} – ${teacherProfile?.section || '(Section)'}`;
  const references   = `MATATAG Curriculum Guide · ${lessonMeta.subject || ''} ${lessonMeta.gradeLevel || ''} · ${lessonMeta.term || ''}`.trim();
  const amber        = { fill: 'FFFBEB', type: ShadingType.CLEAR, color: 'auto' };

  // ── Row helpers (close over n / sessions) ─────────────────────────────
  const mRow = (label, text, note) => new TableRow({
    children: [labelCell(label, note), mergedCell(text, n)],
  });

  const sRow = (label, getter, note, isAmber) => new TableRow({
    children: [
      labelCell(label, note),
      ...sessions.map(s => sessionCell(getter(s), isAmber ? amber : undefined)),
    ],
  });

  // ── Build table ────────────────────────────────────────────────────────
  const table = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      // Header metadata
      mRow('Name of Lesson',                             lessonMeta.lessonName || '—'),
      mRow('Learning Area/s',                            lessonMeta.subject    || '—'),
      mRow('Designed by Teacher/s',                      teacherName),
      mRow('Designed for which Grade Level and Section', gradeSection),

      // Session column headers
      new TableRow({
        children: [
          new TableCell({
            children: [new Paragraph({ children: [r('No. of Sessions', { bold: true })] })],
            shading:  { fill: 'F3F4F6', type: ShadingType.CLEAR, color: 'auto' },
            width:    { size: 2200, type: WidthType.DXA },
            margins:  CM,
          }),
          ...sessions.map(s => new TableCell({
            children: [
              new Paragraph({ children: [r(`Session ${s.day}`, { bold: true })], alignment: AlignmentType.CENTER }),
              new Paragraph({ children: [r(s.date, { size: 16, color: '6B7280' })],  alignment: AlignmentType.CENTER }),
            ],
            shading:  { fill: 'F3F4F6', type: ShadingType.CLEAR, color: 'auto' },
            margins:  CM,
          })),
        ],
      }),

      mRow('References',           references,                       'books, websites, toolkits, etc.'),
      mRow('Declaration of AI use', lessonMeta.declarationOfAIUse || '', 'Cite how AI was used. See DO 3, 2026 Annex A.'),

      // Intentions
      bannerRow('Intentions.', 'Meaningful learning experiences are anchored in how we frame them. These intentions guide what learners will know, feel, and be able to do by the end of each session.', n),
      mRow('Learning Competency:',
        lessonMeta.competencies?.length > 0
          ? lessonMeta.competencies.map(c => `• ${c.text}`).join('\n')
          : `• ${lessonMeta.competencyText || '—'}`,
        'Write the competency/ies from the curriculum that we are targeting.'),
      sRow('Learning Objectives:',  fmtObjective, 'Write the smaller knowledge, skills, or tasks from the competency that learners will achieve in each session.'),

      // Learning Experience
      bannerRow('Learning Experience.', "Learning experiences must be purposefully designed to develop learners' knowledge, skills, and values. The flow follows the ILAW design framework.", n),
      sRow('Pre-Lesson:',                     s => s.prelesson           || '(To be generated)', 'What the teacher and learners do before the formal lesson begins.'),
      sRow('Flow:',                            s => s.flow                || '(To be generated)', 'Meeting Time 1 · Work Period 1 · Meeting Time 2 · Work Period 2 · Indoor/Outdoor'),
      sRow('Learning Resources:',              s => s.resources           || '(To be generated)', 'Materials, references, manipulatives, technology, and community resources.'),
      sRow('Opportunities for Integration:',   s => s.integration         || 'N/A',               'Meaningful anchors to other learning areas, special topics, or technology. Write N/A if none.'),

      // Assessment
      bannerRow('Assessment.', 'Formative assessment should be ongoing and embedded in the learning experience — not an add-on at the end.', n),
      sRow('Formative Assessment:', s => s.formativeAssessment || '(To be generated)', 'Specific questions, tasks, or observations to check learning. Include accommodations for diverse learners.'),

      // Ways Forward
      bannerRow('Ways Forward.', 'Extend learning beyond the classroom and give learners space to reflect, connect, and grow.', n),
      sRow('Extended Learning Opportunities:', s => s.extendedLearning || '(To be generated)', 'Meaningful activities learners can do independently beyond class time.'),
      sRow('Reflections:', s => s.reflection || '*(To be filled after the lesson)*\nReflection Prompt: What worked? What confused learners? What will you adjust next time?', 'What worked? What confused learners? What will you adjust? Fill after teaching.', true),
    ],
  });

  // ── Signature block (2-column table below the main table) ─────────────
  const sigTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        children: [
          new TableCell({
            children: [new Paragraph({ children: [r('Prepared by:', { size: 20 })] })],
            borders:  { top: { size: 0 }, bottom: { size: 0 }, left: { size: 0 }, right: { size: 0 } },
            margins:  { top: 0, bottom: 0, left: 0, right: 0 },
          }),
          new TableCell({
            children: [new Paragraph({ children: [r('Checked by:', { size: 20 })], alignment: AlignmentType.RIGHT })],
            borders:  { top: { size: 0 }, bottom: { size: 0 }, left: { size: 0 }, right: { size: 0 } },
            margins:  { top: 0, bottom: 0, left: 0, right: 0 },
          }),
        ],
      }),
      new TableRow({
        children: [
          new TableCell({
            children: [
              new Paragraph({ children: [r('', { size: 20 })] }),
              new Paragraph({ children: [r('', { size: 20 })] }),
              new Paragraph({ children: [r(teacherName, { bold: true, size: 22 })] }),
              new Paragraph({ children: [r(position, { size: 18, color: '6B7280' })] }),
            ],
            borders:  { top: { size: 0 }, bottom: { size: 0 }, left: { size: 0 }, right: { size: 0 } },
            margins:  { top: 0, bottom: 0, left: 0, right: 0 },
          }),
          new TableCell({
            children: [
              new Paragraph({ children: [r('', { size: 20 })] }),
              new Paragraph({ children: [r('', { size: 20 })] }),
              new Paragraph({ children: [r(supervisor, { bold: true, size: 22 })], alignment: AlignmentType.RIGHT }),
              new Paragraph({ children: [r(supPosition, { size: 18, color: '6B7280' })], alignment: AlignmentType.RIGHT }),
            ],
            borders:  { top: { size: 0 }, bottom: { size: 0 }, left: { size: 0 }, right: { size: 0 } },
            margins:  { top: 0, bottom: 0, left: 0, right: 0 },
          }),
        ],
      }),
    ],
  });

  const doc = new Document({
    sections: [{
      properties: {
        page: {
          size:   { orientation: PageOrientation.LANDSCAPE },
          margin: { top: 720, bottom: 720, left: 1080, right: 1080 },
        },
      },
      children: [
        table,
        new Paragraph({ children: [r('')] }),
        sigTable,
      ],
    }],
  });

  const blob = await Packer.toBlob(doc);
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `${lessonMeta.lessonName || 'ILAW Lesson Plan'}.docx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
