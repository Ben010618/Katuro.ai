/**
 * deskAgent.js — KaTuroDesk agent turn: plan → run tasks in parallel → save real files.
 *
 *   Teacher request
 *     → planner (1 Gemini call, JSON)          — or the offline keyword planner
 *     → task graph (runner.js, 3 at a time)    — READ / THINK / WRITE tools (tools.js)
 *     → outputs saved to "KaTuro Outputs/<date>/" (never overwrites; auto-renames)
 *     → reply + live checklist + Canvas artifacts
 *
 * Access is controlled by the teacher's plan (Free / Subscription) through the server's daily limits.
 */

import { callDeskLLM, AIUnavailableError } from './llm.js';
import { createNameMasker } from './privacy.js';
import { runTaskGraph, TASK_CONCURRENCY } from './runner.js';
import { TOOLS } from './registry.js';
import { buildFileIndex, buildPlannerSystem, buildPlannerPrompt, sanitizePlan, planOffline, extractPartialReply } from './planner.js';
import { fastRoute } from './fastRoute.js';
import { readDocument } from '../readers/index.js';
import {
  flattenFileTree,
  findEntryByPath,
  readFileBytes,
  writeFileToDirectory,
  createDirectoryInWorkspace,
  renderHtmlToPdf,
  readerNameFor,
  saveWorkingCopy,
} from '../../localFileSystem.js';
import { queryDepEdCompetencies, DEPED_CURRICULUM_DATABASE } from '../../../data/depedMatatagCurriculum.js';
import { getTeacherSalutationName } from '../../teacherProfileUtils.js';
import { getPersona, timeOfDay } from '../personas.js';
import { teacherInfo, signatoryList, teacherFactsForAI } from '../../teacherInfo.js';
import { GROUNDING_RULES } from './grounding.js';

export const OUTPUT_ROOT = 'KaTuro Outputs';

const MIME_BY_EXT = {
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  pdf: 'application/pdf',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  csv: 'text/csv',
};

export function localDateStamp(d = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function schoolYearFor(d = new Date()) {
  const y = d.getFullYear();
  return d.getMonth() >= 5 ? `${y}-${y + 1}` : `${y - 1}-${y}`;
}

/**
 * The teacher's profile as the agent sees it (Settings → Profile). Every value is ''
 * when not filled in, and blank values never reach a document.
 */
export function teacherFromProfile(profile = {}, user = {}) {
  const t = teacherInfo(profile, user);
  return {
    salutation: getTeacherSalutationName(profile, user),
    fullName: t.name,
    honorific: t.honorific,
    school: t.school,
    schoolId: t.schoolId,
    district: t.district,
    region: t.region,
    division: t.division,
    position: t.designation,
    // Sign-off blocks: only people whose names were filled in.
    signatures: signatoryList(profile, { user }).map((s) => ({ label: s.label, name: s.name, role: s.position })),
    // What the AI may say about the teacher/school/signatories (filled fields only).
    facts: teacherFactsForAI(profile, user),
  };
}

const baseRole = (teacher) => `You are a KaTuroDesk co-teacher assistant for ${teacher.salutation}, a DepEd (Philippines) teacher. You support Kindergarten to Grade 12 in all learning areas, following the MATATAG curriculum, PPST, and DepEd orders. Be straight to the point and genuinely helpful. Do not use markdown symbols like #, ** or backticks; use plain sentences and simple "•" bullets when listing.`;

/** Chat voice: the persona the teacher picked in Settings (Matt / Luna). */
export function personaFor(teacher, personaId, now = new Date()) {
  const p = getPersona(personaId);
  return `${baseRole(teacher)}\n\n${p.style}\nIt is currently ${timeOfDay(now)} in the Philippines.\nThis personality applies to how you talk in chat only, never to the content of official documents.\n\n${GROUNDING_RULES}`;
}

/** Document voice: formal and neutral whatever the persona (remarks, slips, template fields). */
export function docPersonaFor(teacher) {
  return `${baseRole(teacher)} Write in formal, clear, professional DepEd English suitable for official school documents. No slang, jokes or emojis.\n\n${GROUNDING_RULES}`;
}

function curriculumHint(subject, gradeLevel, text = '') {
  if (!subject || !gradeLevel) return '';
  const subjKey = Object.keys(DEPED_CURRICULUM_DATABASE).find((k) => k.toLowerCase() === String(subject).toLowerCase());
  if (!subjKey || !DEPED_CURRICULUM_DATABASE[subjKey][gradeLevel]) return '';
  const quarter = (String(text).match(/\b(?:quarter|q)\s*([1-4])\b/i) || [])[1];
  const list = queryDepEdCompetencies({ subject: subjKey, gradeLevel, quarter: quarter ? `Quarter ${quarter}` : 'Quarter 1' }).slice(0, 12);
  if (!list.length) return '';
  return `Official MATATAG competencies for reference (${subjKey}, ${gradeLevel}${quarter ? `, Quarter ${quarter}` : ''}):\n${list.map((c) => `[${c.code}] ${c.text}`).join('\n')}`;
}

// ── Answer memory: the same question about the same unchanged files is answered instantly ──
const ANSWER_TTL_MS = 30 * 60 * 1000;
const ANSWER_MAX = 50;
const answerMemory = new Map();

function hashString(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

function answerKey({ prompt, personaId, workspace, tree, attachedPaths, activePath, history }) {
  const stamp = (p) => {
    const e = findEntryByPath(tree, p);
    return `${p}@${e?.lastModified || ''}:${e?.size || ''}`;
  };
  const lastAssistant = [...history].reverse().find((m) => m.role === 'assistant')?.content || '';
  return hashString(JSON.stringify([
    String(prompt).trim().toLowerCase().replace(/\s+/g, ' '),
    personaId || '',
    workspace?.name || '',
    flattenFileTree(tree).length,
    [...attachedPaths].sort().map(stamp),
    activePath ? stamp(activePath) : '',
    hashString(lastAssistant),
  ]));
}

export function clearAnswerMemory() {
  answerMemory.clear();
}

function cleanReply(text) {
  return String(text || '')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .trim();
}

/**
 * Runs one teacher turn.
 * @returns {Promise<{ content, steps, artifacts, createdFiles, aiOffline }>}
 */
export async function runDeskAgentTurn({
  prompt,
  workspace,
  activeFile,
  activeArtifact,
  attachedPaths = [],
  history = [],
  user,
  profile,
  privacyMode = true,
  persona: personaId,
  fileIndex: folderIndex, // optional background index (services/desk/index): cached parses + file descriptions
  onUpdate,
}) {
  const teacher = teacherFromProfile(profile, user);
  const persona = personaFor(teacher, personaId);
  const docPersona = docPersonaFor(teacher);
  const masker = createNameMasker({ enabled: privacyMode });
  const handle = workspace?.handle;
  const tree = workspace?.files || [];
  const flat = flattenFileTree(tree);
  const today = new Date();
  const outputRoot = `${OUTPUT_ROOT}/${localDateStamp(today)}`;
  let outputFolder = outputRoot;
  const createdFiles = [];
  const parsedCache = new Map();

  let steps = [];
  const emit = (extra = {}) => onUpdate?.({ steps, ...extra });

  const readBytes = async (path) => {
    const entry = findEntryByPath(tree, path);
    return readFileBytes(handle, entry || path);
  };

  const ctx = {
    teacher,
    persona,
    docPersona,
    masker,
    memory: new Map(),
    activeArtifact,
    schoolYear: schoolYearFor(today),
    curriculumHint,
    readBytes,
    async readParsed(path, { full = true } = {}) {
      const entry = findEntryByPath(tree, path);
      if (folderIndex && entry) {
        try {
          return await folderIndex.ensure(path, entry, handle, { full });
        } catch {
          // fall back to a direct read below
        }
      }
      const key = `${path}|${entry?.lastModified || ''}`;
      if (!parsedCache.has(key)) {
        parsedCache.set(key, (async () => {
          const bytes = await readBytes(path);
          return readDocument({ bytes, name: readerNameFor(entry, path.split('/').pop()) });
        })());
      }
      return parsedCache.get(key);
    },
    async llm(opts) {
      const out = await callDeskLLM({ kind: 'task', ...opts });
      return out;
    },
    async saveOutput(fileName, bytes, format, folder = outputFolder) {
      if (!handle) throw new Error('Open a classroom folder first so I can save files.');
      const ext = fileName.split('.').pop().toLowerCase();
      const res = await writeFileToDirectory(handle, `${folder}/${fileName}`, bytes, MIME_BY_EXT[ext] || 'application/octet-stream', { overwrite: false });
      const file = { path: res.path, name: res.name, format: format || ext, size: bytes?.byteLength ?? bytes?.length ?? 0 };
      createdFiles.push(file);
      return file;
    },
    /** Safe-edit SOP for changes to an EXISTING teacher file (backup + working clone). */
    async saveWorkingCopy(originalPath, bytes, format) {
      if (!handle) throw new Error('Open a classroom folder first so I can save files.');
      const ext = originalPath.split('.').pop().toLowerCase();
      const res = await saveWorkingCopy(handle, originalPath, bytes, MIME_BY_EXT[ext] || 'application/octet-stream');
      const file = { path: res.path, name: res.name, format: format || ext, size: bytes?.byteLength ?? 0, backups: res.backups, originalPath };
      createdFiles.push(file);
      return file;
    },
    /** Live-updates the chat with a tool's answer while it streams in. */
    streamReply(text) {
      const clean = cleanReply(text);
      if (clean) emit({ reply: reply ? `${reply}\n\n${clean}` : clean });
    },
    async makeDir(path) {
      if (!handle) throw new Error('Open a classroom folder first.');
      await createDirectoryInWorkspace(handle, path);
    },
    setOutputFolder(path) {
      outputFolder = path.replace(/^\/+|\/+$/g, '');
    },
    htmlToPdf: (html, options) => renderHtmlToPdf(html, options),
    async renderPdf(spec) {
      const { buildHtml } = await import('../generators/htmlFromSpec.js');
      const viaChromium = await renderHtmlToPdf(buildHtml(spec, { forPrint: true }), {
        pageSize: spec.paper,
        landscape: spec.orientation === 'landscape',
      });
      if (viaChromium) return viaChromium;
      const { buildPdf } = await import('../generators/pdfFromSpec.js');
      return buildPdf(spec);
    },
  };

  // ── 1. Plan ───────────────────────────────────────────────
  steps = [{ id: 'plan', label: 'Understanding your request', status: 'running' }];
  emit();

  const activePath = activeFile?.kind === 'file' ? activeFile.path : null;
  let reply = '';
  let tasks;
  let problems = [];
  let aiOffline = null;

  // 1a. Obvious requests skip the planner (greetings answer instantly, with no AI call).
  const fast = fastRoute({ prompt, attachedPaths, activePath, persona: personaId, teacherName: teacher.salutation, now: today });
  if (fast?.local) {
    steps = [];
    return { content: fast.reply, steps, artifacts: [], createdFiles: [], aiOffline: null, fastPath: 'local' };
  }

  // 1b. Same question, same unchanged files → remembered answer.
  const memoKey = answerKey({ prompt, personaId, workspace, tree, attachedPaths, activePath, history });
  const remembered = answerMemory.get(memoKey);
  if (!fast && remembered && Date.now() - remembered.at < ANSWER_TTL_MS) {
    return { content: remembered.content, steps: [], artifacts: [], createdFiles: [], aiOffline: null, fastPath: 'memory' };
  }

  if (fast) {
    reply = fast.reply;
    ({ tasks, problems } = sanitizePlan({ tasks: fast.tasks }, flat, attachedPaths));
  } else try {
    const fileIndex = buildFileIndex(tree, { attachedPaths, activePath, describe: folderIndex ? (p) => folderIndex.describe(p) : undefined });
    const plan = await callDeskLLM({
      kind: 'plan',
      system: `${buildPlannerSystem({ persona, teacherName: teacher.salutation, today: today.toDateString() })}\n\n${teacher.facts}`,
      history: history.slice(-8).map((m) => ({ role: m.role, content: masker.mask(m.content) })),
      prompt: buildPlannerPrompt({
        prompt: masker.mask(prompt),
        workspaceName: workspace?.name,
        fileIndex,
        attachedPaths,
        activePath,
        activeArtifact,
        privacyOn: privacyMode,
      }),
      json: true,
      maxTokens: 3000,
      temperature: 0.2,
      // Show the planner's reply word by word while the rest of the plan streams in.
      onText: (full) => {
        const partial = extractPartialReply(full);
        if (partial) emit({ reply: cleanReply(masker.unmask(partial)) });
      },
    });
    reply = cleanReply(masker.unmask(plan?.reply || ''));
    ({ tasks, problems } = sanitizePlan(plan, flat, attachedPaths));
  } catch (err) {
    if (!(err instanceof AIUnavailableError)) throw err;
    aiOffline = err.message;
    tasks = planOffline(prompt, { attachedPaths, activePath, flatFiles: flat });
    reply = tasks.length
      ? `${aiOffline} I can still do the number-crunching part offline, so here it is.`
      : `${aiOffline} Without the AI I can only run item analysis, class records, attendance checks, and PDF tools on files you select.`;
  }

  steps = [{ id: 'plan', label: tasks.length ? `Planned ${tasks.length} task(s)` : 'Understood your request', status: 'done' }];
  emit({ reply });

  // ── 2. Run tasks (parallel where independent) ─────────────
  const artifacts = [];
  const lines = [];
  const extraReplies = [];

  if (tasks.length) {
    const results = await runTaskGraph(
      tasks,
      async (task, deps, report) => {
        const tool = TOOLS[task.tool];
        const folder = typeof task.args.outputFolder === 'string' ? task.args.outputFolder.replace(/^\/+|\/+$/g, '') : null;
        const taskCtx = folder ? { ...ctx, saveOutput: (n, b, f) => ctx.saveOutput(n, b, f, folder) } : ctx;
        return tool.run(task.args, taskCtx, report, deps);
      },
      {
        concurrency: TASK_CONCURRENCY,
        onChange: (list) => {
          steps = [steps[0], ...list.map((s) => ({ id: s.id, label: s.label, status: s.status, detail: s.status === 'error' || s.status === 'skipped' ? s.error : s.detail }))];
          emit({ reply });
        },
      },
    );

    for (const t of tasks) {
      const r = results.get(t.id);
      if (r?.status === 'done') {
        lines.push(`✓ ${t.label}: ${r.result?.summary || 'done'}`);
        for (const w of r.result?.warnings || []) lines.push(`⚠ Please check: ${w}`);
        if (r.result?.reply) extraReplies.push(cleanReply(r.result.reply));
        for (const a of r.result?.artifacts || []) {
          artifacts.push({ id: `art-${Date.now()}-${artifacts.length}`, createdAt: Date.now(), sourceTool: t.tool, ...a });
        }
      } else if (r?.status === 'error' && r.code === 'NEEDS_INFO') {
        // Missing information is asked for, never guessed.
        lines.push(`❓ ${t.label}: ${r.error}`);
      } else if (r?.status === 'error') {
        lines.push(`✗ ${t.label}: ${r.error}`);
      } else if (r?.status === 'skipped') {
        lines.push(`– ${t.label}: ${r.error}`);
      }
    }
  }

  // ── 3. Compose reply ──────────────────────────────────────
  const parts = [];
  if (reply) parts.push(reply);
  if (problems.length) parts.push(problems.join(' '));
  if (extraReplies.length) parts.push(extraReplies.join('\n\n'));
  if (lines.length) parts.push(lines.join('\n'));
  if (createdFiles.length) {
    const folders = [...new Set(createdFiles.map((f) => f.path.split('/').slice(0, -1).join('/')))];
    parts.push(`Saved in: ${folders.join(', ')}`);
  }
  const content = parts.join('\n\n') || `Sorry ${teacher.salutation}, I wasn't able to do that. Could you rephrase it?`;

  // Remember plain answers (no files produced, nothing failed) for instant repeats.
  if (!fast && !aiOffline && !tasks.length && !problems.length && reply) {
    if (answerMemory.size >= ANSWER_MAX) answerMemory.delete(answerMemory.keys().next().value);
    answerMemory.set(memoKey, { content, at: Date.now() });
  }

  return { content, steps, artifacts, createdFiles, aiOffline };
}
