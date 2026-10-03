/**
 * docBuilders.js — long DepEd documents written in PARALLEL parts.
 *
 * One giant AI call for a DLL or a TOS + test takes the longest of anything the
 * desk does. Here a short "frame" call plans the document, then each day (DLL) or
 * each competency (TOS) is written at the same time, and code assembles the exact
 * DepEd layout. All counts and item numbers are computed in code.
 * Each builder returns { spec, warnings }, or throws so the caller can fall back to
 * the single-call path. Missing data (e.g. number of items) throws NEEDS_INFO: never assumed.
 */

import { normalizeDocumentSpec } from '../docSpec.js';

const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
const PROCEDURES = [
  ['A', 'Reviewing previous lesson or presenting the new lesson'],
  ['B', 'Establishing a purpose for the lesson'],
  ['C', 'Presenting examples/instances of the new lesson'],
  ['D', 'Discussing new concepts and practicing new skills #1'],
  ['E', 'Discussing new concepts and practicing new skills #2'],
  ['F', 'Developing mastery (leads to Formative Assessment 3)'],
  ['G', 'Finding practical applications of concepts and skills in daily living'],
  ['H', 'Making generalizations and abstractions about the lesson'],
  ['I', 'Evaluating learning'],
  ['J', 'Additional activities for application or remediation'],
];
const REFLECTION = [
  'A. No. of learners who earned 80% in the evaluation',
  'B. No. of learners who require additional activities for remediation',
  'C. Did the remedial lessons work? No. of learners who have caught up with the lesson',
  'D. No. of learners who continue to require remediation',
  'E. Which of my teaching strategies worked well? Why did these work?',
  'F. What difficulties did I encounter which my principal or supervisor can help me solve?',
  'G. What innovation or localized materials did I use/discover which I wish to share with other teachers?',
];

export const BLOOM_LEVELS = ['remembering', 'understanding', 'applying', 'analyzing', 'evaluating', 'creating'];
const BLOOM_LABELS = ['Remembering', 'Understanding', 'Applying', 'Analyzing', 'Evaluating', 'Creating'];
// Easy 60% / Average 30% / Difficult 10%, spread over the six levels.
export const DEFAULT_BLOOM_PERCENT = { remembering: 30, understanding: 30, applying: 15, analyzing: 15, evaluating: 5, creating: 5 };

const str = (v) => (v === null || v === undefined ? '' : String(v).trim());

function needsInfo(question) {
  const e = new Error(question);
  e.code = 'NEEDS_INFO';
  return e;
}

/** Splits `total` into integer parts proportional to `weights` (largest remainder; parts sum exactly to total). */
export function apportion(total, weights) {
  const w = weights.map((x) => Math.max(0, Number(x) || 0));
  const sum = w.reduce((a, b) => a + b, 0);
  if (!total || !sum) return w.map(() => 0);
  const exact = w.map((x) => (x / sum) * total);
  const parts = exact.map(Math.floor);
  let left = total - parts.reduce((a, b) => a + b, 0);
  const order = exact.map((x, i) => [x - Math.floor(x), i]).sort((a, b) => b[0] - a[0] || a[1] - b[1]);
  for (let k = 0; left > 0; k = (k + 1) % order.length) {
    parts[order[k][1]] += 1;
    left -= 1;
  }
  return parts;
}

/** Runs async jobs with a concurrency cap; one retry per failed job. */
async function parallel(items, limit, job) {
  const out = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      try {
        out[i] = await job(items[i], i);
      } catch {
        out[i] = await job(items[i], i); // one retry; a second failure propagates
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

// ─────────────────────────── DLL ───────────────────────────

/**
 * ctx: agent ctx (llm, masker, teacher, docPersona). source: { text, visionParts } from the source files.
 */
export async function buildDllParallel({ ctx, title, instructions, subject, gradeLevel, curriculum, source, report }) {
  report?.('Planning the week…');
  const frame = await ctx.llm({
    system: `${ctx.docPersona}\nYou plan DepEd Daily Lesson Logs (DO 42, s. 2016) aligned with the MATATAG curriculum.`,
    prompt: `Plan one week of a Daily Lesson Log. Return ONLY JSON:
{"title": string, "gradeLevel": string, "learningArea": string, "quarter": string, "teachingDates": string ("" unless the teacher gave dates),
 "contentStandard": string, "performanceStandard": string,
 "days": [{"day": "Monday", "competency": string (with code if known), "topic": string}],
 "resources": {"teachersGuide": string, "learnersMaterials": string, "textbook": string, "additional": string, "other": string}}
Use 5 days (Monday–Friday) unless the teacher asks for fewer. Use "" for anything not given (quarter, dates, resource page numbers). Put a competency code only if it appears in the official list or the source files.
${subject ? `Learning area: ${subject}\n` : ''}${gradeLevel ? `Grade level: ${gradeLevel}\n` : ''}${curriculum ? `${curriculum}\n` : ''}Teacher's instructions: ${ctx.masker.mask(instructions)}${source.text ? `\n\nSource files (use their actual content):\n${source.text}` : ''}`,
    parts: source.visionParts,
    json: true,
    maxTokens: 2500,
  });
  const days = (Array.isArray(frame?.days) ? frame.days : []).slice(0, 5).filter((d) => d && (d.topic || d.competency));
  if (!days.length) throw new Error('DLL plan had no days');

  report?.(`Writing ${days.length} days at the same time…`);
  const written = await parallel(days, 5, async (d, i) => {
    const res = await ctx.llm({
      system: `${ctx.docPersona}\nYou write one day of a DepEd Daily Lesson Log: concrete, classroom-ready activities with time allotments.`,
      prompt: `Week plan: ${JSON.stringify({ learningArea: frame.learningArea, gradeLevel: frame.gradeLevel, contentStandard: frame.contentStandard, performanceStandard: frame.performanceStandard, days })}
Write ${str(d.day) || DAY_NAMES[i]} only. Return ONLY JSON:
{"objectives": string (2-3 specific objectives), "content": string, "procedures": {"A": string, "B": string, "C": string, "D": string, "E": string, "F": string, "G": string, "H": string, "I": string (include 3-5 short evaluation items), "J": string}}
Each procedure: 1-3 sentences, specific to this day's topic "${str(d.topic)}". No markdown symbols.`,
      json: true,
      maxTokens: 2500,
    });
    if (!res?.procedures || typeof res.procedures !== 'object') throw new Error(`Day ${i + 1} incomplete`);
    return res;
  });

  const unmask = (v) => ctx.masker.unmask(str(v));
  const dayNames = days.map((d, i) => str(d.day) || DAY_NAMES[i]);
  const same = (v) => {
    const t = unmask(v);
    return days.map((_, i) => (i === 0 || t.length <= 250 ? t : 'Same as Monday'));
  };
  const blank = () => days.map(() => '');
  const res = frame.resources || {};
  const rows = [
    ['I. OBJECTIVES', ...blank()],
    ['A. Content Standards', ...same(frame.contentStandard)],
    ['B. Performance Standards', ...same(frame.performanceStandard)],
    ['C. Learning Competencies/Objectives', ...days.map((d, i) => [unmask(d.competency), unmask(written[i].objectives)].filter(Boolean).join('\n'))],
    ['II. CONTENT', ...days.map((d, i) => unmask(written[i].content) || unmask(d.topic))],
    ['III. LEARNING RESOURCES', ...blank()],
    ['A. References', ...blank()],
    ["1. Teacher's Guide pages", ...same(res.teachersGuide)],
    ["2. Learner's Materials pages", ...same(res.learnersMaterials)],
    ['3. Textbook pages', ...same(res.textbook)],
    ['4. Additional Materials from Learning Resource (LR) portal', ...same(res.additional)],
    ['B. Other Learning Resources', ...same(res.other)],
    ['IV. PROCEDURES', ...blank()],
    ...PROCEDURES.map(([k, label]) => [`${k}. ${label}`, ...written.map((w) => unmask(w.procedures?.[k]))]),
    ['V. REMARKS', ...blank()],
    ['VI. REFLECTION', ...blank()],
    ...REFLECTION.map((q) => [q, ...blank()]),
  ];

  const warnings = [];
  const given = `${curriculum || ''}\n${source.text || ''}`.toLowerCase();
  const csGiven = str(frame.contentStandard) && given.includes(str(frame.contentStandard).toLowerCase().slice(0, 40));
  if (str(frame.contentStandard) && !csGiven) {
    warnings.push('The content and performance standards were written by the AI (they were not in your files or the official list I have). Please check them against your curriculum guide.');
  }
  const spec = normalizeDocumentSpec({
    title: title || unmask(frame.title) || 'Daily Lesson Log',
    orientation: 'landscape',
    meta: [
      { label: 'School', value: ctx.teacher.school },
      { label: 'Grade Level', value: unmask(frame.gradeLevel) || gradeLevel },
      { label: 'Teacher', value: ctx.teacher.fullName },
      { label: 'Learning Area', value: unmask(frame.learningArea) || subject },
      { label: 'Teaching Dates and Time', value: unmask(frame.teachingDates) },
      { label: 'Quarter', value: unmask(frame.quarter) },
    ].filter((m) => m.value),
    blocks: [{ type: 'table', columns: ['', ...dayNames], rows, widths: [2.2, ...days.map(() => 1)] }],
  });
  return { spec, warnings };
}

// ─────────────────────────── TOS + test ───────────────────────────

/** Item allocation for a TOS: weights by days, items per competency and per Bloom level (all exact integers). */
export function allocateTos(competencies, totalItems, bloomPercent = DEFAULT_BLOOM_PERCENT) {
  const days = competencies.map((c) => Math.max(1, Number(c.days) || 1));
  const totalDays = days.reduce((a, b) => a + b, 0);
  const itemsPer = apportion(totalItems, days);
  const levelWeights = BLOOM_LEVELS.map((l) => Number(bloomPercent?.[l]) || 0);
  const useWeights = levelWeights.some((x) => x > 0) ? levelWeights : BLOOM_LEVELS.map((l) => DEFAULT_BLOOM_PERCENT[l]);
  return competencies.map((c, i) => ({
    competency: str(c.competency),
    code: str(c.code),
    days: days[i],
    percent: Math.round((days[i] / totalDays) * 10000) / 100,
    items: itemsPer[i],
    levels: apportion(itemsPer[i], useWeights),
  }));
}

function placementText(numbers) {
  if (!numbers.length) return '';
  const ranges = [];
  let start = numbers[0];
  let prev = numbers[0];
  for (const n of numbers.slice(1).concat([null])) {
    if (n === prev + 1) {
      prev = n;
      continue;
    }
    ranges.push(start === prev ? `${start}` : `${start}–${prev}`);
    start = n;
    prev = n;
  }
  return ranges.join(', ');
}

export async function buildTosParallel({ ctx, title, instructions, subject, gradeLevel, curriculum, source, report }) {
  report?.('Planning the Table of Specifications…');
  const frame = await ctx.llm({
    system: `${ctx.docPersona}\nYou prepare DepEd Tables of Specifications based on Bloom's Revised Taxonomy.`,
    prompt: `Return ONLY JSON:
{"title": string, "learningArea": string, "gradeLevel": string, "quarter": string, "totalItems": number or null,
 "competencies": [{"competency": string, "code": string, "days": number or null}],
 "bloomPercent": {"remembering": n, "understanding": n, "applying": n, "analyzing": n, "evaluating": n, "creating": n} or null}
totalItems = the number of test items the teacher stated, or null if they did not say. bloomPercent = the teacher's Bloom distribution, or null if not given. days = instructional days per competency ONLY if the teacher or the files give them, else null. code = only if it appears in the official list or the files, else "".
${subject ? `Learning area: ${subject}\n` : ''}${gradeLevel ? `Grade level: ${gradeLevel}\n` : ''}${curriculum ? `${curriculum}\n` : ''}Teacher's instructions: ${ctx.masker.mask(instructions)}${source.text ? `\n\nSource files:\n${source.text}` : ''}`,
    parts: source.visionParts,
    json: true,
    maxTokens: 2000,
  });
  const comps = (Array.isArray(frame?.competencies) ? frame.competencies : []).filter((c) => c && str(c.competency)).slice(0, 15);
  if (!comps.length) throw needsInfo('Which learning competencies should the test cover? Attach your lesson/curriculum file or list them.');
  const statedItems = Math.round(Number(frame?.totalItems));
  if (!Number.isFinite(statedItems) || statedItems < 1) throw needsInfo('How many items should the test have? (e.g. 30 or 50)');
  const totalItems = Math.min(100, statedItems);
  const warnings = [];
  if (statedItems > 100) warnings.push(`I capped the test at 100 items (you asked for ${statedItems}).`);
  const daysGiven = comps.every((c) => Number(c.days) > 0);
  if (!daysGiven) {
    comps.forEach((c) => { c.days = 1; });
    warnings.push('No instructional days were given, so every competency has equal weight. Tell me the days per competency to weight them properly.');
  }
  const bloomGiven = frame?.bloomPercent && BLOOM_LEVELS.some((l) => Number(frame.bloomPercent[l]) > 0);
  if (!bloomGiven) warnings.push("Bloom's levels use the common DepEd 60-30-10 spread (easy 60%, average 30%, difficult 10%). Tell me if your school uses a different distribution.");
  const plan = allocateTos(comps, totalItems, bloomGiven ? frame.bloomPercent : DEFAULT_BLOOM_PERCENT);

  report?.(`Writing items for ${plan.filter((p) => p.items).length} competencies at the same time…`);
  const groups = await parallel(plan, 5, async (row) => {
    if (!row.items) return [];
    const wanted = BLOOM_LEVELS.map((l, i) => [l, row.levels[i]]).filter(([, n]) => n > 0);
    const res = await ctx.llm({
      system: `${ctx.docPersona}\nYou write valid, unambiguous multiple-choice test items for DepEd learners.`,
      prompt: `Learning competency: ${row.competency}${row.code ? ` (${row.code})` : ''}
${frame.learningArea || subject ? `Learning area: ${frame.learningArea || subject}. ` : ''}${frame.gradeLevel || gradeLevel ? `Grade level: ${frame.gradeLevel || gradeLevel}.` : ''}
Write EXACTLY these items by Bloom level: ${wanted.map(([l, n]) => `${n} ${l}`).join(', ')}.
Return ONLY JSON {"items": [{"level": one of ${JSON.stringify(BLOOM_LEVELS)}, "question": string, "choices": [4 strings], "answer": string (must equal one of the choices)}]}.
${source.text ? `Base the items on this material:\n${source.text.slice(0, 6000)}` : ''}`,
      json: true,
      maxTokens: 400 + row.items * 220,
    });
    const items = (Array.isArray(res?.items) ? res.items : [])
      .filter((q) => q && str(q.question) && Array.isArray(q.choices) && q.choices.length >= 2)
      .map((q) => ({
        level: BLOOM_LEVELS.includes(q.level) ? q.level : wanted[0][0],
        question: ctx.masker.unmask(str(q.question)),
        choices: q.choices.slice(0, 4).map((c) => ctx.masker.unmask(str(c))),
        answer: ctx.masker.unmask(str(q.answer)),
      }));
    if (items.length < Math.ceil(row.items * 0.8)) throw new Error(`Too few items for "${row.competency}"`);
    return items.slice(0, row.items);
  });

  // The TOS must describe the test as actually written: recount from the items.
  let n = 0;
  const tosRows = [];
  const allItems = [];
  plan.forEach((row, i) => {
    const items = groups[i] || [];
    const numbers = items.map(() => ++n);
    allItems.push(...items);
    const counts = BLOOM_LEVELS.map((l) => items.filter((q) => q.level === l).length);
    tosRows.push({ ...row, items: items.length, counts, placement: placementText(numbers) });
  });
  const written = allItems.length;
  if (!written) throw new Error('No test items were written');
  const levelTotals = BLOOM_LEVELS.map((_, li) => tosRows.reduce((a, r) => a + r.counts[li], 0));
  const totalDays = tosRows.reduce((a, r) => a + r.days, 0);

  const table = {
    type: 'table',
    columns: ['Learning Competency', 'No. of Days', '% Weight', 'No. of Items', ...BLOOM_LABELS, 'Item Placement'],
    rows: [
      ...tosRows.map((r) => [`${r.competency}${r.code ? ` (${r.code})` : ''}`, String(r.days), `${r.percent}%`, String(r.items), ...r.counts.map(String), r.placement]),
      ['TOTAL', String(totalDays), '100%', String(written), ...levelTotals.map(String), `1–${written}`],
    ],
    widths: [3, 0.8, 0.8, 0.8, 0.9, 0.9, 0.9, 0.9, 0.9, 0.9, 1.2],
  };

  if (written < totalItems) warnings.push(`Only ${written} of the ${totalItems} requested items could be written; the TOS shows the items actually in the test.`);
  const spec = normalizeDocumentSpec({
    title: title || str(frame.title) || 'Table of Specifications and Test',
    orientation: 'landscape',
    meta: [
      { label: 'School', value: ctx.teacher.school },
      { label: 'Learning Area', value: str(frame.learningArea) || subject },
      { label: 'Grade Level', value: str(frame.gradeLevel) || gradeLevel },
      { label: 'Quarter', value: str(frame.quarter) },
      { label: 'No. of Items', value: String(written) },
    ].filter((m) => m.value),
    blocks: [
      { type: 'heading', level: 2, text: 'Table of Specifications' },
      table,
      { type: 'pageBreak' },
      { type: 'heading', level: 2, text: str(frame.title) || 'Test' },
      { type: 'paragraph', text: '**Directions:** Read each question carefully. Choose the letter of the correct answer.' },
      { type: 'questions', items: allItems.map(({ question, choices, answer }) => ({ question, choices, answer })), showAnswers: true },
    ],
  });
  return { spec, warnings };
}
