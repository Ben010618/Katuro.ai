import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Document, Packer, Paragraph } from 'docx';
import { callGeminiProxy } from '../../geminiConfig';
import { resetTaskActionSupport } from '../agent/llm';
import { clearAnswerMemory } from '../agent/deskAgent';
import { createVirtualWorkspace, readFileBytes, flattenFileTree } from '../../localFileSystem';
import { readDocument } from '../readers/index';
import { prepareLesson, pickMaterials } from './prepareLesson';
import { lessonFor, DEFAULT_SETTINGS } from './teachingDay';
import { messageFor, bubbleMood, bubbleReply, lessonFiles } from './assistantMessages';

vi.mock('../../geminiConfig', () => ({ callGeminiProxy: vi.fn() }));

const rizal = { id: 'r', subject: 'Science', grade: 'Grade 7', section: 'Rizal', days: [1, 2, 3, 4, 5], start: '07:30', end: '08:20', materialsFolder: 'Science 7' };
const seq = { items: [{ code: 'S7MT-IIb-2', text: 'Classify mixtures as homogeneous or heterogeneous', sessions: 2 }], startDate: '2026-10-26' };
const docx = async (lines) => new Uint8Array(await Packer.toArrayBuffer(new Document({ sections: [{ children: lines.map((l) => new Paragraph(l)) }] })));

describe('preparing a lesson in the background', () => {
  beforeEach(() => { resetTaskActionSupport(); clearAnswerMemory(); callGeminiProxy.mockReset(); });

  it('lesson plan and slides in the day\'s Lesson Prep folder, from the matching materials; no planner call, no learner names sent', async () => {
    const ws = createVirtualWorkspace('Class');
    ws.handle.saveVirtualFile('Science 7/Module 3 Mixtures.docx', await docx(['Mixtures can be homogeneous or heterogeneous.', 'A homogeneous mixture looks the same throughout; heterogeneous mixtures do not.', 'Classify each mixture.']));
    ws.handle.saveVirtualFile('Science 7/Module 1 Scientific Method.docx', await docx(['The scientific method has steps.']));
    ws.handle.saveVirtualFile('Class Record.xlsx', new Uint8Array([1]));
    ws.files = ws.handle.getFiles();
    const before = flattenFileTree(ws.handle.getFiles()).map((f) => f.path).sort();
    const prompts = [];
    callGeminiProxy.mockImplementation(async (req) => {
      const text = JSON.stringify(req.contents);
      prompts.push(text);
      if (/layout/.test(text) && /twoColumn/.test(text)) return { text: JSON.stringify({ title: 'Mixtures', slides: [{ title: 'Homogeneous or heterogeneous?', bullets: ['Looks the same throughout', 'Parts can be seen'] }, { title: 'Classify', bullets: ['Salt water', 'Halo-halo'] }] }) };
      return { text: JSON.stringify({ title: 'Lesson Plan – Mixtures', blocks: [{ type: 'heading', text: 'I. Objectives' }, { type: 'paragraph', text: 'Classify mixtures as homogeneous or heterogeneous.' }] }) };
    });
    const readParsed = async (p) => readDocument({ bytes: await readFileBytes(ws.handle, p), name: p.split('/').pop() });
    const lesson = lessonFor(rizal, '2026-10-26', seq);
    const job = { key: lesson.key, iso: '2026-10-26', cls: rizal, sections: [rizal], lesson, minutes: 50 };
    const res = await prepareLesson(job, { workspace: ws, user: { uid: 'u1' }, profile: { fullName: 'Ana Reyes' }, persona: 'matt', privacyMode: true, settings: DEFAULT_SETTINGS, readParsed });
    expect(res.status).toBe('ready');
    expect(res.note).toMatch(/Used your materials: Module 3 Mixtures\.docx\./);
    expect(res.files.map((f) => f.path).sort()).toEqual([
      expect.stringMatching(/^Lesson Prep\/2026-10-26 Monday\/Science 7 - Classify mixtures as homogeneous or heterogeneous\/.+\.docx$/),
      expect.stringMatching(/^Lesson Prep\/2026-10-26 Monday\/Science 7 - Classify mixtures as homogeneous or heterogeneous\/.+\.pptx$/),
    ].sort((a, b) => String(a).localeCompare(String(b))));
    expect(prompts.some((p) => p.includes('You are the planner'))).toBe(false);          // an approved plan: no planner
    expect(prompts.join(' ')).toMatch(/meeting 1 of 2/);
    expect(prompts.join(' ')).toMatch(/S7MT-IIb-2/);
    expect(prompts.join(' ')).toMatch(/homogeneous throughout|looks the same throughout/i);  // the module was used
    // Nothing of the teacher's was changed or moved.
    expect(flattenFileTree(ws.handle.getFiles()).filter((f) => !f.path.startsWith('Lesson Prep/')).map((f) => f.path).sort()).toEqual(before);
  });

  it('no matching materials: says the content is general; an AI failure is reported, not hidden', async () => {
    const ws = createVirtualWorkspace('Class');
    ws.files = ws.handle.getFiles();
    expect(await pickMaterials('', seq.items[0], ws, async () => ({}))).toEqual([]);
    callGeminiProxy.mockRejectedValue(Object.assign(new Error('AI unavailable'), { code: 'AI_UNAVAILABLE' }));
    const lesson = lessonFor(rizal, '2026-10-26', seq);
    const res = await prepareLesson({ key: lesson.key, iso: '2026-10-26', cls: { ...rizal, materialsFolder: '' }, sections: [rizal], lesson, minutes: 50 }, { workspace: ws, user: { uid: 'u1' }, profile: {}, persona: 'matt', settings: DEFAULT_SETTINGS, readParsed: null });
    expect(res.status).toBe('failed');
    expect(res.files).toEqual([]);
  });
});

describe('bubble messages', () => {
  const lesson = lessonFor(rizal, '2026-10-26', seq);
  const period = { cls: rizal, start: 450, end: 500, lesson };
  const files = [{ path: 'Lesson Prep/x/Mixtures.pptx', name: 'Mixtures.pptx' }, { path: 'Lesson Prep/x/Lesson Plan - Mixtures.docx', name: 'Lesson Plan - Mixtures.docx' }, { path: 'Lesson Prep/x/Worksheet - Mixtures.docx', name: 'Worksheet - Mixtures.docx' }];

  it('reminders show the real status and only the buttons that work', () => {
    const ready = messageFor({ type: 'remind', key: 'remind|2026-10-26|r|10', period, minutes: 10 }, { persona: 'grey', name: 'Sir Ben', prepared: { [lesson.key]: { status: 'ready', files } } });
    expect(ready.text).toBe('Sir Ben, Science 7 – Rizal in 10 minutes. Lesson "Classify mixtures as homogeneous or heterogeneous" and slides are ready.');
    expect(ready.actions.map((a) => a.id)).toEqual(['openSlides', 'openPlan', 'snooze', 'dismiss']);
    expect(lessonFiles({ files }).plan.name).toBe('Lesson Plan - Mixtures.docx');
    const failed = messageFor({ type: 'remind', key: 'k', period, minutes: 30 }, { persona: 'carmen', name: "Ma'am Ana", prepared: { [lesson.key]: { status: 'failed' } } });
    expect(failed.text).toMatch(/could not prepare/);
    expect(failed.actions.map((a) => a.id)).toEqual(['prepareNow', 'snooze', 'dismiss']);
    const special = messageFor({ type: 'remind', key: 'k', period: { ...period, lesson: { kind: 'special', special: { title: 'Term 2: Second Teacher-made Summative Test' } } }, minutes: 10 }, { persona: 'matt', name: 'Sir Ben' });
    expect(special.text).toMatch(/Term 2: Second Teacher-made Summative Test\. No new lesson today\./);
    const after = messageFor({ type: 'after', key: 'after|2026-10-26|r', period }, { persona: 'luna', name: 'Sir Ben' });
    expect(after.data).toEqual({ classId: 'r', iso: '2026-10-26' });
  });

  it('mood and short replies', () => {
    expect(bubbleMood({ inClass: true, current: { kind: 'remind' } })).toBe('quiet');
    expect(bubbleMood({ current: { kind: 'after' } })).toBe('needs');
    expect(bubbleMood({ preparing: true })).toBe('preparing');
    expect(bubbleMood({ todayLessons: [period], prepared: { [lesson.key]: { status: 'ready' } } })).toBe('ready');
    expect(bubbleMood({})).toBe('resting');
    expect(bubbleReply('**Yes.** Do it.')).toBe('Yes. Do it.');
    expect(bubbleReply('x'.repeat(600))).toMatch(/the full answer is in KaTuroDesk\)$/);
  });
});
