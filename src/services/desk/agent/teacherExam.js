/**
 * teacherExam.js — a fixed set of real teacher requests with the right behavior for
 * each (ask, answer, or run a specific tool). The admin runs it from Desk Settings
 * after changing the planner, the knowledge base or the rule cards, to see whether
 * KaTuroDesk still understands teachers and still asks instead of assuming.
 *
 * The exam uses the same planner prompt and the same decideAction() as a real chat
 * turn, with made-up file names only (no learner data). Nothing is run or saved.
 */
import { callDeskLLM } from './llm.js';
import { buildFileIndex, buildPlannerSystem, buildPlannerPrompt, sanitizePlan } from './planner.js';
import { fastRoute } from './fastRoute.js';
import { teacherFromProfile, personaFor, plannerKnowledge, readPlanCheck, decideAction, schoolYearFor } from './deskAgent.js';

const file = (path, size = 24000) => ({ kind: 'file', path, name: path.split('/').pop(), size, lastModified: 0 });

/** Sample folder (file names only, nothing is opened). */
export const EXAM_FILES = [
  'Grades/Grade 5 Rizal - Math Term 1.xlsx',
  'Grades/Grade 5 Rizal - English Term 1.xlsx',
  'Grades/Grade 5 Rizal - Science Term 1.xlsx',
  'Grades/Grade 6 Mabini - Math Term 1.xlsx',
  'Grades/Grade 6 Mabini - English Term 1.xlsx',
  'Grade 7 Sampaguita - Quiz 1 Scores.xlsx',
  'Class Record Grade 7 Science.xlsx',
  'SF1 Grade 7 Sampaguita.xlsx',
  'Attendance/SF2 August.xlsx',
  'Lesson Notes Photosynthesis.docx',
  'Memo 2026-114.pdf',
  'Seminar Certificate.pdf',
].map((p) => file(p));

const ADVISER = { advisoryClass: 'Grade 5 - Rizal', teachingLoad: 'Math 5, English 5' };
const SCIENCE7 = { teachingLoad: 'Science 7' };
const TWO_LOADS = { teachingLoad: 'Math 4, Science 4' };
const RUN = ['run', 'confirm'];

/**
 * expect.action: outcomes that pass. expect.tools: for run/confirm, at least one
 * planned task must use one of these tools.
 */
export const EXAM_CASES = [
  { id: 'greet', topic: 'Greeting', prompt: 'Good morning po', expect: { action: ['answer'] } },
  { id: 'thanks', topic: 'Greeting', prompt: 'thank you po', expect: { action: ['answer'] } },
  { id: 'dll-bare', topic: 'Lesson plans', prompt: 'gawa ka ng DLL', profile: SCIENCE7, expect: { action: ['ask'] } },
  { id: 'dll-full', topic: 'Lesson plans', prompt: 'Make a DLL for Science 7, Week 3, topic: Photosynthesis', profile: SCIENCE7, expect: { action: RUN, tools: ['write_document'] } },
  { id: 'dlp-math8', topic: 'Lesson plans', prompt: 'Make a DLP for Math 8 on linear equations in two variables, 60 minutes', expect: { action: RUN, tools: ['write_document'] } },
  { id: 'worksheet-bare', topic: 'Lesson plans', prompt: 'gawa ka ng worksheet', profile: TWO_LOADS, expect: { action: ['ask'] } },
  { id: 'quiz-full', topic: 'Assessment', prompt: 'Make a 10-item multiple choice quiz on adding dissimilar fractions for Grade 4 Math', expect: { action: RUN, tools: ['write_document'] } },
  { id: 'quiz-bare', topic: 'Assessment', prompt: 'make a quiz', expect: { action: ['ask'] } },
  { id: 'tos-bare', topic: 'Assessment', prompt: 'make a TOS', expect: { action: ['ask'] } },
  { id: 'item-analysis', topic: 'Assessment', prompt: 'item analysis please', attached: ['Grade 7 Sampaguita - Quiz 1 Scores.xlsx'], expect: { action: RUN, tools: ['analyze_scores'] } },
  { id: 'remedial', topic: 'Assessment', prompt: 'make a remedial package for the learners who did poorly in this quiz', attached: ['Grade 7 Sampaguita - Quiz 1 Scores.xlsx'], expect: { action: RUN, tools: ['make_remedial_package', 'analyze_scores'] } },
  { id: 'consolidate-advisory', topic: 'Grades', prompt: 'pa-consolidate ng grades ng advisory class ko para sa report card', profile: ADVISER, expect: { action: RUN, tools: ['build_report_cards'] } },
  { id: 'consolidate-which', topic: 'Grades', prompt: 'consolidate the grades for the report cards', expect: { action: ['ask'] } },
  { id: 'report-card-rizal', topic: 'Grades', prompt: 'report cards for Grade 5 Rizal, Term 1', expect: { action: RUN, tools: ['build_report_cards'] } },
  { id: 'combine-files', topic: 'Grades', prompt: 'combine the three Grade 5 Rizal grade files into one sheet', expect: { action: RUN, tools: ['consolidate_files', 'build_report_cards', 'make_spreadsheet'] } },
  { id: 'final-grade-nofile', topic: 'Grades', prompt: 'compute the final grade of my learner', expect: { action: ['ask'] } },
  { id: 'transfer', topic: 'Encoding', prompt: 'transfer the Quiz 1 scores of Grade 7 Sampaguita into my Class Record Grade 7 Science', expect: { action: RUN, tools: ['transfer_data', 'encode_scores'] } },
  { id: 'sf1-edit', topic: 'School forms', prompt: 'In the SF1 Grade 7 Sampaguita, put T/O in the remarks of the learner in row 12', expect: { action: RUN, tools: ['edit_file'] } },
  { id: 'attendance', topic: 'School forms', prompt: 'check the attendance, who has the most absences?', attached: ['Attendance/SF2 August.xlsx'], expect: { action: RUN, tools: ['check_attendance'] } },
  { id: 'sf4-question', topic: 'Knowledge', prompt: 'Do I need to prepare SF4 as a class adviser?', expect: { action: ['answer'] } },
  { id: 'passing-grade', topic: 'Knowledge', prompt: 'What is the passing grade under the new grading system?', expect: { action: ['answer'] } },
  { id: 'grade1-descriptive', topic: 'Knowledge', prompt: 'Do Grade 1 learners get numerical grades this school year?', expect: { action: ['answer'] } },
  { id: 'term-end', topic: 'Knowledge', prompt: 'When does Term 1 end?', expect: { action: ['answer'] } },
  { id: 'end-of-term-block', topic: 'Knowledge', prompt: 'What are teachers supposed to do during the End-of-Term Block?', expect: { action: ['answer'] } },
  { id: 'slides-full', topic: 'Materials', prompt: 'Make slides about the water cycle for Grade 4 Science', expect: { action: RUN, tools: ['make_slides'] } },
  { id: 'slides-bare', topic: 'Materials', prompt: 'make slides', expect: { action: ['ask'] } },
  { id: 'letter', topic: 'Writing', prompt: 'Write a letter to parents about the parent-teacher meeting on December 12, 2026 at 2:00 PM in the school covered court', expect: { action: RUN, tools: ['write_document'] } },
  { id: 'summarize', topic: 'Writing', prompt: 'summarize this memo', attached: ['Memo 2026-114.pdf'], expect: { action: ['answer', ...RUN], tools: ['answer_from_files', 'read_files', 'understand_file', 'write_document'] } },
  { id: 'to-pdf', topic: 'Files', prompt: 'convert Lesson Notes Photosynthesis to PDF', expect: { action: RUN, tools: ['convert_to_pdf'] } },
  { id: 'merge', topic: 'Files', prompt: 'merge the memo and the seminar certificate into one PDF', expect: { action: RUN, tools: ['merge_pdfs'] } },
];

/** 'ask' when the plan asks a question (with or without tasks), else the decision. */
export function examOutcome(decision, check, reply = '') {
  if (decision.action !== 'answer') return decision.action;
  const asks = check && (check.confidence === 'low' || check.missing.length || check.choices.length);
  return asks || /\?\s*$/.test(String(reply).trim()) ? 'ask' : 'answer';
}

/** Pass or fail for one case. → { pass, why } */
export function gradeCase(c, outcome, tasks = []) {
  if (!c.expect.action.includes(outcome)) return { pass: false, why: `expected ${c.expect.action.join(' or ')}, got ${outcome}` };
  if (RUN.includes(outcome) && c.expect.tools && !tasks.some((t) => c.expect.tools.includes(t.tool))) {
    return { pass: false, why: `expected ${c.expect.tools.join(' or ')}, planned ${tasks.map((t) => t.tool).join(', ') || 'nothing'}` };
  }
  return { pass: true, why: '' };
}

/** What KaTuroDesk would do for one case. `call` is callDeskLLM (replaceable in tests). */
export async function examineCase(c, { call = callDeskLLM, cards = [], now = new Date(), user = { displayName: 'Ana Santos' } } = {}) {
  const teacher = teacherFromProfile({ ...(c.profile || {}) }, user);
  const attachedPaths = c.attached || [];
  const fast = fastRoute({ prompt: c.prompt, attachedPaths, persona: 'matt', teacherName: teacher.salutation, now });
  if (fast?.local) return { outcome: 'answer', tasks: [], reply: fast.reply, fast: true };
  let plan;
  if (fast) plan = { reply: fast.reply, tasks: fast.tasks };
  else {
    plan = await call({
      kind: 'plan',
      system: `${buildPlannerSystem({ persona: personaFor(teacher, 'matt', now), teacherName: teacher.salutation, today: now.toDateString() })}\n\n${teacher.facts}`,
      history: [],
      prompt: buildPlannerPrompt({
        prompt: c.prompt,
        workspaceName: 'Sample folder',
        fileIndex: buildFileIndex(EXAM_FILES, { attachedPaths }),
        attachedPaths,
        privacyOn: true,
        knowledge: plannerKnowledge(c.prompt, [], schoolYearFor(now), now, cards),
      }),
      json: true,
      maxTokens: 2000,
      temperature: 0.2,
    });
  }
  const { tasks } = sanitizePlan(plan, EXAM_FILES, attachedPaths);
  const check = fast ? null : readPlanCheck(plan);
  const decision = decideAction({ tasks, check, prompt: c.prompt, teacher });
  return { outcome: examOutcome(decision, check, plan?.reply), tasks, reply: String(plan?.reply || '') };
}

/**
 * Runs the exam one case at a time. onProgress(row) after each case.
 * → { passed, total, score (0–100), rows: [{ id, topic, prompt, outcome, tools, pass, why }] }
 */
export async function runTeacherExam({ cases = EXAM_CASES, onProgress, signal, ...opts } = {}) {
  const rows = [];
  for (const c of cases) {
    if (signal?.aborted) break;
    let row;
    try {
      const r = await examineCase(c, opts);
      row = { id: c.id, topic: c.topic, prompt: c.prompt, outcome: r.outcome, tools: [...new Set(r.tasks.map((t) => t.tool))], ...gradeCase(c, r.outcome, r.tasks) };
    } catch (e) {
      row = { id: c.id, topic: c.topic, prompt: c.prompt, outcome: 'error', tools: [], pass: false, why: e?.message || 'AI error' };
    }
    rows.push(row);
    onProgress?.(row);
  }
  const passed = rows.filter((r) => r.pass).length;
  return { passed, total: rows.length, score: rows.length ? Math.round((passed / rows.length) * 100) : 0, rows };
}
