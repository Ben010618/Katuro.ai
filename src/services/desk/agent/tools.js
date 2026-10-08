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
import { visionPartsFor } from './visionPrep.js';
import { GROUNDING_RULES, verifySpec } from './grounding.js';
import { buildConsolidatedSpec } from './consolidate.js';

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
Never put markdown symbols (#, ###, |---|) inside text. Use real DepEd terminology. Write complete, classroom-ready content (no placeholders like "insert here").
Never write placeholders for people or places such as [Principal's Name], (School Head), ____ or "Name of School": use only names given in the teacher profile, and leave out anything not given. Do NOT add "signatures": the app adds them from the teacher's profile.

${GROUNDING_RULES}`;

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

/** Sign-off blocks from the teacher's profile; anyone left blank is not printed. */
function teacherSignatures(ctx) {
  return ctx.teacher.signatures || [];
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

/**
 * Text of source files for the AI: read in parallel, masked, and the overall budget
 * shared fairly so a 40-file folder summary sees every file, not just the first few.
 */
async function gatherSourceText(paths = [], ctx, { perFile = 12000, total = 48000, maxVision = 4 } = {}) {
  const unique = [...new Set(paths)];
  const parsedList = await Promise.all(unique.map((p) => ctx.readParsed(p).then((d) => ({ p, d }), (e) => ({ p, error: e }))));
  const textual = parsedList.filter((x) => x.d && !x.d.needsVision && x.d.kind !== 'unsupported');
  const share = Math.max(800, Math.min(perFile, Math.floor(total / Math.max(1, textual.length))));

  const chunks = [];
  const visionParts = [];
  for (const { p, d, error } of parsedList) {
    if (error || !d) {
      chunks.push(`=== FILE: ${p} (could not be read) ===`);
    } else if (d.needsVision && d.vision) {
      if (visionParts.length < maxVision) {
        const added = await visionPartsFor(d, () => ctx.readBytes(p));
        visionParts.push(...added);
        chunks.push(`=== FILE: ${p} (attached as image/scan${added.length > 1 ? `, ${added.length} page images` : ''}) ===`);
      } else {
        chunks.push(`=== FILE: ${p} (scan/photo not included: too many images in one request) ===`);
      }
    } else if (d.kind === 'unsupported') {
      chunks.push(`=== FILE: ${p} (${(d.warnings || []).join(' ') || 'unsupported format'}) ===`);
    } else {
      const text = ctx.masker.mask(d.text || '');
      const clipped = text.length > share ? `${text.slice(0, share)}\n(… ${text.length - share} more characters not shown)` : text;
      chunks.push(`=== FILE: ${p} (${describeParsed(d)}) ===\n${clipped}`);
    }
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
/**
 * Names and the ONE value column of a simple grade/score file (e.g. STUDENT | Grade).
 * Several number columns: the one headed Grade / Rating / Final / Term / Average is
 * used; otherwise KaTuro asks. → [{ name, score }]
 */
async function readOneValueColumn(path, ctx) {
  const parsed = await ctx.readParsed(path);
  const file = String(path).split('/').pop();
  const sheet = (parsed.sheets || []).find((s) => (s.rows || []).length > 1);
  if (!sheet) throw needsInfo(`${file} has no table I can read (it should have a names column and a grade column).`);
  const rows = sheet.rows;
  const text = (v) => (v === null || v === undefined ? '' : String(v)).trim();
  let headerRow = -1; let nameCol = -1;
  for (let r = 0; r < Math.min(rows.length, 15) && headerRow < 0; r++) {
    (rows[r] || []).forEach((v, c) => { if (headerRow < 0 && /name|learner|pangalan|student|pupil/i.test(text(v))) { headerRow = r; nameCol = c; } });
  }
  if (headerRow < 0) throw needsInfo(`I could not find the names column in ${file}.`);
  const learners = rows.slice(headerRow + 1).filter((row) => /[A-Za-zÑñ]{2,}/.test(text((row || [])[nameCol])) && !/^(total|average|mean|highest|lowest|male|female|boys?|girls?)\b/i.test(text((row || [])[nameCol])));
  const width = Math.max(...rows.slice(headerRow, headerRow + 1 + learners.length).map((r) => (r || []).length));
  const numericCols = [];
  for (let c = 0; c < width; c++) {
    if (c === nameCol) continue;
    const vals = learners.map((row) => text((row || [])[c])).filter(Boolean);
    const nums = vals.filter((v) => Number.isFinite(Number(v)) && Number(v) >= 0 && Number(v) <= 100);
    if (learners.length && nums.length >= Math.max(1, Math.ceil(learners.length * 0.6))) numericCols.push({ c, header: text(rows[headerRow][c]) });
  }
  let col = numericCols.length === 1 ? numericCols[0] : null;
  if (!col && numericCols.length > 1) {
    const named = numericCols.filter((x) => /grade|rating|final|term|average|ave\b/i.test(x.header) && !/total|hps|highest/i.test(x.header));
    if (named.length === 1) col = named[0];
    else throw needsInfo(`${file} has several number columns (${numericCols.map((x) => x.header || `column ${x.c + 1}`).join(', ')}). Which one should go into your table?`);
  }
  if (!col) throw needsInfo(`I could not find a grade or score column in ${file}.`);
  return learners.map((row) => ({ name: text(row[nameCol]), score: text(row[col.c]) === '' ? null : Number(text(row[col.c])) }))
    .filter((v) => v.score !== null && Number.isFinite(v.score));
}

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
    parts.push(...(await visionPartsFor(parsed, () => ctx.readBytes(path))));
  }
  const textContext = parsed.needsVision ? '' : `\n\nDocument text:\n${ctx.masker.mask(parsed.text || '').slice(0, 20000)}`;
  const result = await ctx.llm({
    system: `You are a meticulous data-entry assistant for a Filipino DepEd teacher. You transcribe tables exactly, including handwritten ones. Never correct, complete, or guess a value: copy what is written; if a cell is unreadable write "?" and list it in notes.\n${GROUNDING_RULES}`,
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

/**
 * Missing information is never guessed: tools throw this, and the teacher sees the question.
 * (e.g. no HPS row, total items not stated, learning area unknown, no answer key)
 */
/** Everything the AI was allowed to use, for verifySpec(). */
function allowedTextFor(ctx, ...parts) {
  return [ctx.teacher.facts, ...parts.map((p) => ctx.masker.unmask(String(p || '')))].join('\n');
}

export function needsInfo(question) {
  const e = new Error(question);
  e.code = 'NEEDS_INFO';
  return e;
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
        prompt: `You have already greeted the teacher, so start directly with the answer (no greeting). Answer ONLY from the files below. Say which file each fact comes from. If the files do not contain the answer, say so plainly — do not guess or use outside assumptions about this class.\n\nQuestion: ${question}\n\nFiles:\n${text}`,
        parts: visionParts,
        maxTokens: 3072,
        onText: (full) => ctx.streamReply?.(ctx.masker.unmask(full)),
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

      // DLL and TOS+test: write the parts in parallel (much faster); fall back to one call if a part fails.
      if (docType === 'dll' || docType === 'tos_test') {
        try {
          const { buildDllParallel, buildTosParallel } = await import('./docBuilders.js');
          const builder = docType === 'dll' ? buildDllParallel : buildTosParallel;
          const built = await builder({ ctx, title, instructions, subject, gradeLevel, curriculum, source: { text, visionParts }, report });
          const checked = verifySpec(built.spec, { allowedText: allowedTextFor(ctx, instructions, curriculum, text), knownNames: ctx.masker.names() });
          const spec = normalizeDocumentSpec({ ...checked.spec, header: headerFor(ctx), signatures: teacherSignatures(ctx) });
          report('Building the file…');
          const files = await saveDocumentOutputs(spec, slug(spec.title), formats, ctx);
          return { summary: `Created ${files.map((f) => f.name).join(' and ')}`, warnings: [...built.warnings, ...checked.warnings], artifacts: [documentArtifact(spec, files, { docType })] };
        } catch (err) {
          // Missing information is asked for — never papered over by the single-call writer.
          if (err?.code === 'AI_UNAVAILABLE' || err?.code === 'NEEDS_INFO') throw err;
          console.warn(`[KaTuroDesk] Parallel ${docType} failed, using single-call writer:`, err);
        }
      }

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
          ctx.teacher.facts,
          text ? `\nSource files (use their actual content):\n${text}` : '',
        ].filter(Boolean).join('\n'),
        parts: visionParts,
        json: true,
        maxTokens: 12000,
      });
      const checked = verifySpec(ctx.masker.unmask(raw), { allowedText: allowedTextFor(ctx, instructions, curriculum, text), knownNames: ctx.masker.names() });
      const spec = normalizeDocumentSpec({
        ...checked.spec,
        header: headerFor(ctx),
        // Signatures always come from the teacher's profile — never from the AI (no invented names).
        signatures: teacherSignatures(ctx),
      });
      if (!spec.blocks.length) throw new Error('The AI returned an empty document. Please try again with more detail.');
      if (title) spec.title = title;
      report('Building the file…');
      const files = await saveDocumentOutputs(spec, slug(spec.title), formats, ctx);
      return { summary: `Created ${files.map((f) => f.name).join(' and ')}`, warnings: checked.warnings, artifacts: [documentArtifact(spec, files, { docType })] };
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
      const checked = verifySpec(ctx.masker.unmask(raw), { allowedText: allowedTextFor(ctx, JSON.stringify(current.spec), instructions), knownNames: ctx.masker.names() });
      const spec = normalizeDocumentSpec({ ...checked.spec, header: current.spec.header });
      const fmts = formats || [...new Set((current.files || []).map((f) => f.format).filter((f) => ['docx', 'pdf'].includes(f)))];
      const files = await saveDocumentOutputs(spec, `${slug(spec.title)}_revised`, fmts.length ? fmts : ['docx'], ctx);
      return { summary: `Saved the revised version as ${files.map((f) => f.name).join(' and ')}`, warnings: checked.warnings, artifacts: [documentArtifact(spec, files)] };
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
        system: `You create clear, engaging DepEd classroom slide decks (MATATAG-aligned). Short bullets (max 6 per slide, max 12 words each), age-appropriate language, include an activity slide, a generalization slide and a short check-for-understanding slide.\n${GROUNDING_RULES}`,
        prompt: `Return ONLY JSON: {"title": string, "subtitle": string, "slides": [{"title": string, "layout": "title"|"bullets"|"twoColumn", "bullets": [string], "left"?: [string], "right"?: [string], "notes": string (what the teacher says)}]}\nTopic: ${topic}\n${subject ? `Learning area: ${subject}\n` : ''}${gradeLevel ? `Grade level: ${gradeLevel}\n` : ''}About ${numberOr(slideCount, 10)} slides. ${ctx.masker.mask(instructions)}${text ? `\n\nSource files:\n${text}` : ''}`,
        parts: visionParts,
        json: true,
        maxTokens: 8192,
      });
      const checkedSlides = verifySpec(ctx.masker.unmask(raw), { allowedText: allowedTextFor(ctx, topic, instructions, text), knownNames: ctx.masker.names() });
      const spec = normalizeSlidesSpec(checkedSlides.spec);
      if (!spec.slides.length) throw new Error('The AI returned no slides. Please try again.');
      report('Building the PowerPoint…');
      const { buildPptx } = await import('../generators/pptxFromSpec.js');
      const file = await ctx.saveOutput(`${slug(spec.title)}.pptx`, await buildPptx(spec), 'pptx');
      return {
        summary: `Created ${file.name} (${spec.slides.length} slides)`,
        warnings: checkedSlides.warnings,
        artifacts: [{ type: 'slides', title: spec.title, subtitle: file.name, spec, files: [file], editable: false }],
      };
    },
  },

  make_spreadsheet: {
    label: 'Make spreadsheet',
    description: 'Design a NEW Excel workbook from instructions or a few short sources (e.g. masterlist template, inventory, schedule, tally sheet). To put together the data of several existing files, use consolidate_files instead.',
    args: '{ "title": string, "instructions": string, "sourcePaths"?: [string] }',
    async run({ title = '', instructions = '', sourcePaths = [] }, ctx, report) {
      const { text, visionParts } = await gatherSourceText(sourcePaths, ctx);
      report('Designing the workbook…');
      const raw = await ctx.llm({
        system: `You build tidy, ready-to-use Excel workbooks for Filipino DepEd teachers. Put only data the teacher or the files gave you; leave cells blank when a value is unknown.\n${GROUNDING_RULES}`,
        prompt: `Return ONLY JSON: {"title": string, "sheets": [{"name": string, "columns": [{"header": string, "width"?: number}], "rows": [[string|number|null]]}]}\nNumbers must be JSON numbers. Title: ${title}\nInstructions: ${ctx.masker.mask(instructions)}${text ? `\n\nSource files:\n${text}` : ''}`,
        parts: visionParts,
        json: true,
        maxTokens: 16000,
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

  consolidate_files: {
    label: 'Combine files into one Excel',
    description: "Combine MANY existing files into ONE Excel workbook (consolidate, compile, merge or put together the data of several files or a whole folder). Every spreadsheet sheet and Word table is copied exactly by code (never retyped), photos/scans of tables are read one by one, and an Index sheet lists each file and what was taken. Always use this, not make_spreadsheet, when the data comes from several existing files. NOT for filling or completing the teacher's own existing table/template (use fill_table_from_files), and not for report cards (use build_report_cards).",
    args: '{ "sourcePaths": [string], "title"?: string }',
    async run({ sourcePaths = [], title = '' }, ctx, report) {
      const paths = [...new Set(sourcePaths)];
      if (!paths.length) throw new Error('Tell me which files to combine (tick them in the explorer, or name the folder).');
      report(`Reading ${paths.length} file(s)…`);
      const parsed = await Promise.all(paths.map((p) => ctx.readParsed(p).then((d) => ({ p, d }), (error) => ({ p, error }))));

      // Photos/scans: one small AI request each (3 at a time), so no reply can get too long.
      const photos = parsed.filter((x) => x.d?.needsVision && x.d.vision);
      const photoTables = new Map();
      if (photos.length) report(`Reading ${photos.length} photo(s)/scan(s)…`);
      let nextPhoto = 0;
      const worker = async () => {
        while (nextPhoto < photos.length) {
          const { p } = photos[nextPhoto++];
          try {
            const t = await extractTableWithAI(p, ctx, 'the main table (every row and column, including learner names and scores)');
            photoTables.set(p, ctx.masker.unmask(t));
          } catch (err) {
            photoTables.set(p, { error: err?.message || 'could not be read' });
          }
        }
      };
      await Promise.all(Array.from({ length: Math.min(3, photos.length) }, worker));

      const entries = parsed.map(({ p, d, error }) => {
        if (error || !d) return { path: p, skipped: `Could not be read: ${error?.message || 'unknown error'}` };
        if (d.sheets) return { path: p, sheets: d.sheets.map((s) => ({ name: s.name, rows: s.rows })) };
        if (d.needsVision && d.vision) {
          const t = photoTables.get(p);
          return t && !t.error ? { path: p, photo: t } : { path: p, skipped: `Photo/scan could not be read: ${t?.error || 'no table found'}` };
        }
        if (Array.isArray(d.tables)) return { path: p, tables: d.tables };
        if (d.kind === 'unsupported') return { path: p, skipped: (d.warnings || []).join(' ') || 'Unsupported file type.' };
        return { path: p, skipped: 'No table to copy (text only). Ask me to extract a table from it if it has one.' };
      });

      const spec = buildConsolidatedSpec(entries, { title: title || 'Consolidated Files' });
      const { buildSheetWorkbook } = await import('../generators/xlsxWriters.js');
      report('Building the workbook…');
      const file = await ctx.saveOutput(`${slug(spec.title)}.xlsx`, await buildSheetWorkbook(spec), 'xlsx');
      const dataSheets = spec.sheets.length - 1;
      const notIncluded = entries.filter((e) => e.skipped).length;
      const fromPhotos = entries.filter((e) => e.photo).length;
      const parts = [`Combined ${paths.length - notIncluded} file(s) into ${dataSheets} sheet(s) in ${file.name}, with an Index sheet listing each file`];
      if (fromPhotos) parts.push(`${fromPhotos} sheet(s) were read from photos: please check them against the originals`);
      if (notIncluded) parts.push(`${notIncluded} file(s) had nothing to copy or could not be read (see the Index sheet)`);
      return {
        summary: `${parts.join('. ')}.`,
        artifacts: [{ type: 'sheet', title: spec.title, subtitle: file.name, spec, files: [file], editable: false }],
      };
    },
  },

  build_report_cards: {
    label: 'Report cards (SF9) from class records',
    description: "Consolidate each learner's grades from the subject teachers' class records into the Learner's Performance Report (SF9) for a whole section: Term 1–3 grades per learning area, Final Grade, Remarks and General Average, plus a summary workbook (final grades, promotion, checks). Use for \"consolidate the grades\", \"report cards\", \"cards\", \"SF9\" from a class adviser. Computed entirely by code under DepEd Order No. 15, s. 2026; no learner data is sent to the AI. quartersAsTerms: true ONLY after the teacher answered yes to KaTuro's question that their files' 1st–3rd Quarter columns are Term 1–3.",
    args: '{ "sourcePaths": [string], "grade"?: string, "section"?: string, "schoolYear"?: string, "quartersAsTerms"?: boolean }',
    async run({ sourcePaths = [], grade = '', section = '', schoolYear = '', quartersAsTerms = false }, ctx, report) {
      const {
        extractGradeRecords, consolidateLearners, buildReportCardSpec, buildSummarySheetSpec,
      } = await import('./reportCards.js');
      const { gradingModeFor, gradeNumber } = await import('../knowledge/gradingRules.js');
      const paths = [...new Set(sourcePaths)].filter((p) => /\.(xlsx|xlsm|xls|csv|docx)$/i.test(p));
      if (!paths.length) throw new Error("Tell me which class records to use: tick every subject's class record for the section (Excel or Word), or name the folder.");
      report(`Reading ${paths.length} class record(s)…`);
      const parsed = await Promise.all(paths.map((p) => ctx.readParsed(p).then((d) => ({ p, d }), (error) => ({ p, error }))));
      const fileResults = [];
      const notes = [];
      const found = { grade: '', section: '' };
      const quarterFiles = [];
      for (const { p, d, error } of parsed) {
        if (error || !d) { notes.push(`${p.split('/').pop()}: could not be read (${error?.message || 'unknown error'}).`); continue; }
        // Grades stay on this computer: names are read as written, never masked or sent anywhere.
        const res = extractGradeRecords(p, d, { quartersAsTerms: quartersAsTerms === true });
        notes.push(...res.notes);
        if (res.meta.quarterLabels) quarterFiles.push(p.split('/').pop());
        found.grade ||= res.meta.grade; found.section ||= res.meta.section;
        fileResults.push({ path: p, records: res.records });
      }
      // The teacher's own "Advisory class" (profile) counts as stated: "Grade 5 – Rizal".
      const advisory = String(ctx.teacher.advisoryClass || '');
      const [advGrade, advSection] = advisory.split(/\s+[–-]\s+/);
      const gradeLevel = String(grade || found.grade || (gradeNumber(advGrade) !== null ? advGrade : '') || '').trim();
      const sectionName = String(section || found.section || (advGrade && advSection ? advSection : '') || '').trim();
      const sy = String(schoolYear || ctx.schoolYear || '').trim();
      if (gradeNumber(gradeLevel) === null) {
        throw needsInfo('Which grade level is this class? The grading rules depend on it (for example, Grade 1 is descriptive in SY 2026–2027).');
      }
      const mode = gradingModeFor(sy, gradeLevel);
      if (mode.mode === 'descriptive') {
        throw needsInfo(`In SY ${sy}, Grade ${gradeNumber(gradeLevel) || 'Kindergarten'} uses the descriptive ${mode.report}, with no numerical grades (${mode.source}). Tell me if you want me to prepare it from your learners' ratings instead.`);
      }
      const { learners, areas, checks } = consolidateLearners(fileResults, { terms: mode.terms });
      // Old templates still say "1st Quarter": ask, never assume they are Term 1–3.
      if (quarterFiles.length && !quartersAsTerms) {
        throw needsInfo(`${quarterFiles.length === 1 ? `${quarterFiles[0]} labels` : `${quarterFiles.length} of your files (${quarterFiles.slice(0, 3).join(', ')}${quarterFiles.length > 3 ? '…' : ''}) label`} the grades by quarter ("1st Quarter, 2nd Quarter…"), but SY ${sy} uses three terms (DepEd Order No. 15, s. 2026). Are the 1st, 2nd and 3rd Quarter columns your Term 1, Term 2 and Term 3 grades? Reply "Yes, use them as Term 1 to 3" and I will prepare the report cards. A 4th Quarter column is never used.`);
      }
      if (!learners.length) {
        throw needsInfo(`I could not find learner names with term grades in these files. ${notes.slice(0, 3).join(' ')}`.trim());
      }
      const info = {
        schoolYear: sy, grade: String(gradeNumber(gradeLevel)), section: sectionName,
        school: ctx.teacher.school, district: ctx.teacher.district, division: ctx.teacher.division, region: ctx.teacher.region,
        adviser: ctx.teacher.fullName,
      };
      const usedFor = new Map();
      for (const l of learners) for (const a of l.areas.values()) for (const s of a.sources || []) {
        const set = usedFor.get(s) || new Set(); set.add(a.name); usedFor.set(s, set);
      }
      const sources = [...usedFor.entries()].map(([file, set]) => ({ file, usedFor: [...set].join(', ') }));

      report('Building the report cards…');
      const cardSpec = buildReportCardSpec({ learners, areas, info });
      const sheetSpec = buildSummarySheetSpec({ learners, areas, checks, info, sources, notes });
      const base = slug(`Report_Cards_Grade${info.grade}${sectionName ? `_${sectionName}` : ''}`);
      const files = await saveDocumentOutputs(cardSpec, base, ['docx'], ctx);
      const { buildSheetWorkbook } = await import('../generators/xlsxWriters.js');
      const sheetFile = await ctx.saveOutput(`${slug(`Summary_of_Grades_Grade${info.grade}${sectionName ? `_${sectionName}` : ''}`)}.xlsx`, await buildSheetWorkbook(sheetSpec), 'xlsx');

      const complete = learners.filter((l) => l.generalAverage !== null).length;
      const termsWithGrades = [1, 2, 3].filter((t) => learners.some((l) => [...l.areas.values()].some((a) => typeof a.terms[t] === 'number')));
      const parts = [`Prepared report cards for **${learners.length} learner(s)** (${areas.filter((k) => !['music_arts', 'pe_health'].includes(k)).length} learning areas) from ${sources.length} class record(s)`];
      parts.push(complete === learners.length
        ? 'Final Grades and General Averages are computed (average of the three terms, DO 15, s. 2026)'
        : termsWithGrades.length < mode.terms
          ? `Grades found for Term ${termsWithGrades.join(', ') || '—'} only, so Final Grades and General Averages will be filled in once all ${mode.terms} terms are recorded`
          : `${learners.length - complete} learner(s) have missing grades, so their Final Grade or General Average is left blank`);
      if (checks.length) parts.push(`**${checks.length} item(s) to check** are listed in the Checks sheet (missing grades, name spellings, unusual values)`);
      if (notes.length) parts.push(`${notes.length} file note(s): ${notes.slice(0, 2).join(' ').replace(/\.$/, '')}`);
      return {
        summary: `${parts.join('. ')}. Grades were computed by code from your files; nothing was estimated by AI.`,
        artifacts: [
          { type: 'document', title: cardSpec.title, subtitle: files[0]?.name, spec: cardSpec, files, editable: false },
          { type: 'sheet', title: sheetSpec.title, subtitle: sheetFile.name, spec: sheetSpec, files: [sheetFile], editable: false },
        ],
      };
    },
  },

  analyze_scores: {
    label: 'Item analysis & LMC',
    description: 'Item analysis of a quiz/test score sheet (Excel/CSV, photo, or scanned PDF): MPS, mastery level, difficulty & discrimination per item, Least Mastered Competencies, learners below 75%. Saves an Item Analysis report (.docx) and workbook (.xlsx). Computed exactly in code.',
    args: '{ "path": string, "sheet"?: string, "testTitle"?: string, "subject"?: string, "gradeSection"?: string, "quarter"?: string, "competencies"?: [string] (one per item, optional), "lmcThreshold"?: number, "totalItems"?: number (ONLY if the teacher stated it) }',
    async run({ path, sheet, testTitle, subject, gradeSection, quarter, competencies = [], lmcThreshold = 75, totalItems: statedTotal }, ctx, report) {
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
      if (table.needsAnswerKey) {
        throw needsInfo(`${path} has letter answers but no answer key. Please add a row labeled KEY with the correct answer for each item, then ask me again.`);
      }
      if (table.mode === 'items' && table.responses?.length) {
        report(`Analyzing ${table.learners.length} learners × ${table.itemCols.length} items…`);
        const items = table.itemCols.map((c, i) => ({ number: i + 1, competency: competencies[i] || '' }));
        analysis = analyzeItems(toResponseMatrix(table), items, { lmcThreshold: numberOr(lmcThreshold, 75) });
        kind = 'items';
      } else {
        const totals = toTotals(table);
        const stated = Number(statedTotal);
        if (!totals.totalItems && Number.isFinite(stated) && stated > 0) totals.totalItems = stated;
        if (!totals.totalItems) throw needsInfo(`${path} has total scores but doesn't say how many items the test had. How many items? (e.g. "out of 30")`);
        const over = totals.learners.filter((l) => l.score > totals.totalItems);
        if (over.length) throw needsInfo(`${over.length} learner(s) in ${path} scored above ${totals.totalItems} (e.g. ${over[0].name}: ${over[0].score}). Please check the total number of items or those scores.`);
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
          system: ctx.docPersona,
          prompt: `Write DepEd item-analysis remarks. Return JSON {"remarks": [string], "interventions": [string]} (3-5 each, specific, practical, simple English).\nTest: ${meta.testTitle}. ${subject ? `Learning area: ${subject}.` : ''}\nExaminees: ${analysis.examinees}. MPS: ${analysis.mps}% (${analysis.masteryLevel}).${kind === 'items' ? `\nLeast mastered items: ${lmc.join('; ') || 'none'}` : `\nLearners below ${analysis.passPercent}%: ${analysis.belowPass.length}`}`,
          json: true,
          maxTokens: 1500,
          tier: 'fast',
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
        // Signatories come from the teacher's profile (the template's own defaults are placeholders).
        const base = { ...itemAnalysisReportSpec(analysis, meta, { remarks, interventions }), signatures: teacherSignatures(ctx) };
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
        system: `${ctx.docPersona}\nYou write short, scaffolded remedial materials for struggling learners.`,
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
      const checkedSlips = verifySpec(spec, { allowedText: allowedTextFor(ctx, focus, text, competency), knownNames: ctx.masker.names() });
      report('Building the printable slips…');
      const files = await saveDocumentOutputs(checkedSlips.spec, slug(`Remedial_Slips_${practice.competency || focus || subject}`, 50), formats, ctx);
      return { summary: `Created remedial slips + 5-item re-test (${files.map((f) => f.name).join(', ')})`, warnings: checkedSlips.warnings, artifacts: [documentArtifact(checkedSlips.spec, files)] };
    },
  },

  make_class_record: {
    label: 'e-Class Record',
    description: 'Encode raw scores into an official DepEd e-Class Record workbook (DO 8 s.2015: WW/PT/QA, PS, WS, initial and transmuted grades with live Excel formulas) plus a printable grade summary. Source can be an Excel/CSV score sheet, a photo, or scanned PDF.',
    args: '{ "path": string, "sheet"?: string, "subject"?: string, "gradeLevel"?: string, "gradeSection"?: string, "quarter"?: string, "weights"?: "languages"|"scienceMath"|"mapehEpp"|"shsCore"|"shsAcademic"|"shsImmersion"|"shsTvl", "component"?: "ww"|"pt"|"qa" (ONLY if the teacher said which component a single score column is), "hps"?: number (ONLY if the teacher stated the highest possible score) }',
    async run({ path, sheet, subject = '', gradeLevel = '', gradeSection = '', quarter = '', weights, component, hps: statedHps }, ctx, report) {
      // DO 8 weights depend on the learning area — never guess it.
      if (!WEIGHT_PRESETS[weights] && !String(subject).trim()) {
        throw needsInfo('Which learning area is this class record for? (DepEd Order 8 uses different weights: e.g. Math/Science 40-40-20, Languages/AP/EsP 30-50-20, MAPEH/EPP/TLE 20-60-20.) Tell me the subject and grade level.');
      }
      report(`Reading scores from ${path}…`);
      const { table, sheetName } = await loadScoreTable(path, ctx, { sheet });
      let learners;
      let hps;
      if (table.mode === 'components') {
        if (table.hpsMissing) {
          throw needsInfo(`${path} is missing some highest possible scores (HPS). Please add an HPS row above the learners with the perfect score of every Written Work, Performance Task and Quarterly Assessment, then ask me again.`);
        }
        ({ learners, hps } = toComponentLearners(table));
      } else {
        // A single column of scores: the teacher must say which component it is and its HPS.
        const totals = toTotals(table);
        const total = totals.totalItems || (Number(statedHps) > 0 ? Number(statedHps) : null);
        if (!['ww', 'pt', 'qa'].includes(component) || !total) {
          throw needsInfo(`${path} has only one column of scores. Which component are they (Written Work, Performance Task, or Quarterly Assessment)${total ? '' : ', and what is the highest possible score'}?`);
        }
        const byName = new Map(totals.learners.map((l) => [l.name, l.score]));
        learners = table.learners.map((l) => ({
          name: l.name,
          gender: l.gender,
          ww: { scores: component === 'ww' ? [byName.get(l.name) ?? null] : [] },
          pt: { scores: component === 'pt' ? [byName.get(l.name) ?? null] : [] },
          qa: { scores: component === 'qa' ? [byName.get(l.name) ?? null] : [] },
        }));
        hps = { ww: component === 'ww' ? [total] : [], pt: component === 'pt' ? [total] : [], qa: component === 'qa' ? [total] : [] };
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
      const summary = `${learners.length} learners encoded; ${failing} below 75. DO 8 weights used: ${preset.label} — WW ${Math.round(preset.ww * 100)}% / PT ${Math.round(preset.pt * 100)}% / QA ${Math.round(preset.qa * 100)}%${WEIGHT_PRESETS[weights] ? '' : ` (from the subject "${subject}"${gradeLevel ? `, ${gradeLevel}` : ''}; tell me if these weights are wrong)`}`;
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
          teacherName: ctx.teacher.fullName,
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
    description: "Type scores from a source (score sheet, extracted table, or analysis) into the teacher's OWN existing Excel file (e.g. their e-Class Record) by matching learner names, keeping all their formatting and formulas. Safe-edit SOP: the original is backed up to KaTuro Backups and the scores go into a working copy named <name> (KaTuro edit).xlsx beside it; the original is never changed.",
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
      // Safe-edit SOP: original backed up, scores typed into a working clone beside it.
      const file = await ctx.saveWorkingCopy(targetPath, result.bytes, 'xlsx');
      const parts = [`${result.written.length} score(s) typed into column ${targetColumn}`];
      if (result.unmatched.length) parts.push(`${result.unmatched.length} name(s) not found: ${result.unmatched.slice(0, 5).join(', ')}${result.unmatched.length > 5 ? '…' : ''}`);
      if (result.skippedExisting.length) parts.push(`${result.skippedExisting.length} cell(s) already had a value and were kept`);
      const spec = normalizeSheetSpec({
        title: `Encoding check — ${file.name}`,
        sheets: [{ name: 'Encoded', columns: [{ header: 'Learner (source)' }, { header: 'Matched name in your file' }, { header: 'Row' }, { header: 'Score' }], rows: result.written.map((w) => [w.name, w.matchedName, w.row, w.score]) }],
      });
      return { summary: `${parts.join('; ')}. Your original is untouched (backup in ${file.backups[0] ? file.backups[0].split('/').slice(0, 2).join('/') : 'KaTuro Backups'}); edited copy: ${file.name}`, artifacts: [{ type: 'sheet', title: spec.title, subtitle: parts.join(' · '), spec, files: [file], editable: false }] };
    },
  },

  check_grade_sheets: {
    label: 'Check grade sheets for errors',
    description: "Check the teacher's grade sheets / class records / consolidation files for mistakes BEFORE they submit: missing grades, text where a grade should be, grades outside 0-100 or below 60, scores above the highest possible score, totals and averages that do not add up, duplicate or wrong LRNs, the same learner spelled differently across files, and learners missing from a file. Read-only (files are not changed); computed by code, nothing is sent to the AI. Use for 'check my grades', 'any errors before I submit', 'verify my class record'.",
    args: '{ "sourcePaths": [string] }',
    async run({ sourcePaths = [] }, ctx, report) {
      const paths = [...new Set(sourcePaths)].filter((p) => /\.(xlsx|xlsm|xls|csv)$/i.test(p));
      if (!paths.length) throw needsInfo('Which grade sheets should I check? Tick them in the explorer or name them (Excel or CSV).');
      const { checkGradeFiles, cellsFromExcelJs } = await import('./gradeCheck.js');
      const ExcelJS = (await import('exceljs')).default;
      const fileName = (p) => String(p).split('/').pop();
      const files = [];
      const unreadable = [];
      for (const p of paths) {
        report(`Checking ${fileName(p)}…`);
        try {
          if (/\.(xlsx|xlsm)$/i.test(p)) {
            const wb = new ExcelJS.Workbook();
            await wb.xlsx.load(await ctx.readBytes(p));
            files.push({ name: fileName(p), sheets: wb.worksheets.filter((ws) => ws.state !== 'hidden').map((ws) => ({ name: ws.name, cells: cellsFromExcelJs(ws) })) });
          } else {
            const parsed = await ctx.readParsed(p);
            files.push({ name: fileName(p), sheets: (parsed.sheets || []).map((s) => ({ name: s.name, cells: (s.rows || []).map((row) => (row || []).map((v) => ({ v: v ?? null, f: null }))) })) });
          }
        } catch (e) {
          unreadable.push(`${fileName(p)} (${e?.message || 'could not be read'})`);
        }
      }
      const { issues, checked } = checkGradeFiles(files);
      if (!checked.learnerLists) throw needsInfo(`I could not find a learner list with grades in ${paths.map(fileName).join(', ')}. Each sheet needs a names column with a heading (e.g. "Learner's Name" or "STUDENT").`);

      const errors = issues.filter((i) => i.severity === 'error');
      const warnings = issues.filter((i) => i.severity === 'warning');
      const byType = [...issues.reduce((m, i) => m.set(i.type, (m.get(i.type) || 0) + 1), new Map()).entries()];
      const spec = normalizeSheetSpec({
        title: `Grade check — ${issues.length ? `${issues.length} item(s) to check` : 'no problems found'}`,
        sheets: [
          {
            name: 'Issues',
            columns: [{ header: 'Level' }, { header: 'Problem' }, { header: 'File' }, { header: 'Sheet' }, { header: 'Cell' }, { header: 'Learner' }, { header: 'Details' }],
            rows: issues.length
              ? issues.map((i) => [i.severity === 'error' ? 'Error' : 'Check', i.type, i.file, i.sheet, i.cell, i.learner, i.detail])
              : [['', 'No problems found', '', '', '', '', `Checked ${checked.learnerLists} learner list(s) in ${checked.files} file(s).`]],
          },
          {
            name: 'What was checked',
            columns: [{ header: 'Check' }, { header: 'Rule' }],
            rows: [
              ['Missing grades', 'An empty cell in a grade column that is otherwise filled.'],
              ['Not a number', 'Text (or a stray symbol) where a grade or score should be.'],
              ['Out of range', 'Grades must be 0 to 100; scores cannot be below 0.'],
              ['Below 60', 'The lowest grade DepEd allows on report cards is 60 (DO 15, s. 2026, Annex D para 18).'],
              ['Above highest possible score', 'A score higher than the HPS row of the class record.'],
              ['Totals / averages', 'Hand-typed totals compared with the scores before them; formulas recomputed and compared with the saved result.'],
              ['LRN', 'Duplicates, LRNs that are not 12 digits, one LRN with different names.'],
              ['Across files', 'The same learner spelled differently, and learners missing from a list.'],
            ],
          },
        ],
      });
      const { buildSheetWorkbook } = await import('../generators/xlsxWriters.js');
      const out = await ctx.saveOutput(`${slug('Grade_Check')}.xlsx`, await buildSheetWorkbook(spec), 'xlsx');
      const head = issues.length
        ? `Found **${errors.length} error(s)** and **${warnings.length} item(s) to check** in ${checked.learnerLists} learner list(s): ${byType.map(([t, n]) => `${t} ${n}`).join(', ')}.`
        : `**No problems found** in ${checked.learnerLists} learner list(s) from ${checked.files} file(s).`;
      return {
        summary: `${head}${unreadable.length ? ` Could not read: ${unreadable.join('; ')}.` : ''} Your files were not changed. Checked by code; nothing was sent to the AI. The list is in ${out.name}.`,
        artifacts: [{ type: 'sheet', title: spec.title, subtitle: `${errors.length} error(s) · ${warnings.length} to check`, spec, files: [out], editable: false }],
      };
    },
  },

  fill_table_from_files: {
    label: 'Fill my table from several files',
    description: "Fill the teacher's OWN existing Excel table (their consolidation sheet, template or class summary, e.g. conso.xlsx with columns AP | FILIPINO | MATH | SCIENCE | Average) with values taken from SEVERAL files, one column per file (e.g. AP_Term1.xlsx, Filipino_Term1.xlsx…). Learners are matched by name; each file goes to the column whose heading names the same subject (or as the teacher says); an empty Average column gets an =AVERAGE formula. Computed by code, no AI. Safe-edit SOP: the original is backed up and a working copy '<name> (KaTuro edit).xlsx' is filled. Use this, not consolidate_files, whenever the teacher wants their own file edited/completed/filled with data from other files.",
    args: '{ "targetPath": string, "sourcePaths": [string], "columnFor"?: { "<source file name>": "<column heading or letter in the target>" }, "sheetName"?: string }',
    async run({ targetPath, sourcePaths = [], columnFor = {}, sheetName }, ctx, report) {
      if (!targetPath || !/\.xlsx$/i.test(targetPath)) throw new Error('Tell me which Excel file to fill (it must be .xlsx).');
      const sources = [...new Set(sourcePaths)].filter((p) => p && p !== targetPath);
      if (!sources.length) throw needsInfo('Which files should I take the data from?');
      const { matchLearningArea } = await import('../knowledge/gradingRules.js');
      const { findWorkbookColumns, fillColumnsInWorkbook } = await import('../generators/fillTemplates.js');
      const fileName = (p) => String(p).split('/').pop();
      const stem = (p) => fileName(p).replace(/\.[^.]+$/, '');

      // The teacher's table: its header row (the one with the names heading) and columns.
      const targetBytes = await ctx.readBytes(targetPath);
      const { headers } = await findWorkbookColumns(targetBytes, sheetName);
      const nameHeader = headers.find((h) => /name|learner|pangalan|student|pupil/i.test(h.text));
      if (!nameHeader) throw needsInfo(`I could not find the names column in ${fileName(targetPath)}. Which column has the learners' names?`);
      const headerRow = headers.filter((h) => h.row === nameHeader.row && h.col !== nameHeader.col);
      const averageHeader = headerRow.find((h) => /^(average|ave\.?|avg\.?|general\s+average|gen\.?\s*ave\.?|mean)$/i.test(h.text.trim()));
      const fillable = headerRow.filter((h) => h !== averageHeader);

      // Each source → one column of the table.
      const pick = (src) => {
        const asked = columnFor[fileName(src)] || columnFor[src] || columnFor[stem(src)];
        if (asked) return fillable.find((h) => h.letter === String(asked).toUpperCase() || h.text.trim().toLowerCase() === String(asked).trim().toLowerCase()) || null;
        const area = matchLearningArea(stem(src));
        if (!area) return null;
        const hits = fillable.filter((h) => matchLearningArea(h.text)?.key === area.key);
        return hits.length === 1 ? hits[0] : null;
      };
      const plan = sources.map((src) => ({ src, header: pick(src) }));
      const unplaced = plan.filter((p) => !p.header);
      const taken = new Map();
      for (const p of plan.filter((x) => x.header)) taken.set(p.header.letter, [...(taken.get(p.header.letter) || []), fileName(p.src)]);
      const clash = [...taken.entries()].find(([, files]) => files.length > 1);
      const columnList = fillable.map((h) => `${h.text.trim()} (column ${h.letter})`).join(', ');
      if (unplaced.length) throw needsInfo(`I could not tell which column of ${fileName(targetPath)} ${unplaced.map((p) => fileName(p.src)).join(', ')} ${unplaced.length > 1 ? 'belong' : 'belongs'} to. Your columns: ${columnList}. Tell me, e.g. "${fileName(unplaced[0].src)} goes to ${fillable[0]?.text.trim() || 'column B'}".`);
      if (clash) throw needsInfo(`${clash[1].join(' and ')} both look like column ${clash[0]} of ${fileName(targetPath)}. Which file goes to which column? Your columns: ${columnList}.`);

      // Each source's values: names + its one grade/score column.
      const columns = [];
      for (const { src, header } of plan) {
        report(`Reading ${fileName(src)}…`);
        const values = await readOneValueColumn(src, ctx);
        ctx.masker.addNames(values.map((v) => v.name));
        columns.push({ targetColumn: header.letter, label: `${header.text.trim()} ← ${fileName(src)}`, scores: values });
      }

      report(`Filling ${fileName(targetPath)}…`);
      const result = await fillColumnsInWorkbook(targetBytes, { sheetName, nameColumn: nameHeader.letter, columns, averageColumn: averageHeader?.letter || null });
      const file = await ctx.saveWorkingCopy(targetPath, result.bytes, 'xlsx');

      const parts = result.filled.map((f) => `${f.label}: ${f.written} filled${f.unmatched.length ? `, ${f.unmatched.length} name(s) not found (${f.unmatched.slice(0, 3).join(', ')}${f.unmatched.length > 3 ? '…' : ''})` : ''}${f.keptExisting.length ? `, ${f.keptExisting.length} cell(s) already had a value and were kept (${f.keptExisting.slice(0, 3).join(', ')})` : ''}`);
      const notes = [];
      if (result.averageRows.length) notes.push(`${averageHeader.text.trim()} (column ${averageHeader.letter}) = the plain average of the filled subjects (=AVERAGE formula, not rounded; change it if your school rounds)`);
      if (result.symbolCellsReplaced.length) notes.push(`replaced stray symbols in ${result.symbolCellsReplaced.map((s) => `${s.cell} ("${s.was}")`).join(', ')}`);
      const empty = fillable.filter((h) => !plan.some((p) => p.header === h));
      if (empty.length) notes.push(`no file was given for ${empty.map((h) => h.text.trim()).join(', ')}, so ${empty.length > 1 ? 'those columns stay' : 'that column stays'} as it was`);

      const spec = normalizeSheetSpec({
        title: `Filled — ${file.name}`,
        sheets: [{
          name: 'Filled table',
          columns: [{ header: 'Row' }, { header: nameHeader.text.trim() }, ...result.filled.map((f) => ({ header: f.label.split(' ← ')[0] })), ...(averageHeader ? [{ header: averageHeader.text.trim() }] : [])],
          rows: result.rows.map((r) => [r.row, r.name, ...r.values.slice(0, result.filled.length).map((v) => (v === null || v === undefined ? '' : v)), ...(averageHeader ? [r.values[result.filled.length] ?? ''] : [])]),
        }],
      });
      return {
        summary: `Filled your ${fileName(targetPath)} from ${columns.length} file(s). ${parts.join('; ')}.${notes.length ? ` Notes: ${notes.join('; ')}.` : ''} Your original is untouched (backup in ${file.backups?.[0] ? file.backups[0].split('/').slice(0, 2).join('/') : 'KaTuro Backups'}); the filled copy is ${file.name}. Done by code; no names or grades were sent to the AI.`,
        artifacts: [{ type: 'sheet', title: spec.title, subtitle: `${columns.length} column(s) filled`, spec, files: [file], editable: false }],
      };
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
        system: ctx.docPersona,
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

export {
  documentSpecToText,
  base64ToBytes,
  slug,
  extractTableWithAI,
  documentArtifact,
  saveDocumentOutputs,
  headerFor,
  teacherSignatures,
  baseMeta,
};
