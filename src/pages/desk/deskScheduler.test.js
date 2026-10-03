import { describe, it, expect, vi, beforeEach } from 'vitest';
import { callGeminiProxy } from '../../services/geminiConfig';
import { createVirtualWorkspace } from '../../services/localFileSystem';
import { useDeskStore } from '../../store/deskStore';
import { runScheduledTask } from './deskScheduler';
import { clearAnswerMemory } from '../../services/desk/agent/deskAgent';
import { resetTaskActionSupport } from '../../services/desk/agent/llm';
import { PERSONAS } from '../../services/desk/personas';
import { QUICK_PROMPTS } from '../../services/desk/agent/fastRoute';

vi.mock('../../services/geminiConfig', () => ({ callGeminiProxy: vi.fn() }));

const user = { uid: 'u1' };
const EMOJI = /\p{Extended_Pictographic}/u;

function freshWorkspace() {
  const ws = createVirtualWorkspace('Grade 7');
  ws.handle.saveVirtualFile('notes.txt', 'Photosynthesis lesson notes');
  ws.files = ws.handle.getFiles();
  return ws;
}

function addTask(overrides = {}) {
  const tomorrow = new Date(Date.now() + 24 * 3600 * 1000);
  const pad = (n) => String(n).padStart(2, '0');
  return useDeskStore.getState().addScheduledTask({
    name: 'Daily notes summary',
    prompt: 'Summarize notes.txt for me',
    attachedPaths: ['notes.txt'],
    schedule: { repeat: 'daily', date: `${tomorrow.getFullYear()}-${pad(tomorrow.getMonth() + 1)}-${pad(tomorrow.getDate())}`, time: '07:00' },
    ...overrides,
  });
}

beforeEach(() => {
  resetTaskActionSupport();
  clearAnswerMemory();
  callGeminiProxy.mockReset();
  useDeskStore.setState({ workspace: freshWorkspace(), scheduledTasks: [], messages: [], isGenerating: false, attachedPaths: [] });
});

describe('scheduled tasks run through the normal chat turn', () => {
  it('runs a due task, shows it in the chat, records the result, and moves the next run forward', async () => {
    const task = addTask();
    // Make it due now.
    useDeskStore.getState().replaceScheduledTask(task.id, (t) => ({ ...t, nextRunAt: Date.now() - 1000 }));
    callGeminiProxy.mockResolvedValue({ text: JSON.stringify({ reply: 'Here is the summary 😊: the notes cover photosynthesis.', tasks: [] }) });

    const done = await runScheduledTask(task.id, { user, profile: {} });

    const { messages, isGenerating } = useDeskStore.getState();
    expect(isGenerating).toBe(false);
    expect(messages[0]).toMatchObject({ role: 'user', content: 'Summarize notes.txt for me', scheduled: { id: task.id, name: 'Daily notes summary' } });
    expect(messages[1].content).toContain('the notes cover photosynthesis');
    expect(messages[1].content).not.toMatch(EMOJI); // professional: no emoji in chat
    expect(done.lastStatus).toBe('done');
    expect(done.runs[0].summary).toContain('photosynthesis');
    expect(done.nextRunAt).toBeGreaterThan(Date.now());
  });

  it('never runs on assumptions: a missing file stops the task and says which', async () => {
    const task = addTask({ attachedPaths: ['notes.txt', 'SF2 October.xlsx'] });
    const done = await runScheduledTask(task.id, { user, profile: {} });
    expect(callGeminiProxy).not.toHaveBeenCalled();
    expect(done.lastStatus).toBe('error');
    expect(done.runs[0].summary).toMatch(/not found.*SF2 October\.xlsx/);
  });

  it('only runs in its own folder, and never while another request is running', async () => {
    const task = addTask();
    useDeskStore.setState({ isGenerating: true });
    expect(await runScheduledTask(task.id, { user, profile: {} })).toBeNull();
    useDeskStore.setState({ isGenerating: false, workspace: createVirtualWorkspace('Other class') });
    await expect(runScheduledTask(task.id, { user, profile: {} })).rejects.toThrow(/Open the folder "Grade 7"/);
    expect(callGeminiProxy).not.toHaveBeenCalled();
  });

  it('"Run now" keeps the schedule as it was', async () => {
    const task = addTask();
    callGeminiProxy.mockResolvedValue({ text: JSON.stringify({ reply: 'Done.', tasks: [] }) });
    const done = await runScheduledTask(task.id, { user, profile: {}, manual: true });
    expect(done.nextRunAt).toBe(task.nextRunAt);
    expect(done.runs[0].late).toBe(false);
  });

  it('cannot start the same task twice at once', async () => {
    const task = addTask();
    let release;
    callGeminiProxy.mockImplementation(() => new Promise((r) => { release = () => r({ text: JSON.stringify({ reply: 'ok', tasks: [] }) }); }));
    const first = runScheduledTask(task.id, { user, profile: {}, manual: true });
    expect(await runScheduledTask(task.id, { user, profile: {}, manual: true })).toBeNull();
    await vi.waitFor(() => expect(release).toBeTypeOf('function'));
    release();
    await first;
    expect(callGeminiProxy).toHaveBeenCalledTimes(1);
  });
});

describe('professional look: no emoji in assistant text or buttons', () => {
  it('persona lines and quick-prompt buttons have no emoji', () => {
    for (const p of Object.values(PERSONAS)) {
      for (const line of [p.sample, p.welcome('Sir Ben'), p.greeting('Sir Ben'), p.thanks('Sir Ben'), p.ack('Sir Ben', 'it')]) {
        expect(line).not.toMatch(EMOJI);
      }
    }
    for (const q of QUICK_PROMPTS) expect(q.label).toMatch(/^[A-Za-z]/);
  });
});
