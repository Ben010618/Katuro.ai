/**
 * planner.js — turns a teacher's request into a task graph (one Gemini call, JSON mode),
 * with an offline keyword planner so code-only tools still work without AI.
 */

import { TOOLS, TOOL_NAMES, toolCatalog } from './tools.js';
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
export function buildFileIndex(files, { attachedPaths = [], activePath } = {}) {
  const flat = flattenFileTree(files);
  const priority = new Set([...attachedPaths, activePath].filter(Boolean).map((p) => p.toLowerCase()));
  const sorted = [...flat].sort((a, b) => {
    const pa = priority.has(a.path.toLowerCase()) ? 1 : 0;
    const pb = priority.has(b.path.toLowerCase()) ? 1 : 0;
    if (pa !== pb) return pb - pa;
    return (b.lastModified || 0) - (a.lastModified || 0);
  });
  const shown = sorted.slice(0, MAX_INDEX_ENTRIES);
  const lines = shown.map((f) => `${f.path}${f.size ? ` (${fmtSize(f.size)})` : ''}`);
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
9. Teacher wants a file typed/encoded into THEIR existing workbook → encode_scores. Wants a new official class record → make_class_record.
9b. New files are saved in "KaTuro Outputs/<today>/" by default. If the teacher names a folder to save into, add "outputFolder": "<folder path>" to the args of every task that saves files (create_folder first if it doesn't exist, and make those tasks depend on it).
10. Writing style for "reply": warm, simple conversational English, straight to the point, address the teacher as "${teacherName}". No markdown symbols (#, **, backticks), no long disclaimers.`;
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

export { TOOL_NAMES };
