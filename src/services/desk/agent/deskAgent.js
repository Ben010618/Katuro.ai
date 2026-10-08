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
  convertHeicToJpeg,
  readerNameFor,
  saveWorkingCopy,
} from '../../localFileSystem.js';
import { queryDepEdCompetencies, DEPED_CURRICULUM_DATABASE } from '../../../data/depedMatatagCurriculum.js';
import { getTeacherSalutationName } from '../../teacherProfileUtils.js';
import { dataUrlBytes } from '../signature.js';
import { getPersona, timeOfDay } from '../personas.js';
import { formKnowledgeFor, talksAboutGrades } from '../knowledge/schoolForms.js';
import { gradingRulesBrief } from '../knowledge/gradingRules.js';
import { firstMissingDetails } from './requiredDetails.js';
import { calendarContext, calendarFacts } from '../knowledge/schoolCalendar.js';
import { loadRuleCards, ruleCardsText } from '../knowledge/ruleCards.js';
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
    advisoryClass: t.advisoryClass,
    teachingLoad: t.teachingLoad,
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

const baseRole = (teacher) => `You are a KaTuroDesk co-teacher assistant for ${teacher.salutation}, a DepEd (Philippines) teacher. You support Kindergarten to Grade 12 in all learning areas, following the MATATAG curriculum, PPST, and DepEd orders. Be straight to the point and genuinely helpful.`;

// Chat replies are shown formatted (DeskFormattedText); documents stay plain.
const CHAT_FORMAT = `Formatting of chat replies: short paragraphs separated by a blank line. For a list, write a short label line ending with ":" and then put EACH item on its own line starting with "- " (or "1. ", "2. " for steps); never put several items on one line. Emphasize sparingly: **bold** for the key facts the teacher must notice (results, totals, scores, file names, deadlines), *italics* for titles and terms, and <u>underline</u> only for a warning or an action the teacher must take. A few words at a time, never whole sentences. No # headings, no tables, no backticks.`;
const DOC_FORMAT = 'Do not use markdown symbols like #, ** or backticks; use plain sentences and simple "•" bullets when listing.';

/** Chat voice: the persona the teacher picked in Settings (Matt / Luna). */
export function personaFor(teacher, personaId, now = new Date()) {
  const p = getPersona(personaId);
  return `${baseRole(teacher)} ${CHAT_FORMAT}\n\n${p.style}\nIt is currently ${timeOfDay(now)} in the Philippines.\nThis personality applies to how you talk in chat only, never to the content of official documents.\n\n${GROUNDING_RULES}`;
}

/**
 * DepEd knowledge for this request only (school forms the teacher's words point to,
 * grading rules when grades come up). Sent in the prompt, not the system text, so the
 * fixed instructions stay identical between requests. '' when nothing is relevant.
 */
export function plannerKnowledge(prompt, history = [], schoolYear = '', now = new Date(), cards = []) {
  // A short follow-up ("Grade 5 Rizal po") keeps the topic of the teacher's previous message.
  const lastTeacher = [...history].reverse().find((m) => m.role === 'user')?.content || '';
  const text = `${prompt}\n${String(prompt).length < 60 ? lastTeacher : ''}`;
  // Where we are in the school year (one short line; '' outside a known calendar).
  const parts = [calendarContext(now), formKnowledgeFor(text)];
  if (talksAboutGrades(text)) parts.push(gradingRulesBrief(schoolYear));
  parts.push(calendarFacts(text, schoolYear, now));
  parts.push(ruleCardsText(text, cards));
  return parts.filter(Boolean).join('\n\n');
}

// Plans that change the teacher's own files, or spend a long AI generation, get a
// "Proceed?" when the planner was only medium-sure. Simple, clear jobs just run.
const CONFIRM_TOOLS = new Set(['edit_file', 'fill_table_from_files', 'copy_per_learner', 'fill_word_form', 'add_formula_columns', 'deped_format_docx', 'fill_pdf_form', 'edit_slides', 'transfer_data', 'encode_scores', 'fill_template', 'write_document', 'make_slides', 'make_spreadsheet', 'revise_document', 'make_remedial_package']);

/**
 * The planner's self-check (rule 11). Missing fields mean "high", so a planner reply
 * without them behaves exactly as before.
 */
export function readPlanCheck(plan, unmask = (x) => x) {
  const list = (v, max) => (Array.isArray(v) ? v : []).map((x) => unmask(String(x || '').trim())).filter(Boolean).slice(0, max);
  const confidence = ['high', 'medium', 'low'].includes(String(plan?.confidence || '').toLowerCase()) ? String(plan.confidence).toLowerCase() : 'high';
  return {
    confidence,
    understanding: unmask(String(plan?.understanding || '').trim()).slice(0, 300),
    missing: list(plan?.missing, 4),
    assumptions: list(plan?.assumptions, 4),
    choices: list(plan?.choices, 4).map((c) => c.slice(0, 60)),
  };
}

/** Always asked first (unless already approved, e.g. a scheduled task): signing a document. */
const ALWAYS_CONFIRM = new Set(['place_signature']);

export function needsConfirmation(tasks) {
  return tasks.length > 3 || tasks.some((t) => CONFIRM_TOOLS.has(t.tool));
}

/**
 * Ask, confirm or run — one decision used by every chat turn AND by the teacher exam,
 * so the exam measures exactly what teachers get.
 * → { action: 'answer'|'run'|'ask'|'confirm', gap? }
 */
export function decideAction({ tasks = [], check = null, prompt = '', history = [], teacher = {}, confirmed = false, autoApprove = false }) {
  if (!tasks.length) return { action: 'answer' };
  if (confirmed) return { action: 'run' };
  // Required details, checked by code (no AI tokens).
  const gap = firstMissingDetails(tasks, { prompt, history, teacher });
  if (gap) return { action: 'ask', gap };
  if (check && (check.confidence === 'low' || check.missing.length)) return { action: 'ask' };
  if (!autoApprove && tasks.some((t) => ALWAYS_CONFIRM.has(t.tool))) return { action: 'confirm' };
  if (check && check.confidence === 'medium' && !autoApprove && needsConfirmation(tasks)) return { action: 'confirm' };
  return { action: 'run' };
}

/** Document voice: formal and neutral whatever the persona (remarks, slips, template fields). */
export function docPersonaFor(teacher) {
  return `${baseRole(teacher)} ${DOC_FORMAT} Write in formal, clear, professional DepEd English suitable for official school documents. No slang, jokes or emojis.\n\n${GROUNDING_RULES}`;
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
    .replace(/`([^`]+)`/g, '$1')
    // No emoji or pictographs in chat: the assistant should read as professional.
    .replace(/(?![©®™])\p{Extended_Pictographic}|\p{Emoji_Modifier}|\p{Regional_Indicator}|\u{FE0F}|\u{200D}/gu, '')
    .replace(/(\S)[ \t]{2,}/g, '$1 ')
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
  confirmedPlan = null, // { reply, tasks } the teacher approved with "Proceed": runs with no new AI call
  autoApprove = false, // scheduled tasks: approved when scheduled, so no "Proceed?" step
  ruleCards, // the admin's rule cards (loaded from Firestore when not given)
  eSignature = null, // the teacher's saved e-signature (PNG data URL, kept on this computer)
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
    /** True when the classroom folder has this file. */
    hasFile: (path) => Boolean(findEntryByPath(tree, path)),
    /** Every file of the classroom folder (backups left out): [{ path, size, lastModified }]. */
    allFiles: () => flattenFileTree(tree).filter((f) => !f.path.startsWith('KaTuro Backups/')).map((f) => ({ path: f.path, size: f.size, lastModified: f.lastModified })),
    /** Paths of the files directly inside a folder of the classroom folder (case-insensitive). */
    listFiles(folder) {
      const dir = String(folder || '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '').toLowerCase();
      return flattenFileTree(tree).map((f) => f.path).filter((p) => {
        const at = p.lastIndexOf('/');
        return (at < 0 ? '' : p.slice(0, at).toLowerCase()) === dir;
      });
    },
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
    /** Where saveOutput puts files right now (e.g. "KaTuro Outputs/2026-10-08"). */
    getOutputFolder: () => outputFolder,
    htmlToPdf: (html, options) => renderHtmlToPdf(html, options),
    heicToJpeg: (bytes, quality) => convertHeicToJpeg(bytes, quality),
    /** The teacher's own e-signature as PNG bytes, or null. */
    eSignature: eSignature ? dataUrlBytes(eSignature) : null,
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
  if (!fast && !confirmedPlan && remembered && Date.now() - remembered.at < ANSWER_TTL_MS) {
    return { content: remembered.content, steps: [], artifacts: [], createdFiles: [], aiOffline: null, fastPath: 'memory' };
  }

  let streamed = ''; // planner text as it streams in (used if the plan JSON can't be read)
  let check = null; // the planner's self-check (understanding, confidence, missing, choices)
  if (confirmedPlan) {
    reply = '';
    ({ tasks, problems } = sanitizePlan({ tasks: confirmedPlan.tasks }, flat, attachedPaths));
  } else if (fast) {
    reply = fast.reply;
    ({ tasks, problems } = sanitizePlan({ tasks: fast.tasks }, flat, attachedPaths));
  } else try {
    const fileIndex = buildFileIndex(tree, { attachedPaths, activePath, describe: folderIndex ? (p) => folderIndex.describe(p) : undefined });
    const cards = ruleCards ?? await loadRuleCards();
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
        knowledge: plannerKnowledge(prompt, history, ctx.schoolYear, today, cards),
        answeringQuestion: lastReplyAsked(history),
      }),
      json: true,
      // A general question is answered in full inside "reply" (e.g. "your best use cases").
      maxTokens: 8000,
      temperature: 0.2,
      // Show the planner's reply word by word while the rest of the plan streams in.
      onText: (full) => {
        streamed = full;
        const partial = extractPartialReply(full);
        if (partial) emit({ reply: cleanReply(masker.unmask(partial)) });
      },
    });
    reply = cleanReply(masker.unmask(plan?.reply || ''));
    ({ tasks, problems } = sanitizePlan(plan, flat, attachedPaths));
    check = readPlanCheck(plan, (x) => masker.unmask(x));
  } catch (err) {
    // The plan JSON could not be read, but the answer text arrived: show the answer
    // (no tasks are run from a plan we could not read).
    const salvaged = !(err instanceof AIUnavailableError) && err?.rawText !== undefined
      ? cleanReply(masker.unmask(extractPartialReply(err.rawText) || extractPartialReply(streamed) || ''))
      : '';
    if (salvaged) {
      return {
        content: err.cutOff ? `${salvaged}…\n\n(My answer was cut short. Ask me to continue if you need the rest.)` : salvaged,
        steps: [],
        artifacts: [],
        createdFiles: [],
        aiOffline: null,
      };
    }
    if (!(err instanceof AIUnavailableError)) throw err;
    aiOffline = err.message;
    tasks = planOffline(prompt, { attachedPaths, activePath, flatFiles: flat });
    reply = tasks.length
      ? `${aiOffline} I can still do the number-crunching part offline, so here it is.`
      : `${aiOffline} Without the AI I can only run item analysis, class records, attendance checks, and PDF tools on files you select.`;
  }

  // ── 1c. Think before acting: required details (code), then ask when unsure, confirm big jobs ──
  const decision = decideAction({ tasks, check, prompt, history, teacher, confirmed: Boolean(confirmedPlan), autoApprove });
  if (decision.action === 'ask' && decision.gap) {
    const content = `**Needs your input** — ${decision.gap.question}`; // the plan's "doing it now" reply is dropped: nothing runs yet
    return { content, steps: [], artifacts: [], createdFiles: [], aiOffline: null, choices: decision.gap.choices, asked: true };
  }
  if (decision.action === 'ask') {
    const ask = reply && /\?\s*$/.test(reply) ? reply : [reply, `**Needs your input** — ${check.missing.join('; ') || 'please tell me a bit more about what you need.'}`].filter(Boolean).join('\n\n');
    return { content: ask, steps: [], artifacts: [], createdFiles: [], aiOffline: null, choices: check.choices, asked: true };
  }
  if (decision.action === 'confirm') {
    const planLines = tasks.map((t) => `- ${masker.unmask(t.label || t.tool)}`);
    const content = [
      reply,
      check.understanding ? `**Here's what I understood:** ${check.understanding}` : '',
      `I'll do this:\n${planLines.join('\n')}`,
      check.assumptions.length ? `I'm assuming:\n${check.assumptions.map((a) => `- ${a}`).join('\n')}` : '',
      'Shall I go ahead?',
    ].filter(Boolean).join('\n\n');
    // Stored with real names (codes only mean something inside this turn); the approved run re-masks them.
    const approved = tasks.map((t) => ({ ...t, args: JSON.parse(masker.unmask(JSON.stringify(t.args))) }));
    return { content, steps: [], artifacts: [], createdFiles: [], aiOffline: null, pendingPlan: { reply, tasks: approved } };
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
        lines.push(`**Done** — ${t.label}: ${r.result?.summary || 'finished'}`);
        for (const w of r.result?.warnings || []) lines.push(`**Please check:** ${w}`);
        if (r.result?.reply) extraReplies.push(cleanReply(r.result.reply));
        for (const a of r.result?.artifacts || []) {
          artifacts.push({ id: `art-${Date.now()}-${artifacts.length}`, createdAt: Date.now(), sourceTool: t.tool, ...a });
        }
      } else if (r?.status === 'error' && r.code === 'NEEDS_INFO') {
        // Missing information is asked for, never guessed.
        lines.push(`**Needs your input** — ${t.label}: ${r.error}`);
      } else if (r?.status === 'error') {
        lines.push(`**Not finished** — ${t.label}: ${r.error}`);
      } else if (r?.status === 'skipped') {
        lines.push(`**Skipped** — ${t.label}: ${r.error}`);
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

  return { content, steps, artifacts, createdFiles, aiOffline, tools: [...new Set(tasks.map((t) => t.tool))], ...(check?.choices?.length && !tasks.length ? { choices: check.choices } : {}) };
}

/** True when the assistant's last message asked the teacher something. */
function lastReplyAsked(history = []) {
  const last = [...history].reverse().find((m) => m.role === 'assistant');
  const text = String(last?.content || '').trim();
  return Boolean(text) && (/\?\s*$/.test(text) || /\*\*Needs your input\*\*/.test(text));
}
