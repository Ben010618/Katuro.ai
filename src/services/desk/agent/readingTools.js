/**
 * readingTools.js — reading_check: a class's Phil-IRI oral reading results, scored by code.
 *
 *   "Score the Phil-IRI results in Reading/Grade 5 Rizal pre-test.xlsx, 150 words, 7 questions"
 *     → each learner's word reading %, comprehension %, words per minute and reading level
 *       (Independent / Instructional / Frustration) + the class reading profile, as Excel.
 *
 * The scoring is code (teaching/philIri.js), never the AI. A learner with a missing or impossible
 * number is listed with the reason instead of a guessed level.
 */

import { normalizeSheetSpec } from '../docSpec.js';
import { classProfile, LEVELS, readersFromRows, scoreReader } from '../teaching/philIri.js';
import { needsInfo, slug, extractTableWithAI } from './tools.js';

const positiveInt = (v) => {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : undefined;
};

/** The reading results in a parsed file: Excel/CSV sheets first, then Word tables. */
function findReaders(parsed, defaults, opts) {
  for (const sh of parsed.sheets || []) {
    const found = readersFromRows(sh.rows, defaults, opts);
    if (found) return found;
  }
  for (const t of parsed.tables || []) {
    const rows = Array.isArray(t) ? t : t?.rows || [];
    const found = readersFromRows(rows, defaults, opts);
    if (found) return found;
  }
  return null;
}

export const READING_TOOLS = {
  reading_check: {
    label: 'Phil-IRI reading check',
    description: "Score a class's Phil-IRI oral reading results by code (DepEd Phil-IRI Manual 2018): each learner's word reading % (from miscues), comprehension %, reading speed (words per minute) and reading level (Independent / Instructional / Frustration), plus the class reading profile and who needs reading intervention, as an Excel file. Reads an Excel/CSV sheet or Word table (or a photo/scan of one) with learner names, miscues (a total or columns per miscue type) and comprehension scores; reading time is optional. The passage's number of words and of questions can be given once for the whole class. When the sheet has several parts (Pre-test | Post-test, English | Filipino), \"section\" names the one to score.",
    args: '{ "path": string, "passageWords"?: number, "questions"?: number, "gradeSection"?: string, "test"?: "pre-test" | "post-test", "section"?: string (the part of the sheet to score, e.g. "Post-test" or "Filipino") }',
    async run({ path, passageWords, questions, gradeSection = '', test = '', section = '' }, ctx, report) {
      if (!path) throw needsInfo('Which file has the reading results (learner names, miscues and comprehension scores)?');
      report(`Reading ${path}…`);
      const parsed = await ctx.readParsed(path);
      const defaults = { words: positiveInt(passageWords), questions: positiveInt(questions) };
      const opts = { section: String(section || test || '').trim() };
      let found = findReaders(parsed, defaults, opts);
      if (!found && parsed.needsVision) {
        const t = await extractTableWithAI(path, ctx, 'a Phil-IRI reading results table (learner names, number of miscues or miscues per type, comprehension score, reading time)');
        found = readersFromRows([t.columns, ...t.rows], defaults, opts);
      }
      if (!found) throw new Error(`I couldn't find reading results in ${path}. It needs a column of learner names and columns for miscues and comprehension scores.`);
      if (found.sections) {
        const file = path.split('/').pop();
        if (found.missing) throw needsInfo(`${file} has no "${found.missing}" results; it has ${found.sections.join(' and ')}${found.sections.length === 1 ? ' only' : ''}. Which one should I score?`);
        throw needsInfo(`${file} has results for ${found.sections.join(' and ')}. Which one should I score?`);
      }
      const { readers } = found;
      ctx.masker?.addNames?.(readers.map((r) => r.name));
      if (readers.every((r) => r.words === null)) throw needsInfo('How many words are in the passage the learners read? (Or add a "No. of words" column.)');
      if (readers.every((r) => r.questions === null)) throw needsInfo('How many comprehension questions were asked? (Or add a "No. of questions" column.)');

      const results = readers.map((r) => ({ ...scoreReader(r), input: r }));
      // A sheet that already shows the levels (e.g. a finished Form 3) has no numbers to score.
      if (results.every((r) => r.problems.includes('no miscue count') && r.problems.includes('no comprehension score'))) {
        throw new Error(`${path.split('/').pop()} has no miscue counts or comprehension scores (it may already show the reading levels). I need the raw numbers: miscues per learner and correct answers.`);
      }
      const profile = classProfile(results);
      const label = [gradeSection, found.section || test].map((s) => String(s || '').trim()).filter(Boolean).join(' — ');
      const title = `Phil-IRI Class Reading Profile${label ? ` — ${label}` : ''}`;
      const spec = normalizeSheetSpec({
        title,
        sheets: [
          {
            name: 'Reading Profile',
            columns: ['Learner', 'Miscues', 'Words', 'Word reading %', 'Word reading level', 'Correct answers', 'Questions', 'Comprehension %', 'Comprehension level', 'Reading level', 'Words per minute', 'Notes'].map((header) => ({ header })),
            rows: results.map((r) => [
              r.name,
              r.input.miscues === null ? null : Number(r.input.miscues),
              r.input.words === null ? null : Number(r.input.words),
              r.wordPercent,
              r.wordLevel || '',
              r.input.correct === null ? null : Number(r.input.correct),
              r.input.questions === null ? null : Number(r.input.questions),
              r.comprehensionPercent,
              r.comprehensionLevel || '',
              r.level || 'Not scored',
              r.wpm,
              r.problems.join('; '),
            ].map((v) => (typeof v === 'number' && !Number.isFinite(v) ? null : v))),
          },
          {
            name: 'Summary',
            columns: [{ header: 'Reading level' }, { header: 'Learners' }, { header: '% of learners scored' }],
            rows: [
              ...profile.rows.map((x) => [x.level, x.count, x.percent]),
              ['Not scored (missing or impossible numbers)', profile.incomplete, null],
              ['Total', profile.total, null],
              ['Average reading speed (words per minute)', profile.averageWpm, null],
              [],
              ['For reading intervention (Frustration level)', profile.frustration.length, null],
              ...profile.frustration.map((n) => [n, null, null]),
            ],
          },
          {
            name: 'How it is scored',
            columns: [{ header: 'Level' }, { header: 'Word reading' }, { header: 'Comprehension' }],
            rows: [
              ['Independent', '97–100%', '80–100%'],
              ['Instructional', '90–96%', '59–79%'],
              ['Frustration', '89% and below', '58% and below'],
              [],
              ['Word reading % = (words − miscues) ÷ words × 100; comprehension % = correct ÷ questions × 100; both rounded to whole percents.'],
              ["The reading level is the lower of the two levels (DepEd Phil-IRI Manual 2018). Words per minute = words ÷ reading time in seconds × 60."],
              ['Miscues: mispronunciation, omission, substitution, insertion, repetition, transposition, reversal. Self-corrections are not miscues.'],
            ],
          },
        ],
      });
      report('Saving the class reading profile…');
      const { buildSheetWorkbook } = await import('../generators/xlsxWriters.js');
      const file = await ctx.saveOutput(`${slug(title)}.xlsx`, await buildSheetWorkbook(spec), 'xlsx');
      const counts = LEVELS.map((l) => `${profile.rows.find((x) => x.level === l).count} ${l}`).join(', ');
      const unscored = results.filter((r) => !r.level);
      const parts = [`Phil-IRI reading check for ${profile.total} learner(s): ${counts}`];
      if (unscored.length) parts.push(`${unscored.length} not scored (${unscored.slice(0, 3).map((r) => `${r.name}: ${r.problems[0]}`).join('; ')}${unscored.length > 3 ? '…' : ''})`);
      if (profile.frustration.length) parts.push(`${profile.frustration.length} at Frustration level need reading intervention`);
      return {
        summary: `${parts.join('; ')}. Saved ${file.name}. The levels were computed by code from your numbers (Phil-IRI Manual 2018 bands).`,
        artifacts: [{ type: 'sheet', title, subtitle: counts, spec, files: [file], editable: false }],
      };
    },
  },
};
