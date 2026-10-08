/**
 * planner.js — turns a teacher's request into a task graph (one Gemini call, JSON mode),
 * with an offline keyword planner so code-only tools still work without AI.
 */

import { TOOLS, TOOL_NAMES, toolCatalog } from './registry.js';
import { flattenFileTree } from '../../localFileSystem.js';

const MAX_TASKS = 12;
const MAX_INDEX_ENTRIES = 250;

function fmtSize(bytes) {
  if (!bytes && bytes !== 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** Compact file index for the planner: attached/active first, then most recent. */
export function buildFileIndex(files, { attachedPaths = [], activePath, describe } = {}) {
  // Backups are snapshots, never sources — keep them out of the AI's view of the folder.
  const flat = flattenFileTree(files).filter((f) => !f.path.startsWith('KaTuro Backups/'));
  const priority = new Set([...attachedPaths, activePath].filter(Boolean).map((p) => p.toLowerCase()));
  const sorted = [...flat].sort((a, b) => {
    const pa = priority.has(a.path.toLowerCase()) ? 1 : 0;
    const pb = priority.has(b.path.toLowerCase()) ? 1 : 0;
    if (pa !== pb) return pb - pa;
    return (b.lastModified || 0) - (a.lastModified || 0);
  });
  const shown = sorted.slice(0, MAX_INDEX_ENTRIES);
  const lines = shown.map((f) => {
    let info;
    try {
      info = describe?.(f.path) || '';
    } catch {
      info = '';
    }
    return `${f.path}${f.size ? ` (${fmtSize(f.size)})` : ''}${info ? ` — ${info}` : ''}`;
  });
  if (flat.length > shown.length) lines.push(`(… ${flat.length - shown.length} older files not listed)`);
  return { text: lines.join('\n'), count: flat.length };
}

export function buildPlannerSystem({ persona, teacherName, today }) {
  return `${persona}

You are the planner of KaTuroDesk, a desktop co-teacher that works directly on the teacher's local classroom folder.
Today is ${today}. The teacher is ${teacherName}.

Decide how to handle the teacher's latest message. Return ONLY JSON:
{"understanding": string, "confidence": "high"|"medium"|"low", "missing": [string], "assumptions": [string], "choices": [string], "reply": string, "tasks": [{"id": "t1", "tool": string, "label": string, "args": object, "dependsOn": [string]}]}

Tools you can use:
${toolCatalog()}

Rules:
1. Greetings, teaching advice, or general questions that need no files: answer fully in "reply" and return "tasks": [].
2. Otherwise "reply" is 1-2 short sentences telling the teacher what you will do. Results are added after the tasks run.
3. Use ONLY exact file paths from the folder index or attached files. Never invent a path. If the request needs a file you cannot identify, ask which file in "reply" and return no tasks.
4. "this file", "this", "it" usually means the attached files, then the active file.
5. Batches: create one task per file/section so they run in parallel (e.g. four section score sheets → four analyze_scores tasks). A remedial package for a section depends on that section's analyze_scores task.
6. Use dependsOn only when a task truly needs another task's result. Keep the plan minimal (max ${MAX_TASKS} tasks). "label" is a short human description, e.g. "Item analysis – Grade 7 Rizal".
7. Prefer code tools for numbers: analyze_scores, make_class_record, check_attendance compute exactly. Never ask the AI to compute grades.
8. If the teacher wants changes to the document open in the Canvas, use revise_document.
8b. "Summarize / review this folder (or subfolder)": use write_document with docType "summary" (or answer_from_files if they only want a chat answer) and put the relevant document files from the index in sourcePaths (up to 40; skip code, images and duplicates; prefer docx/pdf/xlsx/pptx). Say which files you included.
9. Schools use their OWN templates. Moving data between two existing papers (e.g. attendance in a Word doc → the SF2 Excel, scores → their class record, SF1 details → a masterlist) → transfer_data (source = where the data is, target = the file to fill). Checking/cross-checking two papers → compare_files. Changing words/values inside an existing Word/Excel file → edit_file. "What is this file / did you read it right" → understand_file. These keep the target's formatting and show a preview the teacher approves.
9e. "Consolidate / combine / compile / merge" the data of several existing files (or a folder) into one Excel → consolidate_files with all those files in sourcePaths (one task, not one per file). make_spreadsheet is only for designing a new sheet.
9w. "Which file has / where is / find the file with …" across the folder → search_files with terms = the key words, names and periods from the question (e.g. a learner's full name and "Term 1"; leave out words like "grades" or "file" that may not be written in it); folder only when the teacher named one. To answer a question FROM known files use answer_from_files instead.
9v. "Handout of my slides", "print my PowerPoint 3 per page", "notes pages" → slides_handout with path = that deck; perPage only when said (3 = with lines); notes true for speaker-notes pages.
9u. Changes to the teacher's OWN PowerPoint deck (.pptx): fix typos → edit_slides with fixTypos true; change words/content → instructions; "use our school template / restyle" → templatePath = the template deck. (edit_file is only for Word/Excel; make_slides makes a NEW deck.)
9t. "Check these answer sheets / test papers" from PHOTOS (a folder of pictures, one learner's sheet each) → check_answer_sheets with folder (or paths), answerKey = the key the teacher typed, or answerKeyPath = the file/photo with the key (ask for the key if neither), listPath = the class list if there is one.
9s. "Sign this", "put my e-signature / signature" on the teacher's OWN Word or PDF file → place_signature with path = that file. Only the teacher's own signature above the teacher's own name; never for another person's name (ask instead).
9r. Remove / reorder / turn (rotate) pages of a PDF, add page numbers, a "DRAFT"/"SAMPLE" watermark, or the school logo on every page → pdf_page_tools with path = that PDF and only the changes asked for (logoPath = the logo picture in the folder; ask which picture if unclear).
9q. "Make this scanned PDF / photo editable", "convert the PDF to Word/Excel", "type this out for me" (a whole document) → scan_to_editable with path = that file and format "xlsx" when they want Excel (tables), else "docx". One table only → extract_table also works.
9p. Fill a PDF form (fillable or flat, also a scanned one) → fill_pdf_form with path = that PDF; values = what the teacher typed (label → value); sourcePaths = files with the details.
9o. "What changed between these two versions / drafts", "track changes", "redline", "ano ang binago" in two versions of the SAME document → track_changes with pathOld = the older one and pathNew = the newer one (by the teacher's words, "v1/v2", "draft/final", or the dates). Learner data between two DIFFERENT forms stays compare_files.
9n. "Translate this to Filipino / Cebuano / Ilocano / our mother tongue", "isalin sa Filipino" → translate_document with path = that file and language = the language named (ask which language if they only say "mother tongue" and the profile does not say it). Not for a quick chat translation of a sentence.
9m. "Format this to DepEd / long bond / fix the margins / same font / make it printable" for the teacher's OWN Word file → deped_format_docx with path = that file; pass paper, margins (inches), font or size only when the teacher said them; letterhead true when they ask for the DepEd header; signatures true when they ask for the signatories / "Prepared by" block (signers only when they typed the names).
9l. Add Remarks (Passed/Failed), Descriptor, Rank, or the number passed/failed to the teacher's OWN Excel grade sheet ("put remarks", "rank my learners", "count how many passed") → add_formula_columns with path = that file and columns = what they asked for; gradeColumn only when they named the column.
9k. Fill the teacher's OWN Word form that has ordinary blanks (lines "Name: ____", empty boxes) and NO {{placeholders}} → fill_word_form with path = that form; values = the details the teacher typed (label → value); sourcePaths = files that hold the details. Use fill_template only when the form has {{placeholders}}; copy_per_learner for one copy per learner.
9j. "Hide / remove the names and LRNs before I share / send / post this", "privacy copy", "Data Privacy" → hide_learner_details with path = that file (listPath = a class list only when the file itself has no names column, e.g. a PDF or a letter). Add "birthdate", "address", "parents" or "contact" to hide only when the teacher asked for them. mode "initials" or "blank" only when asked; keepKey true only when they want a list of who is who.
9i. Photos into one PDF ("combine these photos into a PDF", "scan pages to one PDF", "put the photos in this folder in one PDF") → convert_to_pdf with the photo paths, or "folder" = the folder path when they mean every photo in a folder. Pass order "as-given" only when the teacher listed the photos in a specific order. "Make this PDF smaller / compress / too big to send" → compress_pdf with path = that PDF (level "small" when they need it as small as possible).
9h. One document per learner from a class list ("certificates for my class", "a letter to each parent", "awards for these learners") → copy_per_learner with templatePath = the teacher's Word template and listPath = the class list. If the template has no fields, pass replaceText only when the teacher said which sample text to replace; otherwise let the tool ask.
9g. "Check my grades / class record for errors", "anything wrong before I submit", "verify my grade sheets" → check_grade_sheets with sourcePaths = the grade files the teacher means (attached, named, or the grade files in the folder). It never changes files.
9f. Think like a DepEd teacher. GRADES of learners across learning areas ("consolidate the grades", "grades for the cards", "report card(s)", "card", "SF9", "Form 138") from a class adviser → build_report_cards with sourcePaths = every subject's class record for that section (from the folder index or attached files) and the grade/section if stated. BUT when the teacher names their OWN existing file to edit, complete or fill (e.g. "edit and complete my conso.xlsx with the data from AP, Filipino, Math, Science") → fill_table_from_files with targetPath = that file and sourcePaths = the files to take the data from (never a new workbook, never build_report_cards). consolidate_files only copies whole sheets side by side into a NEW workbook (other kinds of data). The teacher profile's "Class adviser of" and "Teaching load" lines are facts: use them for "my class", "my section" and "my subjects" (e.g. grade/section args) instead of asking. If it is still unclear whether the teacher is the adviser (whole section, all subjects) or a subject teacher (one learning area, several sections), or which section's files to use, ask in "reply" with no tasks. Use the "School forms knowledge" and "Grading rules" sections when they are given; never state a DepEd rule that is not in them.
9d. The teacher wants to encode/enter scores BY VOICE (speaking, dictating, reading scores aloud) → voice_encode_scores with targetPath = their own class record or score sheet (.xlsx/.docx); add "column" only if they named it. If the file is unclear, ask which file.
9a. encode_scores is the older simple scores-into-one-column tool; prefer transfer_data when the target is a full school form. A NEW official class record built from scratch → make_class_record.
9b. New files are saved in "KaTuro Outputs/<today>/" by default. If the teacher names a folder to save into, add "outputFolder": "<folder path>" to the args of every task that saves files (create_folder first if it doesn't exist, and make those tasks depend on it).
9c. NEVER guess or assume data. Questions about the teacher's own class (scores, learners, grades, attendance, what a file says) must be answered from files via a tool — never from memory or general knowledge. If the needed file or detail (subject, grade, number of items, which component, dates) is not given, ask for it in "reply" and return no tasks. Only pass tool args the teacher actually stated or that come from the files; leave other args out.
10. Write "reply" fully in YOUR persona's voice described above (greeting style, energy, formality), addressing the teacher as "${teacherName}". Keep it short and clear. In "reply" you may use **bold** for a key fact; no # headings, tables or backticks, and no long disclaimers. Never put formatting symbols in task args.
11. Think before you plan: re-read the teacher's message, the attached files and the folder index, and check that your tasks really produce what they asked for. Then fill: "understanding" = one short sentence, in plain words, of what the teacher wants; "confidence" = "high" when the request, files and details are clear, "medium" when you can act but had to assume something (list each assumption in "assumptions"), "low" when you would have to guess the file, class/section, subject, grade or the kind of output; "missing" = what you still need from the teacher (empty when nothing). With "low" or anything in "missing", return NO tasks and ask ONE clear question in "reply", and put up to 4 short possible answers the teacher can tap in "choices" (e.g. the matching file names, "Grade 5", "Adviser - whole section"). Otherwise "choices" is []. Never ask about something the teacher or the files already answered.`;
}

export function buildPlannerPrompt({ prompt, workspaceName, fileIndex, attachedPaths, activePath, activeArtifact, privacyOn, knowledge = '', answeringQuestion = false }) {
  return [
    `Classroom folder: ${workspaceName || '(none opened)'} — ${fileIndex.count} files`,
    fileIndex.text ? `Folder index:\n${fileIndex.text}` : 'Folder index: (empty)',
    attachedPaths.length ? `Attached files: ${attachedPaths.join(', ')}` : '',
    activePath ? `Active file (selected in explorer): ${activePath}` : '',
    activeArtifact ? `Open in Canvas: "${activeArtifact.title}" (${activeArtifact.type})` : '',
    privacyOn ? 'Learner names in file contents are replaced with codes like "Learner 01" for privacy; keep using the codes.' : '',
    knowledge ? `\n${knowledge}` : '',
    answeringQuestion ? '\nYour previous reply asked the teacher a question. Their message below answers it: combine it with their earlier request (see the conversation) instead of starting over.' : '',
    `\nTeacher's message: ${prompt}`,
  ].filter(Boolean).join('\n');
}

/** Resolves a path the model gave to a real workspace path (case/spacing tolerant). */
export function resolvePath(candidate, flatFiles, extraPaths = []) {
  if (!candidate || typeof candidate !== 'string') return null;
  const all = [...extraPaths, ...flatFiles.map((f) => f.path)];
  const norm = (s) => s.replace(/\\/g, '/').replace(/^\.?\/+/, '').toLowerCase().trim();
  const c = norm(candidate);
  const exact = all.find((p) => norm(p) === c);
  if (exact) return exact;
  const byBase = all.filter((p) => norm(p).split('/').pop() === c.split('/').pop());
  return byBase.length === 1 ? byBase[0] : null;
}

const PATH_ARG_KEYS = ['path', 'targetPath', 'sourcePath', 'templatePath', 'listPath', 'pathOld', 'pathNew', 'logoPath', 'answerKeyPath'];
const PATH_LIST_KEYS = ['paths', 'sourcePaths'];

/**
 * Validates and repairs the model's plan: unknown tools dropped, paths resolved,
 * ids made unique. Returns { tasks, problems }.
 */
export function sanitizePlan(plan, flatFiles, extraPaths = []) {
  const problems = [];
  const tasks = [];
  const seen = new Set();
  for (const [i, raw] of (Array.isArray(plan?.tasks) ? plan.tasks : []).slice(0, MAX_TASKS).entries()) {
    if (!raw || !TOOLS[raw.tool]) {
      if (raw?.tool) problems.push(`Skipped an unknown action "${raw.tool}".`);
      continue;
    }
    let id = String(raw.id || `t${i + 1}`);
    while (seen.has(id)) id = `${id}_${i}`;
    seen.add(id);
    const args = { ...(raw.args && typeof raw.args === 'object' ? raw.args : {}) };
    let bad = false;
    for (const key of PATH_ARG_KEYS) {
      if (args[key] === undefined) continue;
      const resolved = resolvePath(args[key], flatFiles, extraPaths);
      if (!resolved) {
        problems.push(`I couldn't find "${args[key]}" in your folder.`);
        bad = true;
      } else args[key] = resolved;
    }
    for (const key of PATH_LIST_KEYS) {
      if (!Array.isArray(args[key])) continue;
      const resolved = args[key].map((p) => resolvePath(p, flatFiles, extraPaths));
      resolved.forEach((r, j) => {
        if (!r) problems.push(`I couldn't find "${args[key][j]}" in your folder.`);
      });
      args[key] = resolved.filter(Boolean);
    }
    if (bad) continue;
    tasks.push({
      id,
      tool: raw.tool,
      label: String(raw.label || TOOLS[raw.tool].label),
      args,
      dependsOn: Array.isArray(raw.dependsOn) ? raw.dependsOn.map(String) : [],
    });
  }
  return { tasks, problems };
}

/**
 * Offline planner: handles the code-only workflows when the AI can't be reached.
 */
export function planOffline(prompt, { attachedPaths = [], activePath, flatFiles = [] }) {
  const lower = prompt.toLowerCase();
  const targets = [...attachedPaths, activePath].filter(Boolean);
  const mentioned = flatFiles.filter((f) => lower.includes(f.name.toLowerCase()) || lower.includes(f.name.toLowerCase().replace(/\.[^.]+$/, ''))).map((f) => f.path);
  const files = [...new Set([...targets, ...mentioned])];
  const sheets = files.filter((p) => /\.(xlsx|xlsm|xls|csv)$/i.test(p));
  const pdfs = files.filter((p) => /\.pdf$/i.test(p));
  const convertible = files.filter((p) => /\.(docx|png|jpe?g|heic|heif)$/i.test(p));

  const mk = (tool, args, label, i) => ({ id: `t${i + 1}`, tool, args, label, dependsOn: [] });
  if (/item analysis|least mastered|\blmc\b|mps|mastery/.test(lower) && sheets.length) {
    return sheets.map((p, i) => mk('analyze_scores', { path: p }, `Item analysis – ${p.split('/').pop()}`, i));
  }
  if (/class record|e-class|ecr|transmut|grades?\b/.test(lower) && sheets.length) {
    return sheets.map((p, i) => mk('make_class_record', { path: p }, `e-Class Record – ${p.split('/').pop()}`, i));
  }
  if (/attendance|sardo|absen|visitation/.test(lower) && sheets.length) {
    return sheets.map((p, i) => mk('check_attendance', { path: p }, `Attendance check – ${p.split('/').pop()}`, i));
  }
  if (/merge|combine|pagsamahin/.test(lower) && pdfs.length >= 2) {
    return [mk('merge_pdfs', { paths: pdfs }, 'Merge PDFs', 0)];
  }
  if (/pdf/.test(lower) && /convert|gawing|to pdf|save as/.test(lower) && convertible.length) {
    return [mk('convert_to_pdf', { paths: convertible }, 'Convert to PDF', 0)];
  }
  return [];
}

/**
 * Reads the "reply" string out of a planner JSON reply that is still streaming in
 * (e.g. '{"reply": "Sige Sir! I will an'), so the chat can show it word by word.
 * Returns null until the reply value has started.
 */
export function extractPartialReply(jsonPrefix) {
  const s = String(jsonPrefix || '');
  const m = s.match(/"reply"\s*:\s*"/);
  if (!m) return null;
  let out = '';
  for (let i = m.index + m[0].length; i < s.length; i++) {
    const c = s[i];
    if (c === '"') return out;
    if (c !== '\\') {
      out += c;
      continue;
    }
    const n = s[i + 1];
    if (n === undefined) break; // escape split across chunks — wait for more
    if (n === 'u') {
      const hex = s.slice(i + 2, i + 6);
      if (hex.length < 4) break;
      out += String.fromCharCode(parseInt(hex, 16));
      i += 5;
    } else {
      out += { n: '\n', t: '\t', r: '', b: '', f: '' }[n] ?? n;
      i += 1;
    }
  }
  return out;
}

export { TOOL_NAMES };
