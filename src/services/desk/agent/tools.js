/**
 * tools.js — everything the KaTuroDesk agent can DO.
 *
 * Each tool: { name, label, description, args, run(args, ctx, report) → { summary, artifacts?, data? } }
 * - READ tools parse real docx/xlsx/pptx/pdf/images (readers/)
 * - THINK tools call Gemini for content only (structured JSON specs), with learner names masked
 * - WRITE tools turn specs/data into real files with fixed templates (generators/)
 * Grades, item statistics and absences are computed in code (depedGrading.js), never by the AI.
 */

import { describeParsed } from '../readers/index.js';
import { detectInSheets, detectScoreTable, detectAttendance, toResponseMatrix, toTotals, toComponentLearners } from '../readers/scoreSheet.js';
import {
  analyzeItems,
  analyzeTotals,
  findConsecutiveAbsences,
  WEIGHT_PRESETS,
  weightPresetFor,
  computeQuarterlyGrade,
} from '../depedGrading.js';
import {
  normalizeDocumentSpec,
  normalizeSlidesSpec,
  normalizeSheetSpec,
  documentSpecToText,
} from '../docSpec.js';
import { prepareImageForVision } from './llm.js';

const DOC_SPEC_GUIDE = `Return ONLY a JSON object (a "DocumentSpec"):
{
  "title": string, "subtitle"?: string,
  "paper": "long" | "a4" | "letter",            // DepEd default "long" (8.5x13)
  "orientation": "portrait" | "landscape",      // landscape for wide tables (DLL, TOS, class records)
  "meta": [{ "label": string, "value": string }], // info strip: School, Grade Level, Learning Area, Quarter, Teacher, Date...
  "blocks": [
    { "type": "heading", "text": string, "level": 1|2|3 },
    { "type": "paragraph", "text": string },               // may use **bold** inline
    { "type": "bullets", "items": [string], "ordered"?: boolean },
    { "type": "table", "columns": [string], "rows": [[string]], "widths"?: [number] },
    { "type": "questions", "items": [{ "question": string, "choices"?: [string], "answer"?: string }], "showAnswers"?: boolean },
    { "type": "answerLines", "count": number },
    { "type": "pageBreak" }
  ],
  "signatures"?: [{ "label": "Prepared by:", "name": string, "role": string }]
}
Never put markdown symbols (#, ###, |---|) inside text. Use real DepEd terminology. Write complete, classroom-ready content (no placeholders like "insert here").`;

const DOC_TYPE_GUIDES = {
  dll: 'Daily Lesson Log (DepEd Order 42, s.2016 format). Landscape. One table with columns ["", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday"] and rows for: I. OBJECTIVES, A. Content Standards, B. Performance Standards, C. Learning Competencies/Objectives (with code), II. CONTENT, III. LEARNING RESOURCES (A. References 1. Teacher\'s Guide pages 2. Learner\'s Materials pages 3. Textbook pages 4. Additional Materials from LR portal, B. Other Learning Resources), IV. PROCEDURES (A. Reviewing previous lesson or presenting the new lesson, B. Establishing a purpose for the lesson, C. Presenting examples/instances, D. Discussing new concepts and practicing new skills #1, E. Discussing new concepts and practicing new skills #2, F. Developing mastery, G. Finding practical applications, H. Making generalizations and abstractions, I. Evaluating learning, J. Additional activities for application or remediation), V. REMARKS, VI. REFLECTION (A–G standard reflection questions). Meta: School, Grade Level, Teacher, Learning Area, Teaching Dates and Time, Quarter.',
  dlp: 'Detailed/Daily Lesson Plan. Sections: I. Objectives (content standard, performance standard, learning competency with code, 3 SMART objectives: cognitive, psychomotor, affective), II. Content (topic), III. Learning Resources, IV. Procedures (use 7Es: Elicit, Engage, Explore, Explain, Elaborate, Evaluate, Extend — or 4As: Activity, Analysis, Abstraction, Application if asked), with teacher and learner activities as a 2-column table when helpful, V. Assessment (questions block with answers), VI. Assignment, VII. Remarks/Reflection.',
  tos_test: 'Table of Specifications + test. First a TOS table (landscape) with columns ["Learning Competency", "No. of Days", "% Weight", "No. of Items", "Remembering", "Understanding", "Applying", "Analyzing", "Evaluating", "Creating", "Item Placement"], percentages summing to 100 and item counts summing to the total. Then a pageBreak, test instructions, and the test as "questions" blocks grouped by test type, each item with 4 choices and the correct "answer". Set showAnswers true so an answer key is printed at the end.',
  worksheet: 'Learner activity sheet / worksheet: title, learning competency, short concept notes, guided examples, then activities as "questions" blocks (with choices where appropriate) and "answerLines" for open-ended items. Include an answer key (showAnswers true).',
  quiz: 'Quiz: instructions then "questions" blocks with 4 choices each and correct "answer"; showAnswers true.',
  letter: 'Formal school letter/memo/notice in DepEd style: date, recipient block, salutation, body paragraphs, closing, signatures. Filipino or English per the teacher\'s request.',
  report: 'Narrative/accomplishment/activity report in DepEd style: Title, Introduction/Rationale, Objectives, Activities Conducted (table: Date, Activity, Participants, Output), Results/Outcomes, Challenges and Recommendations, documentation note, signatures (Prepared by, Noted by School Head).',
  summary: 'Concise summary/review document of the provided files: key points as headings + bullets, tables where data exists.',
  other: 'Any other DepEd/teacher document. Choose a sensible structure.',
};

function slug(s, max = 60) {
  return String(s || 'KaTuro')
    .replace(/[\\/:*?"<>|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max)
    .replace(/\s/g, '_') || 'KaTuro';
}

function teacherSignatures(ctx) {
  return [
    { label: 'Prepared by:', name: ctx.teacher.fullName || '', role: ctx.teacher.position || 'Teacher' },
    { label: 'Checked by:', name: '', role: 'Master Teacher / Head Teacher' },
    { label: 'Noted by:', name: '', role: 'School Head' },
  ];
}

function baseMeta(ctx, extra = []) {
  const meta = [];
  if (ctx.teacher.school) meta.push({ label: 'School', value: ctx.teacher.school });
  meta.push(...extra.filter((m) => m && m.value));
  if (ctx.teacher.fullName) meta.push({ label: 'Teacher', value: ctx.teacher.fullName });
  return meta;
}

function headerFor(ctx) {
  return { deped: true, region: ctx.teacher.region || undefined, division: ctx.teacher.division || undefined, school: ctx.teacher.school || undefined };
}

/** Text of source files for the AI: masked, capped per file and overall. */
async function gatherSourceText(paths = [], ctx, { perFile = 12000, total = 40000 } = {}) {
  const chunks = [];
  const visionParts = [];
  let used = 0;
  for (const p of paths) {
    const parsed = await ctx.readParsed(p);
    if (parsed.needsVision && parsed.vision) {
      visionParts.push({ inlineData: { mimeType: parsed.vision.mimeType, data: parsed.vision.base64 } });
      chunks.push(`=== FILE: ${p} (attached as image/scan) ===`);
      continue;
    }
    const room = Math.max(0, Math.min(perFile, total - used));
    if (!room) break;
    const text = ctx.masker.mask(parsed.text || '');
    const clipped = text.length > room ? `${text.slice(0, room)}\n(… file truncated)` : text;
    used += clipped.length;
    chunks.push(`=== FILE: ${p} (${describeParsed(parsed)}) ===\n${clipped}`);
  }
  return { text: chunks.join('\n\n'), visionParts };
}

async function saveDocumentOutputs(spec, baseName, formats, ctx) {
  const files = [];
  const wants = new Set(formats && formats.length ? formats : ['docx']);
  if (wants.has('docx')) {
    const { buildDocx } = await import('../generators/docxFromSpec.js');
    files.push(await ctx.saveOutput(`${baseName}.docx`, await buildDocx(spec), 'docx'));
  }
  if (wants.has('pdf')) {
    files.push(await ctx.saveOutput(`${baseName}.pdf`, await ctx.renderPdf(spec), 'pdf'));
  }
  return files;
}

function documentArtifact(spec, files, extra = {}) {
  return {
    type: 'document',
    title: spec.title,
    subtitle: extra.subtitle || files.map((f) => f.name).join(' · '),
    spec,
    files,
    editable: true,
    ...extra,
  };
}

/** Finds the score table in a parsed spreadsheet (or asks the vision model for a photo/scan). */
async function loadScoreTable(path, ctx, { sheet } = {}) {
  const parsed = await ctx.readParsed(path);
  if (parsed.sheets?.length) {
    const found = detectInSheets(parsed.sheets).filter((f) => f.scoreTable && (!sheet || f.sheetName === sheet));
    if (!found.length) throw new Error(`I couldn't find learner names with scores in ${path}. Check that it has a column of names and score columns.`);
    const hit = found[0];
    ctx.masker.addNames(hit.scoreTable.learners.map((l) => l.name));
    return { table: hit.scoreTable, sheetName: hit.sheetName, otherSheets: found.slice(1).map((f) => f.sheetName) };
  }
  if (parsed.needsVision || parsed.tables?.length) {
    const extracted = await extractTableWithAI(path, ctx, 'a learner score sheet or item analysis tally');
    const table = detectScoreTable([extracted.columns, ...extracted.rows]);
    if (!table) throw new Error(`I read ${path} but couldn't find learner scores in it.`);
    ctx.masker.addNames(table.learners.map((l) => l.name));
    return { table, sheetName: 'Extracted', otherSheets: [] };
  }
  throw new Error(`${path} doesn't look like a score sheet (open an Excel/CSV file, a photo, or a scanned PDF of the scores).`);
}

async function extractTableWithAI(path, ctx, what = 'a table') {
  const parsed = await ctx.readParsed(path);
  const parts = [];
  if (parsed.needsVision && parsed.vision) {
    const v = parsed.kind === 'image'
      ? await prepareImageForVision(base64ToBytes(parsed.vision.base64), parsed.vision.mimeType)
      : { mimeType: parsed.vision.mimeType, data: parsed.vision.base64 };
    parts.push({ inlineData: { mimeType: v.mimeType, data: v.data } });
  }
  const textContext = parsed.needsVision ? '' : `\n\nDocument text:\n${ctx.masker.mask(parsed.text || '').slice(0, 20000)}`;
  const result = await ctx.llm({
    system: 'You are a meticulous data-entry assistant for a Filipino DepEd teacher. You transcribe tables exactly, including handwritten ones.',
    prompt: `Transcribe ${what} from this file into JSON: {"title": string, "columns": [string], "rows": [[string]] , "notes": string}. Keep every learner row and every column in order, copy names exactly as written, keep numbers as written, use "" for blank cells, and mention unreadable cells in "notes" (do not guess them).${textContext}`,
    parts,
    json: true,
    maxTokens: 8192,
  });
  const columns = (result.columns || []).map((c) => String(c ?? ''));
  const rows = (result.rows || []).map((r) => (Array.isArray(r) ? r : [r]).map((c) => (c === null || c === undefined ? '' : String(c))));
  if (!columns.length && !rows.length) throw new Error(`I couldn't read a table from ${path}.`);
  return { title: result.title || '', columns, rows, notes: result.notes || '' };
}

function base64ToBytes(b64) {
  const bin = typeof atob === 'function' ? atob(b64) : globalThis.Buffer.from(b64, 'base64').toString('binary');
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function numberOr(v, fallback) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

// ───────────────────────────── Tools ─────────────────────────────

export const TOOLS = {
  read_files: {
    label: 'Read files',
    description: 'Read and understand files (docx, xlsx, csv, pptx, pdf, images, txt). Use before answering questions about file contents when no other tool fits.',
    args: '{ "paths": [string] }',
    async run({ paths = [] }, ctx, report) {
      report(`Reading ${paths.length} file(s)…`);
      const parsedList = await Promise.all(paths.map((p) => ctx.readParsed(p).then((d) => ({ p, d }))));
      return {
        summary: parsedList.map(({ p, d }) => `${p}: ${describeParsed(d)}`).join('; '),
        data: { files: parsedList.map(({ p, d }) => ({ path: p, description: describeParsed(d) })) },
      };
    },
  },

  answer_from_files: {
    label: 'Study files and answer',
    description: 'Answer a question, summarize, compare or check files in plain conversation (no output file). E.g. "what is in this folder", "summarize these 3 lesson plans", "is my DLL complete?".',
    args: '{ "paths": [string], "question": string }',
    async run({ paths = [], question = '' }, ctx, report) {
      report('Studying the files…');
      const { text, visionParts } = await gatherSourceText(paths, ctx);
      const answer = await ctx.llm({
        system: ctx.persona,
        prompt: `${question}\n\nFiles:\n${text}`,
        parts: visionParts,
        maxTokens: 3072,
      });
      return { summary: 'Answered from the files', reply: ctx.masker.unmask(answer) };
    },
  },

  write_document: {
    label: 'Write document',
    description: 'Create a Word (and optionally PDF) document with AI-written content: DLL, DLP/lesson plan (7Es/4As), TOS + test with answer key, quiz, worksheet/activity sheet, letter/memo/notice, narrative or accomplishment report, summary/reviewer, or any other document. Can use workspace files as sources.',
    args: '{ "docType": "dll"|"dlp"|"tos_test"|"quiz"|"worksheet"|"letter"|"report"|"summary"|"other", "title": string, "instructions": string, "sourcePaths"?: [string], "subject"?: string, "gradeLevel"?: string, "formats"?: ["docx","pdf"] }',
    async run({ docType = 'other', title, instructions = '', sourcePaths = [], subject, gradeLevel, formats = ['docx'] }, ctx, report) {
      const guide = DOC_TYPE_GUIDES[docType] || DOC_TYPE_GUIDES.other;
      report(sourcePaths.length ? `Reading ${sourcePaths.length} source file(s)…` : 'Drafting the document…');
      const { text, visionParts } = await gatherSourceText(sourcePaths, ctx);
      const curriculum = ctx.curriculumHint(subject, gradeLevel, instructions);
      report('Writing the content…');
      const raw = await ctx.llm({
        system: `You are KaTuro, a DepEd (Philippines) co-teacher who writes official school documents aligned with the MATATAG curriculum, PPST and DepEd orders.\n${DOC_SPEC_GUIDE}`,
        prompt: [
          `Document type: ${docType} — ${guide}`,
          title ? `Title: ${title}` : '',
          subject ? `Learning area: ${subject}` : '',
          gradeLevel ? `Grade level: ${gradeLevel}` : '',
          curriculum,
          `Teacher's instructions: ${ctx.masker.mask(instructions)}`,
          ctx.teacher.school ? `School: ${ctx.teacher.school}` : '',
          text ? `\nSource files (use their actual content):\n${text}` : '',
        ].filter(Boolean).join('\n'),
        parts: visionParts,
        json: true,
        maxTokens: 12000,
      });
      const spec = normalizeDocumentSpec({
        ...ctx.masker.unmask(raw),
        header: headerFor(ctx),
        ...(raw?.signatures?.length ? {} : { signatures: teacherSignatures(ctx) }),
      });
      if (!spec.blocks.length) throw new Error('The AI returned an empty document. Please try again with more detail.');
      if (title) spec.title = title;
      report('Building the file…');
      const files = await saveDocumentOutputs(spec, slug(spec.title), formats, ctx);
      return { summary: `Created ${files.map((f) => f.name).join(' and ')}`, artifacts: [documentArtifact(spec, files, { docType })] };
    },
  },

  revise_document: {
    label: 'Revise document',
    description: 'Change the document currently open in the Canvas (e.g. "make it Filipino", "add 5 more items", "simplify for Grade 3", "change the dates"). Saves a new version.',
    args: '{ "instructions": string, "formats"?: ["docx","pdf"] }',
    async run({ instructions = '', formats }, ctx, report) {
      const current = ctx.activeArtifact;
      if (!current?.spec || current.type !== 'document') throw new Error('Open a generated document in the Canvas first, then ask me to revise it.');
      report('Revising the document…');
      const raw = await ctx.llm({
        system: `You revise DepEd documents. Apply the teacher's change and keep everything else.\n${DOC_SPEC_GUIDE}`,
        prompt: `Current document JSON:\n${ctx.masker.mask(JSON.stringify(current.spec))}\n\nChange requested: ${ctx.masker.mask(instructions)}\n\nReturn the full revised DocumentSpec JSON.`,
        json: true,
        maxTokens: 12000,
      });
      const spec = normalizeDocumentSpec({ ...ctx.masker.unmask(raw), header: current.spec.header });
      const fmts = formats || [...new Set((current.files || []).map((f) => f.format).filter((f) => ['docx', 'pdf'].includes(f)))];
      const files = await saveDocumentOutputs(spec, `${slug(spec.title)}_revised`, fmts.length ? fmts : ['docx'], ctx);
      return { summary: `Saved the revised version as ${files.map((f) => f.name).join(' and ')}`, artifacts: [documentArtifact(spec, files)] };
    },
  },

  make_slides: {
    label: 'Make slides',
    description: 'Create a PowerPoint (.pptx) lesson presentation, optionally from workspace files (e.g. turn a DLP into slides).',
    args: '{ "topic": string, "instructions"?: string, "sourcePaths"?: [string], "slideCount"?: number, "gradeLevel"?: string, "subject"?: string }',
    async run({ topic = '', instructions = '', sourcePaths = [], slideCount = 10, gradeLevel, subject }, ctx, report) {
      report(sourcePaths.length ? 'Reading the source files…' : 'Planning the slides…');
      const { text, visionParts } = await gatherSourceText(sourcePaths, ctx);
      report('Writing the slides…');
      const raw = await ctx.llm({
        system: 'You create clear, engaging DepEd classroom slide decks (MATATAG-aligned). Short bullets (max 6 per slide, max 12 words each), age-appropriate language, include an activity slide, a generalization slide and a short check-for-understanding slide.',
        prompt: `Return ONLY JSON: {"title": string, "subtitle": string, "slides": [{"title": string, "layout": "title"|"bullets"|"twoColumn", "bullets": [string], "left"?: [string], "right"?: [string], "notes": string (what the teacher says)}]}\nTopic: ${topic}\n${subject ? `Learning area: ${subject}\n` : ''}${gradeLevel ? `Grade level: ${gradeLevel}\n` : ''}About ${numberOr(slideCount, 10)} slides. ${ctx.masker.mask(instructions)}${text ? `\n\nSource files:\n${text}` : ''}`,
        parts: visionParts,
        json: true,
        maxTokens: 8192,
      });
      const spec = normalizeSlidesSpec(ctx.masker.unmask(raw));
      if (!spec.slides.length) throw new Error('The AI returned no slides. Please try again.');
      report('Building the PowerPoint…');
      const { buildPptx } = await import('../generators/pptxFromSpec.js');
      const file = await ctx.saveOutput(`${slug(spec.title)}.pptx`, await buildPptx(spec), 'pptx');
      return {
        summary: `Created ${file.name} (${spec.slides.length} slides)`,
        artifacts: [{ type: 'slides', title: spec.title, subtitle: file.name, spec, files: [file], editable: false }],
      };
    },
  },

  make_spreadsheet: {
    label: 'Make spreadsheet',
    description: 'Create an Excel workbook from instructions or files (e.g. masterlist template, inventory, schedule, tally sheet, data extracted from documents).',
    args: '{ "title": string, "instructions": string, "sourcePaths"?: [string] }',
    async run({ title = '', instructions = '', sourcePaths = [] }, ctx, report) {
      const { text, visionParts } = await gatherSourceText(sourcePaths, ctx);
      report('Designing the workbook…');
      const raw = await ctx.llm({
        system: 'You build tidy, ready-to-use Excel workbooks for Filipino DepEd teachers.',
        prompt: `Return ONLY JSON: {"title": string, "sheets": [{"name": string, "columns": [{"header": string, "width"?: number}], "rows": [[string|number|null]]}]}\nNumbers must be JSON numbers. Title: ${title}\nInstructions: ${ctx.masker.mask(instructions)}${text ? `\n\nSource files:\n${text}` : ''}`,
        parts: visionParts,
        json: true,
        maxTokens: 8192,
      });
      const spec = normalizeSheetSpec(ctx.masker.unmask({ ...raw, title: title || raw?.title }));
      if (!spec.sheets.length) throw new Error('The AI returned no sheets.');
      const { buildSheetWorkbook } = await import('../generators/xlsxWriters.js');
      const file = await ctx.saveOutput(`${slug(spec.title)}.xlsx`, await buildSheetWorkbook(spec), 'xlsx');
      return {
        summary: `Created ${file.name}`,
        artifacts: [{ type: 'sheet', title: spec.title, subtitle: file.name, spec, files: [file], editable: false }],
      };
    },
  },

  analyze_scores: {
    label: 'Item analysis & LMC',
    description: 'Item analysis of a quiz/test score sheet (Excel/CSV, photo, or scanned PDF): MPS, mastery level, difficulty & discrimination per item, Least Mastered Competencies, learners below 75%. Saves an Item Analysis report (.docx) and workbook (.xlsx). Computed exactly in code.',
    args: '{ "path": string, "sheet"?: string, "testTitle"?: string, "subject"?: string, "gradeSection"?: string, "quarter"?: string, "competencies"?: [string] (one per item, optional), "lmcThreshold"?: number }',
    async run({ path, sheet, testTitle, subject, gradeSection, quarter, competencies = [], lmcThreshold = 75 }, ctx, report) {
      report(`Reading scores from ${path}…`);
      const { table, sheetName } = await loadScoreTable(path, ctx, { sheet });
      const meta = {
        title: testTitle || `Item Analysis — ${sheetName}`,
        testTitle: testTitle || sheetName,
        subject: subject || '',
        gradeSection: gradeSection || sheetName,
        quarter: quarter || '',
        school: ctx.teacher.school || '',
        teacher: ctx.teacher.fullName || '',
      };

      let analysis;
      let kind;
      if (table.mode === 'items' && table.responses?.length) {
        report(`Analyzing ${table.learners.length} learners × ${table.itemCols.length} items…`);
        const items = table.itemCols.map((c, i) => ({ number: i + 1, competency: competencies[i] || '' }));
        analysis = analyzeItems(toResponseMatrix(table), items, { lmcThreshold: numberOr(lmcThreshold, 75) });
        kind = 'items';
      } else {
        const totals = toTotals(table);
        if (!totals.totalItems) throw new Error('I found total scores but not the number of items. Tell me the total items (e.g. "out of 30").');
        report(`Analyzing total scores of ${totals.learners.length} learners…`);
        analysis = analyzeTotals(totals.learners, totals.totalItems, { passPercent: numberOr(lmcThreshold, 75) });
        kind = 'totals';
      }
      ctx.memory.set(`analysis:${path}`, { analysis, kind, meta });
      ctx.memory.set('lastAnalysis', { analysis, kind, meta, path });

      // AI writes only the remarks & interventions, from numbers (names masked).
      let remarks;
      let interventions = [];
      try {
        report('Writing remarks and interventions…');
        const lmc = kind === 'items' ? analysis.leastMastered.map((it) => `Item ${it.number}${it.competency ? ` (${it.competency})` : ''}: ${it.percentCorrect}%`) : [];
        const ai = await ctx.llm({
          system: ctx.persona,
          prompt: `Write DepEd item-analysis remarks. Return JSON {"remarks": [string], "interventions": [string]} (3-5 each, specific, practical, simple English).\nTest: ${meta.testTitle}. ${subject ? `Learning area: ${subject}.` : ''}\nExaminees: ${analysis.examinees}. MPS: ${analysis.mps}% (${analysis.masteryLevel}).${kind === 'items' ? `\nLeast mastered items: ${lmc.join('; ') || 'none'}` : `\nLearners below ${analysis.passPercent}%: ${analysis.belowPass.length}`}`,
          json: true,
          maxTokens: 1500,
        });
        remarks = ctx.masker.unmask((ai.remarks || []).map(String));
        interventions = ctx.masker.unmask((ai.interventions || []).map(String));
      } catch (err) {
        if (err?.code !== 'AI_UNAVAILABLE') throw err;
        remarks = ['AI remarks were skipped because the AI service was unavailable. All numbers above are computed exactly.'];
      }

      report('Building the report files…');
      const files = [];
      let spec;
      if (kind === 'items') {
        const [{ itemAnalysisReportSpec }, { buildItemAnalysisWorkbook }] = await Promise.all([
          import('../generators/depedTemplates.js'),
          import('../generators/xlsxWriters.js'),
        ]);
        const base = itemAnalysisReportSpec(analysis, meta, { remarks, interventions });
        const below = analysis.learners.filter((l) => l.percent < 75).sort((a, b) => a.percent - b.percent);
        // Teachers need the names for remediation; the report template only has item statistics.
        const learnerBlocks = below.length
          ? [
            { type: 'heading', level: 2, text: `Learners Needing Remediation (below 75%): ${below.length}` },
            { type: 'table', columns: ['No.', 'Learner', 'Score', '%'], rows: below.map((l, i) => [String(i + 1), l.name, `${l.score}/${analysis.itemCount}`, `${l.percent}%`]) },
          ]
          : [];
        const sigIdx = base.blocks.length;
        spec = normalizeDocumentSpec({ ...base, blocks: [...base.blocks.slice(0, sigIdx), ...learnerBlocks], header: headerFor(ctx) });
        files.push(...(await saveDocumentOutputs(spec, slug(`Item_Analysis_${meta.testTitle}`), ['docx'], ctx)));
        files.push(await ctx.saveOutput(`${slug(`Item_Analysis_${meta.testTitle}`)}.xlsx`, await buildItemAnalysisWorkbook(analysis, meta), 'xlsx'));
      } else {
        spec = normalizeDocumentSpec({
          title: 'Assessment Results and Mastery Report',
          header: headerFor(ctx),
          meta: baseMeta(ctx, [{ label: 'Test', value: meta.testTitle }, { label: 'Learning Area', value: subject }, { label: 'Grade & Section', value: meta.gradeSection }]),
          blocks: [
            { type: 'paragraph', text: `**Examinees:** ${analysis.examinees}   **Total items:** ${analysis.totalItems}   **Mean:** ${analysis.mean}   **MPS:** ${analysis.mps}% (${analysis.masteryLevel})` },
            { type: 'heading', level: 2, text: `Learners below ${analysis.passPercent}% (${analysis.belowPass.length})` },
            { type: 'table', columns: ['No.', 'Learner', 'Score', '%'], rows: analysis.belowPass.map((l, i) => [String(i + 1), l.name, String(l.score), `${l.percent}%`]) },
            { type: 'heading', level: 2, text: 'Remarks' },
            { type: 'bullets', items: remarks },
            ...(interventions.length ? [{ type: 'heading', level: 2, text: 'Recommended Interventions' }, { type: 'bullets', items: interventions }] : []),
          ],
          signatures: teacherSignatures(ctx),
        });
        files.push(...(await saveDocumentOutputs(spec, slug(`Mastery_Report_${meta.testTitle}`), ['docx'], ctx)));
      }

      const lmcCount = kind === 'items' ? analysis.leastMastered.length : null;
      const summary = kind === 'items'
        ? `MPS ${analysis.mps}% (${analysis.masteryLevel}); ${lmcCount} least mastered item(s) out of ${analysis.itemCount}; ${analysis.learners.filter((l) => l.percent < 75).length} learner(s) below 75%`
        : `MPS ${analysis.mps}% (${analysis.masteryLevel}); ${analysis.belowPass.length} learner(s) below ${analysis.passPercent}%`;
      return {
        summary,
        data: { kind, mps: analysis.mps, analysisKey: `analysis:${path}` },
        artifacts: [documentArtifact(spec, files, { subtitle: summary, data: { analysis, kind } })],
      };
    },
  },

  make_remedial_package: {
    label: 'Remedial slips & re-test',
    description: 'Create a 1-page Remedial Practice Slip and a 5-item Quick Re-test (2-up printing, with teacher answer key) targeting the least mastered competencies. Usually depends on analyze_scores; can also use a lesson file or a competency given by the teacher.',
    args: '{ "competency"?: string, "subject"?: string, "gradeLevel"?: string, "sourcePaths"?: [string], "learnersBelowPercent"?: number, "formats"?: ["docx","pdf"] }',
    async run({ competency = '', subject = '', gradeLevel = '', sourcePaths = [], formats = ['docx', 'pdf'] }, ctx, report, deps) {
      // In a batch (one analysis per section) use the analysis this task depends on.
      const fromDeps = Object.values(deps || {}).find((d) => d?.data?.analysisKey);
      const analysisInfo = fromDeps ? ctx.memory.get(fromDeps.data.analysisKey) : ctx.memory.get('lastAnalysis');
      let focus = competency;
      if (!focus && analysisInfo?.kind === 'items') {
        focus = analysisInfo.analysis.leastMastered.slice(0, 3).map((it) => it.competency || `Item ${it.number}`).join('; ');
      }
      const { text, visionParts } = await gatherSourceText(sourcePaths, ctx, { total: 20000 });
      if (!focus && !text) throw new Error('Tell me the competency to remediate, or run an item analysis first.');
      report('Writing practice and re-test items…');
      const raw = await ctx.llm({
        system: `${ctx.persona}\nYou write short, scaffolded remedial materials for struggling learners.`,
        prompt: `Return ONLY JSON:
{"practice": {"title": string, "competency": string, "instructions": string, "items": [{"question": string, "choices"?: [string], "answer": string}]},
 "retest": {"instructions": string, "items": [{"question": string, "choices": [string], "answer": string}]}}
Practice: 5-6 guided items that fit on half of a long bond page (start easy, include a worked hint in the instructions). Re-test: EXACTLY 5 multiple-choice items, 4 choices each, parallel to the practice.
${subject ? `Learning area: ${subject}. ` : ''}${gradeLevel ? `Grade level: ${gradeLevel}. ` : ''}
Target competency / least mastered skills: ${focus || '(see source files)'}${text ? `\n\nLesson/source material:\n${text}` : ''}`,
        parts: visionParts,
        json: true,
        maxTokens: 4096,
      });
      const { remedialSlipsSpec } = await import('../generators/depedTemplates.js');
      const practice = raw.practice || {};
      const retest = { ...(raw.retest || {}), items: (raw.retest?.items || []).slice(0, 5) };
      const spec = normalizeDocumentSpec({
        ...remedialSlipsSpec({
          meta: { school: ctx.teacher.school || '', subject, gradeLevel, competency: practice.competency || focus },
          practice,
          retest,
          copiesPerPage: 2,
        }),
        header: null,
      });
      report('Building the printable slips…');
      const files = await saveDocumentOutputs(spec, slug(`Remedial_Slips_${practice.competency || focus || subject}`, 50), formats, ctx);
      return { summary: `Created remedial slips + 5-item re-test (${files.map((f) => f.name).join(', ')})`, artifacts: [documentArtifact(spec, files)] };
    },
  },

  make_class_record: {
    label: 'e-Class Record',
    description: 'Encode raw scores into an official DepEd e-Class Record workbook (DO 8 s.2015: WW/PT/QA, PS, WS, initial and transmuted grades with live Excel formulas) plus a printable grade summary. Source can be an Excel/CSV score sheet, a photo, or scanned PDF.',
    args: '{ "path": string, "sheet"?: string, "subject"?: string, "gradeLevel"?: string, "gradeSection"?: string, "quarter"?: string, "weights"?: "languages"|"scienceMath"|"mapehEpp"|"shsCore"|"shsAcademic"|"shsImmersion"|"shsTvl" }',
    async run({ path, sheet, subject = '', gradeLevel = '', gradeSection = '', quarter = '', weights }, ctx, report) {
      report(`Reading scores from ${path}…`);
      const { table, sheetName } = await loadScoreTable(path, ctx, { sheet });
      let learners;
      let hps;
      if (table.mode === 'components') {
        ({ learners, hps } = toComponentLearners(table));
      } else {
        // Only one set of scores: treat it as a single Written Work entry the teacher can extend.
        const totals = toTotals(table);
        learners = table.learners.map((l, i) => ({ name: l.name, gender: l.gender, ww: { scores: [totals.learners[i]?.score ?? null] }, pt: { scores: [] }, qa: { scores: [] } }));
        hps = { ww: [totals.totalItems || Math.max(...totals.learners.map((x) => x.score || 0), 0)], pt: [], qa: [] };
      }
      const presetKey = WEIGHT_PRESETS[weights] ? weights : weightPresetFor(subject, gradeLevel);
      const preset = WEIGHT_PRESETS[presetKey];
      const meta = {
        region: ctx.teacher.region || '',
        division: ctx.teacher.division || '',
        school: ctx.teacher.school || '',
        schoolId: ctx.teacher.schoolId || '',
        schoolYear: ctx.schoolYear,
        quarter,
        gradeSection: gradeSection || sheetName,
        subject,
        teacher: ctx.teacher.fullName || '',
      };
      report(`Computing grades for ${learners.length} learners (${preset.label})…`);
      const { buildClassRecordWorkbook } = await import('../generators/xlsxWriters.js');
      const { classRecordSummarySpec } = await import('../generators/depedTemplates.js');
      const xlsx = await ctx.saveOutput(`${slug(`e-Class_Record_${subject || sheetName}_${quarter || ''}`)}.xlsx`, await buildClassRecordWorkbook({ meta, weights: preset, hps, learners }), 'xlsx');

      const rows = learners.map((l) => {
        const g = computeQuarterlyGrade({ ww: { scores: l.ww.scores, hps: hps.ww }, pt: { scores: l.pt.scores, hps: hps.pt }, qa: { scores: l.qa.scores, hps: hps.qa } }, preset);
        return { name: l.name, gender: l.gender, ...g };
      });
      const spec = normalizeDocumentSpec({ ...classRecordSummarySpec({ meta, rows }), header: headerFor(ctx), signatures: teacherSignatures(ctx) });
      const docs = await saveDocumentOutputs(spec, slug(`Grade_Summary_${subject || sheetName}`), ['docx'], ctx);
      const failing = rows.filter((r) => r.quarterlyGrade < 75).length;
      const summary = `${learners.length} learners encoded; ${failing} below 75 (weights WW ${preset.ww * 100}% / PT ${preset.pt * 100}% / QA ${preset.qa * 100}%)`;
      return { summary, artifacts: [documentArtifact(spec, [xlsx, ...docs], { subtitle: summary })] };
    },
  },

  check_attendance: {
    label: 'Attendance & SARDO',
    description: 'Check an attendance sheet (SF2-style Excel/CSV, photo or scan) for learners with consecutive absences (SARDO early warning) and create Home Visitation Notices (Filipino + English) for them.',
    args: '{ "path": string, "minConsecutive"?: number, "gradeSection"?: string }',
    async run({ path, minConsecutive = 3, gradeSection = '' }, ctx, report) {
      report(`Reading attendance from ${path}…`);
      const parsed = await ctx.readParsed(path);
      let att = null;
      for (const sh of parsed.sheets || []) {
        att = detectAttendance(sh.rows);
        if (att) break;
      }
      if (!att && (parsed.needsVision || parsed.tables?.length)) {
        const extracted = await extractTableWithAI(path, ctx, 'an attendance sheet (learner names and daily marks; x or A = absent)');
        att = detectAttendance([extracted.columns, ...extracted.rows]);
      }
      if (!att) throw new Error(`I couldn't find daily attendance marks in ${path}.`);
      const flagged = findConsecutiveAbsences(att.learners, numberOr(minConsecutive, 3));
      if (!flagged.length) {
        return { summary: `No learner has ${minConsecutive} or more consecutive absences (${att.learners.length} learners checked).` };
      }
      report(`Preparing ${flagged.length} home visitation notice(s)…`);
      const { homeVisitationNoticeSpec } = await import('../generators/depedTemplates.js');
      const blocks = [];
      flagged.forEach((f, i) => {
        const one = homeVisitationNoticeSpec({
          learnerName: f.name,
          gradeSection,
          absences: f.longestConsecutive,
          teacherName: ctx.teacher.fullName || ctx.teacher.salutation,
          schoolName: ctx.teacher.school || '',
          date: new Date().toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' }),
        });
        if (i > 0) blocks.push({ type: 'pageBreak' });
        blocks.push({ type: 'heading', level: 1, text: one.title }, ...(one.blocks || []));
      });
      const spec = normalizeDocumentSpec({
        title: 'Home Visitation Notices',
        header: headerFor(ctx),
        meta: baseMeta(ctx, [{ label: 'Grade & Section', value: gradeSection }]),
        blocks: [
          { type: 'heading', level: 2, text: 'SARDO Early Warning Summary' },
          { type: 'table', columns: ['Learner', 'Longest consecutive absences', 'Total absences'], rows: flagged.map((f) => [f.name, String(f.longestConsecutive), String(f.totalAbsences)]) },
          { type: 'pageBreak' },
          ...blocks,
        ],
      });
      const files = await saveDocumentOutputs(spec, slug(`Home_Visitation_Notices_${gradeSection || 'Class'}`), ['docx'], ctx);
      return { summary: `${flagged.length} learner(s) flagged for ${minConsecutive}+ consecutive absences; notices ready`, artifacts: [documentArtifact(spec, files)] };
    },
  },

  extract_table: {
    label: 'Photo/scan to table',
    description: 'Read a table (score list, attendance, roster) from a photo, scanned PDF, or Word document into an editable Excel file the teacher can review before encoding.',
    args: '{ "path": string, "what"?: string }',
    async run({ path, what = 'the table' }, ctx, report) {
      report(`Reading ${path} with AI vision…`);
      const t = await extractTableWithAI(path, ctx, what);
      const spec = normalizeSheetSpec({ title: t.title || `Extracted from ${path.split('/').pop()}`, sheets: [{ name: 'Extracted', columns: t.columns.map((h) => ({ header: h })), rows: t.rows.map((r) => r.map((c) => (c !== '' && !Number.isNaN(Number(c)) ? Number(c) : c))) }] });
      const { buildSheetWorkbook } = await import('../generators/xlsxWriters.js');
      const file = await ctx.saveOutput(`${slug(spec.title)}.xlsx`, await buildSheetWorkbook(spec), 'xlsx');
      return {
        summary: `Extracted ${t.rows.length} rows into ${file.name}${t.notes ? ` — note: ${t.notes}` : ''}. Please review it before encoding.`,
        artifacts: [{ type: 'table', title: spec.title, subtitle: 'Review and correct before using', spec, files: [file], editable: true, data: { notes: t.notes } }],
      };
    },
  },

  encode_scores: {
    label: 'Type scores into my file',
    description: "Type scores from a source (score sheet, extracted table, or analysis) into the teacher's OWN existing Excel file (e.g. their e-Class Record) by matching learner names, keeping all their formatting and formulas. Saves a copy; never changes the original.",
    args: '{ "sourcePath": string, "targetPath": string, "targetColumn": string (column letter or header text, e.g. "F" or "WW3"), "sheetName"?: string, "nameColumn"?: string, "startRow"?: number, "overwrite"?: boolean }',
    async run({ sourcePath, targetPath, targetColumn, sheetName, nameColumn, startRow, overwrite = false }, ctx, report) {
      if (!targetColumn) throw new Error('Tell me which column to fill (e.g. "column F" or "WW3").');
      report(`Reading scores from ${sourcePath}…`);
      const { table } = await loadScoreTable(sourcePath, ctx);
      const totals = toTotals(table);
      const { writeScoresIntoWorkbook, findWorkbookColumns } = await import('../generators/fillTemplates.js');
      const targetBytes = await ctx.readBytes(targetPath);
      let nameCol = nameColumn;
      if (!nameCol) {
        const cols = await findWorkbookColumns(targetBytes, sheetName);
        const hit = cols.headers.find((h) => /name|learner|pangalan|student/i.test(h.text));
        nameCol = hit ? hit.letter : 'B';
      }
      report(`Typing ${totals.learners.length} scores into ${targetPath}…`);
      const result = await writeScoresIntoWorkbook(targetBytes, {
        sheetName,
        nameColumn: nameCol,
        startRow,
        targetColumn,
        scores: totals.learners.map((l) => ({ name: l.name, score: l.score })),
        overwrite,
      });
      const base = targetPath.split('/').pop().replace(/\.[^.]+$/, '');
      const file = await ctx.saveOutput(`${base} (encoded).xlsx`, result.bytes, 'xlsx');
      const parts = [`${result.written.length} score(s) typed into column ${targetColumn}`];
      if (result.unmatched.length) parts.push(`${result.unmatched.length} name(s) not found: ${result.unmatched.slice(0, 5).join(', ')}${result.unmatched.length > 5 ? '…' : ''}`);
      if (result.skippedExisting.length) parts.push(`${result.skippedExisting.length} cell(s) already had a value and were kept`);
      const spec = normalizeSheetSpec({
        title: `Encoding check — ${file.name}`,
        sheets: [{ name: 'Encoded', columns: [{ header: 'Learner (source)' }, { header: 'Matched name in your file' }, { header: 'Row' }, { header: 'Score' }], rows: result.written.map((w) => [w.name, w.matchedName, w.row, w.score]) }],
      });
      return { summary: `${parts.join('; ')}. Saved as ${file.name}`, artifacts: [{ type: 'sheet', title: spec.title, subtitle: parts.join(' · '), spec, files: [file], editable: false }] };
    },
  },

  fill_template: {
    label: 'Fill Word template',
    description: 'Fill the teacher\'s own Word template that has {{placeholders}} (e.g. a school form or certificate) using AI and/or source files. Use list mode when the teacher wants one filled copy per learner.',
    args: '{ "templatePath": string, "instructions": string, "sourcePaths"?: [string] }',
    async run({ templatePath, instructions = '', sourcePaths = [] }, ctx, report) {
      const { fillDocxTemplate, listDocxPlaceholders } = await import('../generators/fillTemplates.js');
      const templateBytes = await ctx.readBytes(templatePath);
      const tags = await listDocxPlaceholders(templateBytes);
      if (!tags.length) throw new Error(`${templatePath} has no {{placeholders}}. Add tags like {{name}} or {{date}} in Word where values should go.`);
      const { text } = await gatherSourceText(sourcePaths, ctx, { total: 20000 });
      report(`Filling ${tags.length} field(s)…`);
      const values = ctx.masker.unmask(await ctx.llm({
        system: ctx.persona,
        prompt: `Fill these Word template fields. Return ONLY a JSON object whose keys are exactly: ${JSON.stringify(tags)}. Values are plain strings (use "" if unknown).\nTeacher's instructions: ${ctx.masker.mask(instructions)}\nTeacher: ${ctx.teacher.fullName || ''}; School: ${ctx.teacher.school || ''}; Today: ${new Date().toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' })}${text ? `\n\nSource files:\n${text}` : ''}`,
        json: true,
        maxTokens: 3000,
      }));
      const base = templatePath.split('/').pop().replace(/\.[^.]+$/, '');
      const file = await ctx.saveOutput(`${base} (filled).docx`, await fillDocxTemplate(templateBytes, values), 'docx');
      const spec = normalizeSheetSpec({ title: `Filled fields — ${file.name}`, sheets: [{ name: 'Fields', columns: [{ header: 'Field' }, { header: 'Value' }], rows: tags.map((t) => [t, String(values?.[t] ?? '')]) }] });
      return { summary: `Filled ${tags.length} field(s) into ${file.name}`, artifacts: [{ type: 'sheet', title: spec.title, subtitle: file.name, spec, files: [file], editable: false }] };
    },
  },

  convert_to_pdf: {
    label: 'Convert to PDF',
    description: 'Convert Word documents or images (photos of documents) to PDF. Several images can become one PDF.',
    args: '{ "paths": [string], "combineImages"?: boolean }',
    async run({ paths = [], combineImages = true }, ctx, report) {
      const files = [];
      const images = [];
      for (const p of paths) {
        const ext = p.split('.').pop().toLowerCase();
        if (['png', 'jpg', 'jpeg'].includes(ext)) {
          images.push({ bytes: await ctx.readBytes(p), mimeType: ext === 'png' ? 'image/png' : 'image/jpeg', name: p });
        } else if (ext === 'docx') {
          report(`Converting ${p}…`);
          const parsed = await ctx.readParsed(p);
          const html = `<!doctype html><html><head><meta charset="utf-8"><style>body{font-family:Arial,sans-serif;font-size:11pt;line-height:1.35}table{border-collapse:collapse;width:100%}td,th{border:1px solid #444;padding:4px;vertical-align:top}img{max-width:100%}</style></head><body>${parsed.html || ''}</body></html>`;
          const pdf = await ctx.htmlToPdf(html);
          if (!pdf) throw new Error('Word to PDF conversion needs the KaTuroDesk desktop app.');
          files.push(await ctx.saveOutput(`${p.split('/').pop().replace(/\.docx$/i, '')}.pdf`, pdf, 'pdf'));
        } else {
          throw new Error(`I can convert Word files and images to PDF, but not .${ext} files yet. For Excel/PowerPoint, use Save As PDF in Office.`);
        }
      }
      if (images.length) {
        const { imagesToPdf } = await import('../generators/pdfTools.js');
        if (combineImages) {
          files.push(await ctx.saveOutput(`${slug(images[0].name.split('/').pop().replace(/\.[^.]+$/, ''))}${images.length > 1 ? `_and_${images.length - 1}_more` : ''}.pdf`, await imagesToPdf(images), 'pdf'));
        } else {
          for (const img of images) files.push(await ctx.saveOutput(`${img.name.split('/').pop().replace(/\.[^.]+$/, '')}.pdf`, await imagesToPdf([img]), 'pdf'));
        }
      }
      return { summary: `Created ${files.map((f) => f.name).join(', ')}`, artifacts: [{ type: 'files', title: 'PDF conversion', subtitle: `${files.length} file(s)`, files }] };
    },
  },

  merge_pdfs: {
    label: 'Merge PDFs',
    description: 'Combine several PDF files into one, in the given order.',
    args: '{ "paths": [string], "outputName"?: string }',
    async run({ paths = [], outputName }, ctx, report) {
      if (paths.length < 2) throw new Error('Choose at least two PDF files to merge.');
      report(`Merging ${paths.length} PDFs…`);
      const { mergePdfs } = await import('../generators/pdfTools.js');
      const merged = await mergePdfs(await Promise.all(paths.map((p) => ctx.readBytes(p))));
      const file = await ctx.saveOutput(`${slug(outputName || 'Merged')}.pdf`, merged, 'pdf');
      return { summary: `Merged ${paths.length} PDFs into ${file.name}`, artifacts: [{ type: 'files', title: 'Merged PDF', subtitle: file.name, files: [file] }] };
    },
  },

  split_pdf: {
    label: 'Split PDF',
    description: 'Split a PDF into parts by page ranges, e.g. [[1,3],[4,10]].',
    args: '{ "path": string, "ranges": [[number, number]] }',
    async run({ path, ranges = [] }, ctx, report) {
      report(`Splitting ${path}…`);
      const { splitPdf } = await import('../generators/pdfTools.js');
      const parts = await splitPdf(await ctx.readBytes(path), ranges);
      const base = path.split('/').pop().replace(/\.pdf$/i, '');
      const files = [];
      for (let i = 0; i < parts.length; i++) {
        files.push(await ctx.saveOutput(`${base} (pages ${ranges[i][0]}-${ranges[i][1]}).pdf`, parts[i], 'pdf'));
      }
      return { summary: `Split into ${files.length} file(s)`, artifacts: [{ type: 'files', title: 'Split PDF', subtitle: `${files.length} file(s)`, files }] };
    },
  },

  create_folder: {
    label: 'Create folder',
    description: 'Create a folder inside the classroom folder (outputs of later tasks in the same request can go there via outputFolder).',
    args: '{ "path": string }',
    async run({ path }, ctx) {
      await ctx.makeDir(path);
      ctx.setOutputFolder(path);
      return { summary: `Created folder ${path}/` };
    },
  },
};

export const TOOL_NAMES = Object.keys(TOOLS);

/** Tool catalog text for the planner prompt. */
export function toolCatalog() {
  return TOOL_NAMES.map((name) => `- ${name}: ${TOOLS[name].description}\n  args: ${TOOLS[name].args}`).join('\n');
}

export { documentSpecToText, base64ToBytes, slug };
