/**
 * schoolForms.js — what KaTuroDesk knows about DepEd school forms, so it understands
 * teachers the way a fellow teacher would ("consolidate the grades for the cards" =
 * the SF9 Learner's Performance Report of the adviser's class).
 *
 * Only the cards relevant to a request are sent to the AI (a few hundred tokens).
 *
 * Sources (official PDFs, deped.gov.ph):
 *   DO 6, s. 2025  — Streamlining of School Forms and Reports Accomplished by Teachers
 *                    (Mar 20, 2025): Enclosure 1 (all teachers), Enclosure 2 (ancillary
 *                    tasks, incl. Homeroom Guidance and Management = class advisers).
 *   DO 15, s. 2026 — Classroom Assessment, Grading System, Awards and Recognition (SF9/SF10).
 */

export const FORM_SOURCES = {
  do6: 'DepEd Order No. 6, s. 2025 (streamlined school forms for teachers)',
  do15: 'DepEd Order No. 15, s. 2026 (assessment, grading, SF9)',
};

/**
 * Form cards. `teacherForm` = listed for teachers in DO 6, s. 2025. `tool` = the
 * KaTuroDesk tool that does the job (when there is one).
 */
export const SCHOOL_FORMS = [
  {
    id: 'sf9', code: 'SF9', title: "Learner's Progress Report Card (SF9)",
    alsoCalled: ['report card', 'card', 'class card', 'grade card', 'cards', 'kard', 'performance report', 'progress report', 'learner\'s performance report', 'form 138', 'f138'],
    preparedBy: 'Class adviser (Homeroom Guidance and Management)', teacherForm: true, source: 'do6',
    what: "Each learner's grades per learning area for Terms 1–3, Final Grade, Remarks and General Average, plus attendance and teacher comments. Grades 4–12 (and Grades 2–3 in SY 2026–2027): numerical Learner's Performance Report (DO 15 Annex G). Kindergarten and Grade 1 (SY 2026–2027): descriptive Learner's Progress Report, no numerical grades.",
    dataFrom: 'Every subject teacher\'s class record for the section (term grades per learning area); attendance from SF2.',
    feeds: ['SF5 (promotion and proficiency)', 'SF10 (permanent record)'],
    tool: 'build_report_cards',
    understand: '"Consolidate (all) the grades", "pa-consolidate ng grades", "grades for the cards" from an ADVISER means: collect the term grades of every learning area for each learner of the section from the subject teachers\' class records, compute Final Grades and the General Average, and prepare the SF9 cards plus a class summary.',
  },
  {
    id: 'class_record', code: 'Class Record', title: 'Class Record (e-Class Record)',
    alsoCalled: ['class record', 'ecr', 'e-class record', 'grading sheet'],
    preparedBy: 'Every subject teacher, per section and learning area', teacherForm: true, source: 'do6',
    what: 'Raw scores of Written Works, Performance Tasks and summative tests/term exam per term, weighted into the Term Grade (DO 15 Tables 9–10).',
    dataFrom: 'Scores of tests, quizzes and tasks.',
    feeds: ['SF9 (term grades per learning area)'],
    tool: 'make_class_record',
    understand: '"Consolidate grades" from a SUBJECT TEACHER (not adviser) usually means one learning area across their sections. Ask if unclear.',
  },
  {
    id: 'sf1', code: 'SF1', title: 'School Form 1 – School Register',
    alsoCalled: ['sf1', 'school register', 'masterlist', 'master list', 'class list', 'enrolment list', 'enrollment list'],
    preparedBy: 'Class adviser', teacherForm: true, source: 'do6',
    what: 'The official list of enrolled learners of a section with their LRN and basic details.',
    dataFrom: 'Enrolment (LIS).', feeds: ['SF2', 'SF9 (names and LRN)'],
  },
  {
    id: 'sf2', code: 'SF2', title: 'School Form 2 – Learner Daily Attendance Report',
    alsoCalled: ['sf2', 'attendance', 'daily attendance', 'attendance sheet'],
    preparedBy: 'Class adviser', teacherForm: true, source: 'do6',
    what: 'Daily attendance of each learner, month by month.',
    dataFrom: 'Daily checking of attendance.', feeds: ['SF9 attendance record', 'Perfect Attendance Award (KS1, DO 15 Annex H)'],
    tool: 'check_attendance',
  },
  {
    id: 'sf3', code: 'SF3', title: 'School Form 3 – Books Issued and Returned',
    alsoCalled: ['sf3', 'books issued', 'book inventory'], preparedBy: 'Class adviser', teacherForm: true, source: 'do6',
    what: 'Textbooks issued to and returned by each learner.', dataFrom: '', feeds: [],
  },
  {
    id: 'sf5', code: 'SF5', title: 'School Form 5 – Report on Promotion and Level of Proficiency',
    alsoCalled: ['sf5', 'promotion', 'promotion report', 'level of proficiency'], preparedBy: 'Class adviser', teacherForm: true, source: 'do6',
    what: 'End-of-year promotion status of each learner of the section.',
    dataFrom: 'Final Grades and General Averages (SF9).', feeds: ['SF10'],
    understand: 'Promotion follows DO 15, s. 2026 para. 67: all passed → promoted; 1–2 failed → Summer Remedial Class; more than 2 → retained.',
  },
  {
    id: 'sf5a', code: 'SF5A', title: 'School Form 5A – End of Semester and School Year Status',
    alsoCalled: ['sf5a'], preparedBy: 'Class adviser (SHS)', teacherForm: true, source: 'do6', what: 'Senior High School end-of-semester and school year status.', dataFrom: '', feeds: [],
  },
  {
    id: 'sf5b', code: 'SF5B', title: 'School Form 5B – List of Learners with Complete SHS Requirements',
    alsoCalled: ['sf5b'], preparedBy: 'Class adviser (SHS)', teacherForm: true, source: 'do6', what: 'Grade 12 learners who completed SHS requirements.', dataFrom: '', feeds: [],
  },
  {
    id: 'sf8', code: 'SF8', title: "School Form 8 – Learner's Basic Health and Nutrition Report",
    alsoCalled: ['sf8', 'health and nutrition', 'bmi', 'nutritional status'], preparedBy: 'Class adviser', teacherForm: true, source: 'do6',
    what: 'Height, weight, BMI and nutritional status of each learner.', dataFrom: 'Measurements.', feeds: [],
  },
  {
    id: 'sf10', code: 'SF10', title: "School Form 10 – Learner's Permanent Academic Record",
    alsoCalled: ['sf10', 'form 137', 'f137', 'permanent record'], preparedBy: 'Class adviser', teacherForm: true, source: 'do6',
    what: "Each learner's permanent record of final grades per school year.",
    dataFrom: 'Final Grades and General Average (SF9).', feeds: [],
  },
];

/** Forms NOT accomplished by teachers under DO 6, s. 2025 (handled by other school personnel). */
export const NOT_TEACHER_FORMS = ['SF4 (Monthly Learner\'s Movement and Attendance)', 'SF6 (Summarized Report on Promotion)', 'SF7 (School Personnel Assignment List)'];

const norm = (s) => ` ${String(s || '').toLowerCase().replace(/[^a-z0-9ñ\s']/g, ' ').replace(/\s+/g, ' ').trim()} `;

const GRADES_TALK = /\b(grades?|grading|marka|final grade|general average|ga|term grade|transmut|card|report card|sf ?9|promot|honou?rs?|excellence|consolidat)/i;

/** Form cards a request is about (by the words teachers use). */
export function formsFor(prompt) {
  const t = norm(prompt);
  const hits = SCHOOL_FORMS.filter((f) => [f.code, ...f.alsoCalled].some((w) => t.includes(` ${String(w).toLowerCase()} `) || t.includes(` ${String(w).toLowerCase()}s `)));
  // "consolidate (the) grades" without naming a form → the report card + class record cards.
  if (!hits.length && /consolidat|pagsamahin|i-?combine|summary of grades|summari[sz]e (the )?grades/i.test(prompt) && GRADES_TALK.test(prompt)) {
    hits.push(SCHOOL_FORMS.find((f) => f.id === 'sf9'), SCHOOL_FORMS.find((f) => f.id === 'class_record'));
  }
  return [...new Set(hits)];
}

/** True when the request is about grades/report cards (so the grading rules are relevant). */
export function talksAboutGrades(prompt) {
  return GRADES_TALK.test(String(prompt || ''));
}

/** Compact knowledge text for the planner, or '' when nothing is relevant. */
export function formKnowledgeFor(prompt, { role = '' } = {}) {
  const cards = formsFor(prompt);
  if (!cards.length) return '';
  const lines = ['School forms knowledge (DepEd; use it to understand what the teacher means):'];
  for (const f of cards) {
    lines.push(`- ${f.title}: ${f.what} Prepared by: ${f.preparedBy}. Data from: ${f.dataFrom || '—'}${f.feeds?.length ? ` Feeds: ${f.feeds.join(', ')}.` : ''}${f.tool ? ` KaTuroDesk tool: ${f.tool}.` : ''}${f.understand ? ` ${f.understand}` : ''}`);
  }
  if (role) lines.push(`The teacher's role: ${role}.`);
  if (/\bsf ?(4|6|7)\b/i.test(prompt)) lines.push(`Note: ${NOT_TEACHER_FORMS.join(', ')} are not teacher forms under ${FORM_SOURCES.do6}.`);
  return lines.join('\n');
}
