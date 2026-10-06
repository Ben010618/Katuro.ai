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
{"reply": string, "tasks": [{"id": "t1", "tool": string, "label": string, "args": object, "dependsOn": [string]}]}

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
9d. The teacher wants to encode/enter scores BY VOICE (speaking, dictating, reading scores aloud) → voice_encode_scores with targetPath = their own class record or score sheet (.xlsx/.docx); add "column" only if they named it. If the file is unclear, ask which file.
9a. encode_scores is the older simple scores-into-one-column tool; prefer transfer_data when the target is a full school form. A NEW official class record built from scratch → make_class_record.
9b. New files are saved in "KaTuro Outputs/<today>/" by default. If the teacher names a folder to save into, add "outputFolder": "<folder path>" to the args of every task that saves files (create_folder first if it doesn't exist, and make those tasks depend on it).
9c. NEVER guess or assume data. Questions about the teacher's own class (scores, learners, grades, attendance, what a file says) must be answered from files via a tool — never from memory or general knowledge. If the needed file or detail (subject, grade, number of items, which component, dates) is not given, ask for it in "reply" and return no tasks. Only pass tool args the teacher actually stated or that come from the files; leave other args out.
10. Write "reply" fully in YOUR persona's voice described above (greeting style, energy, formality), addressing the teacher as "${teacherName}". Keep it short and clear. In "reply" you may use **bold** for a key fact; no # headings, tables or backticks, and no long disclaimers. Never put formatting symbols in task args.`;
}

export function buildPlannerPrompt({ prompt, workspaceName, fileIndex, attachedPaths, activePath, activeArtifact, privacyOn }) {
  return [
    `Classroom folder: ${workspaceName || '(none opened)'} — ${fileIndex.count} files`,
    fileIndex.text ? `Folder index:\n${fileIndex.text}` : 'Folder index: (empty)',
    attachedPaths.length ? `Attached files: ${attachedPaths.join(', ')}` : '',
    activePath ? `Active file (selected in explorer): ${activePath}` : '',
    activeArtifact ? `Open in Canvas: "${activeArtifact.title}" (${activeArtifact.type})` : '',
    privacyOn ? 'Learner names in file contents are replaced with codes like "Learner 01" for privacy; keep using the codes.' : '',
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

const PATH_ARG_KEYS = ['path', 'targetPath', 'sourcePath', 'templatePath'];
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
  const convertible = files.filter((p) => /\.(docx|png|jpe?g)$/i.test(p));

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
