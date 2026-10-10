/**
 * prepareLesson.js — prepares one lesson (or one week's DLL) in the background: the
 * lesson plan and the slides, written by the same tools as the chat, saved in
 * "Lesson Prep/<date> <day>/<subject> <grade> - <topic>/". Never touches the teacher's files.
 */
import { runDeskAgentTurn } from '../../deskAgentAI.js';
import { flattenFileTree } from '../../localFileSystem.js';
import { searchFile, termPattern } from '../agent/fileSearch.js';
import { className, lessonFor, addDays, weekday } from './teachingDay.js';

const DAY = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const gradeNo = (g) => String(g || '').replace(/^Grade\s*/i, '');
const shortTopic = (t) => String(t || '').replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, ' ').trim().split(' ').slice(0, 7).join(' ');
const STOP = new Set(['the', 'and', 'with', 'from', 'their', 'that', 'this', 'into', 'based', 'some', 'using', 'such', 'other', 'learners', 'describe', 'identify', 'explain', 'demonstrate', 'understanding', 'different']);

/** The Monday of a date's week. */
export const mondayOf = (iso) => addDays(iso, -((weekday(iso) + 6) % 7));

/** Where a lesson's files go. */
export function lessonFolder(job) {
  if (job.kind === 'dll') return `Lesson Prep/Week of ${job.monday}/${job.cls.subject} ${gradeNo(job.cls.grade)} - DLL`;
  return `Lesson Prep/${job.iso} ${DAY[weekday(job.iso)]}/${job.cls.subject} ${gradeNo(job.cls.grade)} - ${shortTopic(job.lesson.item.text)}`;
}

/** What the tools are asked to write (no learner names: none are needed). */
export function lessonInstructions(job, { minutes = 50 } = {}) {
  const { item, session, sessions } = job.lesson;
  const sections = job.sections.map((c) => c.section).filter(Boolean);
  return [
    `Lesson for ${job.cls.grade} ${job.cls.subject}${sections.length ? ` (section${sections.length > 1 ? 's' : ''} ${sections.join(', ')})` : ''}, ${DAY[weekday(job.iso)]} ${job.iso}, about ${minutes} minutes.`,
    `Learning competency${item.code ? ` (${item.code})` : ''}: ${item.text}`,
    item.contentStandard ? `Content standard: ${item.contentStandard}` : '',
    item.performanceStandard ? `Performance standard: ${item.performanceStandard}` : '',
    sessions > 1 ? `This is meeting ${session} of ${sessions} for this competency: plan only this meeting's part, building on the earlier meetings${session === sessions ? ', and end the competency with a short assessment' : ''}.` : 'This competency takes this one meeting.',
    'Use the DepEd lesson flow (review, motivation, discussion, activity, application, generalization, evaluation). Use the source files when they are given; do not invent facts about the class or the learners.',
  ].filter(Boolean).join('\n');
}

/** The week's meetings of a class, for its DLL. */
export function weekPlan(cls, monday, sequences, log) {
  const out = [];
  for (let i = 0; i < 5; i += 1) {
    const iso = addDays(monday, i);
    const l = lessonFor(cls, iso, sequences[cls.id], log);
    if (l.kind === 'lesson') out.push(`${DAY[weekday(iso)]} ${iso}: ${l.item.code ? `${l.item.code} ` : ''}${l.item.text} (meeting ${l.session} of ${l.sessions})`);
    else if (l.kind === 'special') out.push(`${DAY[weekday(iso)]} ${iso}: ${l.special.title} (no new lesson)`);
    else if (l.kind === 'none' && (cls.days || []).includes(weekday(iso))) out.push(`${DAY[weekday(iso)]} ${iso}: no class (${l.reason})`);
  }
  return out;
}

/** The tasks for one job (run as an approved plan: no planner call, no "Proceed?"). */
export function buildLessonTasks(job, settings, sourcePaths = []) {
  const outputFolder = lessonFolder(job);
  const common = { subject: job.cls.subject, gradeLevel: job.cls.grade, outputFolder };
  if (job.kind === 'dll') {
    return [{ id: 'dll', tool: 'write_document', label: `DLL – ${className(job.cls)}`, args: { ...common, docType: 'dll', title: `DLL – ${job.cls.subject} ${gradeNo(job.cls.grade)} – week of ${job.monday}`, instructions: `Daily Lesson Log for ${job.cls.grade} ${job.cls.subject}, week of ${job.monday}. Fill each day exactly as listed:\n${job.week.join('\n')}`, sourcePaths, formats: ['docx'] } }];
  }
  const instructions = lessonInstructions(job, { minutes: job.minutes });
  const title = shortTopic(job.lesson.item.text);
  const tasks = [];
  if (settings.planFormat !== 'dll') tasks.push({ id: 'plan', tool: 'write_document', label: `Lesson plan – ${title}`, args: { ...common, docType: 'dlp', title: `Lesson Plan – ${title}`, instructions, sourcePaths, formats: ['docx'] } });
  if (settings.slides !== false) tasks.push({ id: 'slides', tool: 'make_slides', label: `Slides – ${title}`, args: { ...common, topic: job.lesson.item.text, instructions, sourcePaths, slideCount: Math.min(25, Math.max(5, Number(settings.slideCount) || 10)) } });
  if (settings.worksheet) tasks.push({ id: 'worksheet', tool: 'write_document', label: `Worksheet – ${title}`, args: { ...common, docType: 'worksheet', title: `Worksheet – ${title}`, instructions, sourcePaths, formats: ['docx'] } });
  return tasks;
}

/** Up to three files of the class's materials folder that match the lesson's words. */
export async function pickMaterials(folder, item, workspace, readParsed) {
  const dir = String(folder || '').replace(/^\/+|\/+$/g, '').toLowerCase();
  if (!dir || !readParsed) return [];
  const files = flattenFileTree(workspace?.files || [])
    .filter((f) => f.path.toLowerCase().startsWith(`${dir}/`) && /\.(docx|pdf|pptx|txt|md)$/i.test(f.path))
    .slice(0, 40);
  const words = [...new Set(String(`${item.text} ${item.domain || ''}`).toLowerCase().match(/[a-zñ]{5,}/g) || [])].filter((w) => !STOP.has(w)).slice(0, 8);
  if (!words.length) return [];
  const patterns = words.map(termPattern);
  const scored = [];
  for (const f of files) {
    try {
      const hit = searchFile(await readParsed(f.path), f.path, patterns);
      if (hit && hit.matched.size >= Math.min(2, words.length)) scored.push({ path: f.path, score: hit.score });
    } catch {
      // an unreadable file is simply not used
    }
  }
  return scored.sort((a, b) => b.score - a.score).slice(0, 3).map((s) => s.path);
}

/**
 * Prepares one job. deps: { workspace, user, profile, persona, privacyMode, fileIndex, settings, readParsed }
 * → { status: 'ready'|'failed', files: [{ path, name, format }], note }
 */
export async function prepareLesson(job, deps) {
  const settings = deps.settings || {};
  const item = job.kind === 'dll' ? { text: job.week.join(' ') } : job.lesson.item;
  const sources = await pickMaterials(job.cls.materialsFolder, item, deps.workspace, deps.readParsed);
  const tasks = buildLessonTasks(job, settings, sources);
  if (!tasks.length) return { status: 'ready', files: [], note: 'Nothing to prepare (slides and lesson plan are both turned off).' };
  const result = await runDeskAgentTurn({
    prompt: `Prepare ${job.kind === 'dll' ? 'the weekly DLL' : 'the lesson'} for ${className(job.cls)}`,
    workspace: deps.workspace,
    history: [],
    user: deps.user,
    profile: deps.profile,
    privacyMode: deps.privacyMode !== false,
    persona: deps.persona,
    fileIndex: deps.fileIndex,
    confirmedPlan: { reply: '', tasks },
    autoApprove: true,
    onUpdate: () => {},
  });
  const files = (result.createdFiles || []).filter((f) => !/KaTuro Backups\//.test(f.path)).map((f) => ({ path: f.path, name: f.name, format: f.format }));
  const failed = (result.steps || []).filter((s) => s.status === 'error');
  const fromFiles = sources.length ? `Used your materials: ${sources.map((p) => p.split('/').pop()).join(', ')}.` : job.cls.materialsFolder ? 'No matching file in your materials folder; the content is general.' : 'No materials folder set; the content is general.';
  if (!files.length) return { status: 'failed', files, note: failed[0]?.detail || 'The lesson could not be prepared. Please try again.' };
  return { status: 'ready', files, note: `${fromFiles}${failed.length ? ` ${failed.length} part(s) could not be made: ${failed.map((s) => s.label).join(', ')}.` : ''}` };
}
