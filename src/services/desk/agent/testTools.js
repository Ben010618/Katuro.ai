/**
 * testTools.js — make_test: a whole Test for one class in one go.
 *
 *   "Make a 20-item quiz for Grade 7 - Rizal - Science on mixtures, counts as Written Work 3"
 *     → the AI writes the questions (JSON; topic and instructions masked), code checks them,
 *     → Lessons/Tests/<class>/<title>/ (in the KaTuro folder; elsewhere Bubble Quizzes/…):
 *         <title> - Test.docx, <title> - Answer Key.docx, <title> - Bubble Sheets.pdf (one per learner
 *         of the class record), KaTuro bubble quiz.json (the manifest: class, record file and column),
 *         KaTuro check.json (the key), Photos/
 *
 * Nothing is guessed: the class (a ready E-Class Record in Records), the topic, the number of
 * items and the record column must be given, or KaTuro asks.
 */

import { normalizeDocumentSpec } from '../docSpec.js';
import { readClassRecord } from '../records/recordSheet.js';
import { isClassRecordPath, classNameOfRecord, parseClassRecordFileName, checkClassList, readinessText } from '../records/classRecords.js';
import { needsInfo, gatherSourceText, headerFor, teacherSignatures, baseMeta } from './tools.js';
import { GROUNDING_RULES } from './grounding.js';

const LETTERS = ['A', 'B', 'C', 'D', 'E'];
const clean = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
const stripLetter = (s) => clean(s).replace(/^\(?[A-Ea-e][.)]\s+/, '');

/**
 * The AI's test, checked: N items, each with a question, `choices` distinct non-empty choices
 * and an answer that is one of the letters.
 *   raw: { title, directions, items: [{ question, choices: [...], answer: 'A' }] }
 * → { ok: true, test: { title, directions, items } } or { ok: false, problems: [text] }
 */
export function validateTestJson(raw, { items, choices }) {
  const problems = [];
  const letters = LETTERS.slice(0, choices);
  const list = Array.isArray(raw?.items) ? raw.items : [];
  if (list.length < items) problems.push(`There are ${list.length} items, but ${items} were asked for.`);
  const out = list.slice(0, items).map((it, i) => {
    const n = i + 1;
    const question = clean(it?.question);
    const opts = (Array.isArray(it?.choices) ? it.choices : []).map(stripLetter);
    if (!question) problems.push(`Item ${n} has no question.`);
    if (opts.length !== choices || opts.some((c) => !c)) problems.push(`Item ${n} needs exactly ${choices} choices.`);
    else if (new Set(opts.map((c) => c.toLowerCase())).size !== opts.length) problems.push(`Item ${n} has the same choice twice.`);
    // The answer: a letter ("B", "b.", "(B)"), or the text of one of the choices.
    const a = clean(it?.answer);
    let answer = (a.match(/^\(?([A-Ea-e])\)?\.?$/) || [])[1]?.toUpperCase() || null;
    if (!answer && a) {
      const j = opts.findIndex((c) => c.toLowerCase() === stripLetter(a).toLowerCase());
      if (j >= 0) answer = letters[j];
    }
    if (!answer || !letters.includes(answer)) problems.push(`Item ${n}: the answer must be one of ${letters.join(', ')}.`);
    return { question, choices: opts, answer };
  });
  if (problems.length) return { ok: false, problems };
  return { ok: true, test: { title: clean(raw?.title), directions: clean(raw?.directions), items: out } };
}

/** "ww3", "WW 3", "Written Work 3", "Written Works 3", "PT1", "Quarterly Assessment", "QA" → a column key. */
export function columnKeyFrom(text) {
  let t = String(text || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
  t = t.replace(/^writtenworks?/, 'ww').replace(/^performancetasks?/, 'pt').replace(/^(quarterlyassessment|quarterlyexam(ination)?|periodicaltest|periodicalexam|quarterlytest)/, 'qa');
  if (t === 'qa') return 'qa1';
  return /^(ww|pt|qa)\d{1,2}$/.test(t) ? t : '';
}

const columnLabelOf = (c) => (c.component === 'qa' ? c.componentLabel : `${c.componentLabel} ${c.n}`);

/** One of the per-page settings that fits this many items (bigger sheets when needed). */
async function sheetSettings(items, choices) {
  const { capacities } = await import('../bubble/layout.js');
  const caps = capacities('a4', choices);
  const perPage = [4, 2, 1].find((k) => items <= caps[k]) || 1;
  return { paper: 'a4', perPage };
}

export const TEST_TOOLS = {
  make_test: {
    label: 'Make a test',
    description: "Make a whole TEST (or quiz) for one of the teacher's classes, ready to give and check with the KaTuro App: AI writes the multiple-choice questions (4 or 5 choices) on the topic or lesson, then KaTuroDesk saves the test paper (Word), the answer key (Word) and bubble sheets printed with each learner's name and LRN from the class record (PDF) in the test's own folder (Lessons/Tests/<class>/<title>), with the key and the record column remembered so the phone can scan the sheets and record the scores. recordPath = the class's E-Class Record in Records; column = where the scores go (e.g. \"Written Work 3\", \"PT 1\", \"Quarterly Assessment\").",
    args: '{ "recordPath": string, "topic": string, "items": number, "choices"?: 4|5, "column": string, "title"?: string, "instructions"?: string, "sourcePaths"?: [string], "subject"?: string, "gradeLevel"?: string }',
    async run({ recordPath, topic = '', items, choices = 4, column, title = '', instructions = '', sourcePaths = [], subject, gradeLevel }, ctx, report) {
      // 1. What the teacher must say (never guessed).
      const records = ctx.allFiles().map((f) => f.path).filter(isClassRecordPath);
      if (!isClassRecordPath(recordPath)) {
        throw needsInfo(records.length
          ? `Which class is this test for? Your class records: ${records.slice(0, 6).map(classNameOfRecord).join('; ')}.`
          : 'Which class is this test for? Set up the class record first (Records/Grade 7 - Rizal - Science.xlsx): tell me the grade, section and subject, and attach your class list.');
      }
      if (!clean(topic) && !sourcePaths.length) throw needsInfo('What topic or lesson should the test cover?');
      const n = Number(items);
      if (!Number.isInteger(n) || n < 1 || n > 100) throw needsInfo('How many items should the test have (1 to 100)?');
      const k = Number(choices) === 5 ? 5 : 4;

      // 2. The class record: its learners (for the sheets) and the column the scores go to.
      report(`Reading ${recordPath.split('/').pop()}…`);
      const record = readClassRecord(await ctx.readParsed(recordPath));
      if (record.error) throw needsInfo(`${recordPath.split('/').pop()}: ${record.error} Tests are made for a class with a DepEd E-Class Record in Records.`);
      if (!record.ready) throw needsInfo(readinessText(recordPath.split('/').pop(), checkClassList(record.learners)));
      const choicesText = record.columns.filter((c) => c.component !== 'qa' || c.n === 1).slice(0, 25).map(columnLabelOf);
      const key = columnKeyFrom(column);
      const col = key ? record.columns.find((c) => c.key === key) : null;
      if (!col) {
        throw needsInfo(`${column ? `I could not find "${column}" in ${recordPath.split('/').pop()}. ` : ''}Which column should this test's scores go to? For example: ${choicesText.filter((_, i) => i % 3 === 0).slice(0, 5).join(', ')}.`);
      }
      const columnLabel = columnLabelOf(col);
      const className = classNameOfRecord(recordPath);
      const cls = parseClassRecordFileName(recordPath) || {};
      const area = subject || cls.subject;
      const grade = gradeLevel || cls.gradeLevel;

      // 3. The questions (AI; the teacher's words masked), checked by code; one retry.
      report(sourcePaths.length ? `Reading ${sourcePaths.length} source file(s)…` : 'Writing the questions…');
      const { text, visionParts } = await gatherSourceText(sourcePaths, ctx);
      const curriculum = ctx.curriculumHint(area, grade, `${topic} ${instructions}`);
      const letters = LETTERS.slice(0, k).join(', ');
      const ask = (fix = '') => ctx.llm({
        system: `You are KaTuro, a DepEd (Philippines) co-teacher who writes fair, clear multiple-choice tests aligned with the MATATAG curriculum.\n${GROUNDING_RULES}`,
        prompt: [
          `Write a ${n}-item multiple-choice test${area ? ` in ${area}` : ''}${grade ? ` for ${grade}` : ''}.`,
          clean(topic) ? `Topic / lesson: ${ctx.masker.mask(clean(topic))}` : '',
          instructions ? `Teacher's instructions: ${ctx.masker.mask(instructions)}` : '',
          title ? `Title: ${ctx.masker.mask(title)}` : '',
          curriculum,
          text ? `\nSource files (use their actual content):\n${text}` : '',
          `\nReturn ONLY JSON: {"title": string, "directions": string, "items": [{"question": string, "choices": [${k} strings, without letters], "answer": one of ${letters}}]}.`,
          `Exactly ${n} items, each with exactly ${k} different choices and exactly one correct answer. Spread the correct letters across ${letters}. No "all of the above" or "none of the above". Age-appropriate language.`,
          fix ? `\nYour last answer had these problems; fix them: ${fix}` : '',
        ].filter(Boolean).join('\n'),
        parts: visionParts,
        json: true,
        maxTokens: Math.min(16000, 1500 + n * 220),
      });
      let checked = validateTestJson(ctx.masker.unmask(await ask()), { items: n, choices: k });
      if (!checked.ok) {
        report('Fixing a few questions…');
        checked = validateTestJson(ctx.masker.unmask(await ask(checked.problems.slice(0, 8).join(' '))), { items: n, choices: k });
      }
      if (!checked.ok) throw new Error(`The questions did not come out right (${checked.problems.slice(0, 3).join(' ')}). Please try again.`);
      const test = checked.test;
      const testTitle = clean(title) || test.title || `${clean(topic) || 'Test'}`;
      const answerKey = test.items.map((it) => it.answer);

      // 4. The folder: Lessons/Tests/<class>/<title> in the KaTuro folder, a free name.
      const B = await import('../bubble/quiz.js');
      const made = B.newQuiz({
        title: testTitle,
        section: className,
        className,
        recordPath,
        column: col.key,
        columnLabel,
        items: n,
        choices: k,
        ...(await sheetSettings(n, k)),
        blanks: 0,
        learners: record.learners.map((l) => ({ name: l.name, lrn: l.lrn })),
        listPath: recordPath,
      });
      if (!made.ok) throw new Error(made.problems.join(' '));
      const quiz = made.quiz;
      const name = B.fileTitle(testTitle);

      // 5. The test paper, the answer key, the bubble sheets.
      report('Building the test paper and the answer key…');
      const { buildDocx } = await import('../generators/docxFromSpec.js');
      const meta = baseMeta(ctx, [{ label: 'Class', value: className }, { label: 'Learning Area', value: area || '' }]);
      const paperSpec = normalizeDocumentSpec({
        title: testTitle,
        header: headerFor(ctx),
        meta,
        blocks: [
          { type: 'paragraph', text: `**Directions:** ${test.directions || `Read each question carefully. Shade the circle of the letter of the correct answer on your bubble sheet.`}` },
          { type: 'questions', items: test.items.map(({ question, choices: c }) => ({ question, choices: c })), showAnswers: false },
        ],
        signatures: teacherSignatures(ctx),
      });
      const keySpec = normalizeDocumentSpec({
        title: `${testTitle} - Answer Key`,
        header: headerFor(ctx),
        meta: [...meta, { label: 'Counts as', value: columnLabel }],
        blocks: [
          { type: 'table', columns: ['Item', 'Answer', 'Correct choice'], rows: test.items.map((it, i) => [String(i + 1), it.answer, it.choices[LETTERS.indexOf(it.answer)]]) },
          { type: 'paragraph', text: `Key: ${answerKey.join('')}` },
        ],
        signatures: teacherSignatures(ctx),
      });
      // Chosen against the disk and held, so two tests made at once never share a folder.
      const folder = await B.claimQuizFolder(quiz, { home: Boolean(ctx.katuroHome), exists: (p) => ctx.exists(p) });
      let paperFile;
      let keyFile;
      try {
        paperFile = await ctx.saveOutput(`${name} - Test.docx`, await buildDocx(paperSpec), 'docx', folder);
        keyFile = await ctx.saveOutput(`${name} - Answer Key.docx`, await buildDocx(keySpec), 'docx', folder);
      } catch (err) {
        B.releaseQuizFolder(folder);
        throw err;
      }

      // 6. The bubble sheets, the manifest (never over another test's), the key, the Photos folder.
      report(`Making ${quiz.learners.length} bubble sheets…`);
      const { pdf: pdfFile } = await B.writeQuizFolder({
        quiz,
        folder,
        write: (p, content, mime, opts) => ctx.writeData(p, content, mime, opts),
        writePdf: (p, bytes) => ctx.saveOutput(p.split('/').pop(), bytes, 'pdf', folder),
        remove: (p) => ctx.removeOwnOutput?.(p),
        extra: { testPaper: paperFile.path, answerKeyDoc: keyFile.path },
        key: answerKey,
      });

      const warnings = [];
      if (col.filled) warnings.push(`${columnLabel} already has ${col.filled} score(s) in ${className}; recording will ask before replacing them.`);
      if (col.hps !== null && col.hps !== n) warnings.push(`${columnLabel} has ${col.hps} as its highest possible score, not ${n}.`);
      return {
        summary: `Made "${testTitle}" for ${className}: ${n} items (A to ${LETTERS[k - 1]}), counts as ${columnLabel}. Everything is in ${folder}: the test paper (${paperFile.name}), the answer key (${keyFile.name}) and the bubble sheets for ${quiz.learners.length} learners (${pdfFile.name}). Print the bubble sheets; then scan them with the KaTuro App (Camera → Test papers).${warnings.length ? ` Note: ${warnings.join(' ')}` : ''}`,
        warnings,
        artifacts: [{ type: 'files', title: `Test: ${testTitle}`, subtitle: `${className} · ${n} items · ${columnLabel}`, files: [paperFile, keyFile, pdfFile] }],
        data: { folder, quizPath: `${folder}/${B.QUIZ_FILE}` },
      };
    },
  },
};
