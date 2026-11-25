import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as XLSX from 'xlsx';
import { callGeminiProxy } from '../../../services/geminiConfig';
import { useDeskStore, workspaceIdOf } from '../../../store/deskStore';
import { useRoutineStore } from '../../../store/routineStore';
import { createVirtualWorkspace } from '../../../services/localFileSystem';
import { cleanRoutine } from '../../../services/desk/routines/routine';
import { resetTaskActionSupport } from '../../../services/desk/agent/llm';
import { answerRun, startRoutine } from './routineEngine';
import { beginBackgroundWork, endBackgroundWork } from '../deskScheduler';

// The AI must not be needed: attendance is checked by code.
vi.mock('../../../services/geminiConfig', () => ({ callGeminiProxy: vi.fn(async () => { throw new Error('AI must not be called'); }) }));

const SF2 = [
  ['School Form 2 (SF2) Daily Attendance Report of Learners'],
  ['Name of School', 'Sample NHS', null, 'Month', 'October'],
  ["LEARNER'S NAME (Last Name, First Name, Middle Name)", 3, 4, 5, 6, 7, 10, 11, 'ABSENT', 'TARDY'],
  [null, 'M', 'T', 'W', 'TH', 'F', 'M', 'T'],
  ['Dela Cruz, Juan P.', null, 'x', 'x', 'x', null, null, null, 3, 0],
  ['Reyes, Mark', null, null, null, null, null, null, null, 0, 0],
  ['Santos, Maria', 'x', null, null, null, null, 'x', null, 2, 0],
];
const xlsx = (rows) => {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'October');
  return new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }));
};
const flat = (tree) => tree.flatMap((e) => (e.children ? flat(e.children) : [e]));
const user = { uid: 'u1' };
const profile = { fullName: 'Ana Reyes' };

function setup(cards) {
  const ws = createVirtualWorkspace('Class');
  ws.handle.saveVirtualFile('Records/SF2 October.xlsx', xlsx(SF2));
  ws.files = ws.handle.getFiles();
  useDeskStore.setState({ workspace: ws, isGenerating: false, messages: [], artifacts: [] });
  useRoutineStore.setState({ routines: [], meta: {}, runs: [] });
  const raw = { name: 'Friday attendance', cards: cards.map(([type, settings = {}], i) => ({ id: `c${i}`, type, settings })), wires: cards.slice(1).map((_, i) => ({ from: `c${i}`, to: `c${i + 1}` })) };
  const { routine } = useRoutineStore.getState().saveRoutine(cleanRoutine(raw).routine, { workspaceId: workspaceIdOf(ws), workspaceName: ws.name });
  return { ws, routine };
}

describe('routines inside KaTuroDesk (the real agent and tools)', () => {
  beforeEach(() => { resetTaskActionSupport(); callGeminiProxy.mockClear(); });

  it('SF2 → find frequent absences → tell me: real notices made, by code, progress saved, told in the chat', async () => {
    const { ws, routine } = setup([['when.manual'], ['get.sheet', { path: 'Records/SF2 October.xlsx' }], ['do.attendance', { minConsecutive: 3, gradeSection: 'Grade 7 - Rizal' }], ['save.notify', {}]]);
    const run = await startRoutine(routine.id, { user, profile });
    expect(callGeminiProxy).not.toHaveBeenCalled();
    expect(run.status).toBe('done');
    expect(run.steps.c2.status).toBe('done');
    expect(run.steps.c2.summary).toMatch(/1 learner\(s\) flagged for 3\+ consecutive absences/);
    expect(run.steps.c2.files.some((p) => /Home_Visitation_Notices.*\.docx$/.test(p))).toBe(true);
    expect(flat(ws.handle.getFiles()).some((f) => /Home_Visitation_Notices.*\.docx$/.test(f.path))).toBe(true);
    expect(run.steps.c3.status).toBe('done');
    expect(useRoutineStore.getState().runs[0]).toMatchObject({ id: run.id, status: 'done' });
    expect(useDeskStore.getState().messages.at(-1).content).toMatch(/^\*\*Routine\*\* — "Friday attendance" finished: \d file\(s\) made or updated\.$/);
  });

  it('"Ask me first" waits (nothing made yet), then goes on when approved', async () => {
    const { routine } = setup([['when.manual'], ['get.sheet', { path: 'Records/SF2 October.xlsx' }], ['ask.approve', { note: 'Check the SF2 first' }], ['do.attendance', {}]]);
    const waiting = await startRoutine(routine.id, { user, profile });
    expect(waiting.status).toBe('waiting');
    expect(waiting.steps.c3.status).toBe('pending');
    expect(useDeskStore.getState().messages.at(-1).content).toMatch(/is waiting for your OK: Check the SF2 first\./);
    const done = await answerRun(waiting.id, true, { user, profile, by: 'KaTuroDesk' });
    expect(done.status).toBe('done');
    expect(done.steps.c2.summary).toBe('Approved (KaTuroDesk)');
    expect(done.steps.c3.status).toBe('done');
    await expect(answerRun(waiting.id, true, { user, profile })).rejects.toThrow(/no longer waiting/);
  });

  it('one thing at a time: busy → null (tried again later); another folder open → said plainly', async () => {
    const { routine } = setup([['when.manual'], ['get.sheet', { path: 'Records/SF2 October.xlsx' }]]);
    expect(beginBackgroundWork()).toBe(true);
    try {
      expect(await startRoutine(routine.id, { user, profile })).toBeNull();
    } finally {
      endBackgroundWork();
    }
    useDeskStore.setState({ isGenerating: true });
    expect(await startRoutine(routine.id, { user, profile })).toBeNull();
    useDeskStore.setState({ isGenerating: false, workspace: createVirtualWorkspace('Another folder') });
    await expect(startRoutine(routine.id, { user, profile })).rejects.toThrow(/Open the folder "Class" first/);
  });

  it('a file that is gone stops the routine with the reason; nothing after it runs', async () => {
    const { routine } = setup([['when.manual'], ['get.sheet', { path: 'Records/SF2 November.xlsx' }], ['do.attendance', {}]]);
    const run = await startRoutine(routine.id, { user, profile });
    expect(run.status).toBe('error');
    expect(run.steps.c1.summary).toBe('"Records/SF2 November.xlsx" is not in your KaTuro folder any more.');
    expect(run.steps.c2.status).toBe('skipped');
  });
});
