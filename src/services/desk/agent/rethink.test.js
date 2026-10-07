import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as XLSX from 'xlsx';
import { callGeminiProxy } from '../../geminiConfig';
import { runDeskAgentTurn, clearAnswerMemory, readPlanCheck, needsConfirmation } from './deskAgent';
import { resetTaskActionSupport } from './llm';
import { createVirtualWorkspace } from '../../localFileSystem';

vi.mock('../../geminiConfig', () => ({ callGeminiProxy: vi.fn() }));

const LEARNERS = [['Cruz, Ana', 1, 1, 0, 1, 1], ['Reyes, Ben', 1, 0, 0, 1, 0], ['Santos, Carla', 1, 1, 1, 1, 1], ['Lim, Dino', 0, 1, 0, 1, 1]];
function sheet(title) {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([[title], [], ['Name of Learners', 1, 2, 3, 4, 5], ...LEARNERS]), 'S');
  return new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }));
}
const SECTIONS = ['Rizal', 'Mabini', 'Bonifacio', 'Luna'];
function workspace() {
  const ws = createVirtualWorkspace('Grade 7');
  for (const s of SECTIONS) ws.handle.saveVirtualFile(`Scores/Quiz1_${s}.xlsx`, sheet(`Grade 7 - ${s} Quiz 1`));
  ws.files = ws.handle.getFiles();
  return ws;
}
const analyzeAll = () => SECTIONS.map((s, i) => ({ id: `t${i + 1}`, tool: 'analyze_scores', label: `Item analysis – ${s}`, args: { path: `Scores/Quiz1_${s}.xlsx` } }));
const plannerSays = (plan) => callGeminiProxy.mockImplementation(async () => ({ text: JSON.stringify(plan) }));

beforeEach(() => {
  resetTaskActionSupport();
  clearAnswerMemory();
  callGeminiProxy.mockReset();
});

describe('the planner self-check (understanding, confidence, missing, choices)', () => {
  it('reads the fields; missing fields mean "high" so old replies behave as before', () => {
    expect(readPlanCheck({})).toEqual({ confidence: 'high', understanding: '', missing: [], assumptions: [], choices: [] });
    const c = readPlanCheck({ confidence: 'LOW', missing: ['which section', ''], choices: ['Rizal', 'Mabini', 'Bonifacio', 'Luna', 'All'], understanding: 'Item analysis' });
    expect(c.confidence).toBe('low');
    expect(c.missing).toEqual(['which section']);
    expect(c.choices).toEqual(['Rizal', 'Mabini', 'Bonifacio', 'Luna']); // at most 4
    expect(readPlanCheck({ confidence: 'very sure' }).confidence).toBe('high');
  });

  it('big or file-changing plans need a go-ahead; small clear jobs do not', () => {
    expect(needsConfirmation([{ tool: 'analyze_scores' }])).toBe(false);
    expect(needsConfirmation(analyzeAll())).toBe(true); // more than 3 tasks
    expect(needsConfirmation([{ tool: 'edit_file' }])).toBe(true);
    expect(needsConfirmation([{ tool: 'write_document' }])).toBe(true);
  });
});

describe('ask when unsure, confirm big jobs, act when clear', () => {
  it('unsure: asks ONE question with tap answers, and runs nothing', async () => {
    const ws = workspace();
    plannerSays({ confidence: 'low', missing: ['which section'], choices: ['Rizal', 'Mabini'], reply: 'Which section should I analyze, Sir?', tasks: analyzeAll() });
    const res = await runDeskAgentTurn({ prompt: 'analyze the quiz', workspace: ws, user: { uid: 'u1' } });
    expect(res.content).toBe('Which section should I analyze, Sir?');
    expect(res.choices).toEqual(['Rizal', 'Mabini']);
    expect(res.createdFiles).toHaveLength(0);
    expect(res.steps).toEqual([]);
  });

  it('missing details without a question still asks (never guesses)', async () => {
    const ws = workspace();
    plannerSays({ confidence: 'high', missing: ['number of items'], reply: 'Sure!', tasks: analyzeAll().slice(0, 1) });
    const res = await runDeskAgentTurn({ prompt: 'analyze the quiz', workspace: ws, user: { uid: 'u1' } });
    expect(res.content).toMatch(/\*\*Needs your input\*\* — number of items/);
    expect(res.createdFiles).toHaveLength(0);
  });

  it('fairly sure about a big job: shows the plan and waits; Proceed runs it with NO new AI call', async () => {
    const ws = workspace();
    plannerSays({
      understanding: 'Item analysis of Quiz 1 for all four sections', confidence: 'medium',
      assumptions: ['Quiz 1 is the test you mean'], missing: [], choices: [], reply: 'I can do that.', tasks: analyzeAll(),
    });
    const first = await runDeskAgentTurn({ prompt: 'analyze the quizzes', workspace: ws, user: { uid: 'u1' } });
    expect(first.content).toMatch(/\*\*Here's what I understood:\*\* Item analysis of Quiz 1 for all four sections/);
    expect(first.content).toMatch(/- Item analysis – Rizal\n- Item analysis – Mabini/);
    expect(first.content).toMatch(/I'm assuming:\n- Quiz 1 is the test you mean/);
    expect(first.content).toMatch(/Shall I go ahead\?$/);
    expect(first.createdFiles).toHaveLength(0);
    expect(first.pendingPlan.tasks).toHaveLength(4);

    callGeminiProxy.mockReset();
    plannerSays({ reply: 'unused', tasks: [] }); // tools' own small AI calls still answer
    const second = await runDeskAgentTurn({ prompt: 'Proceed', workspace: ws, user: { uid: 'u1' }, confirmedPlan: first.pendingPlan });
    // The approved plan is not planned again (no planner call); tools work as in any run.
    expect(callGeminiProxy.mock.calls.some((c) => JSON.stringify(c[0].contents).includes('You are the planner'))).toBe(false);
    expect(second.content.match(/\*\*Done\*\* — Item analysis/g)).toHaveLength(4);
    expect(second.createdFiles.length).toBeGreaterThan(0);
  });

  it('scheduled tasks were approved when scheduled: no "Proceed?" step', async () => {
    const ws = workspace();
    plannerSays({ confidence: 'medium', assumptions: ['Quiz 1'], reply: 'On it.', tasks: analyzeAll() });
    const res = await runDeskAgentTurn({ prompt: 'analyze the quizzes', workspace: ws, user: { uid: 'u1' }, autoApprove: true });
    expect(res.pendingPlan).toBeUndefined();
    expect(res.content.match(/\*\*Done\*\*/g)).toHaveLength(4);
  });

  it('a clear request (or an old-style reply without the fields) runs straight away', async () => {
    const ws = workspace();
    plannerSays({ reply: 'Running it now.', tasks: analyzeAll() });
    const res = await runDeskAgentTurn({ prompt: 'item analysis of all four sections', workspace: ws, user: { uid: 'u1' } });
    expect(res.pendingPlan).toBeUndefined();
    expect(res.content.match(/\*\*Done\*\*/g)).toHaveLength(4);
  });

  it("the teacher's answer is joined to the earlier request", async () => {
    const ws = workspace();
    plannerSays({ reply: 'OK.', tasks: [] });
    await runDeskAgentTurn({
      prompt: 'Rizal po', workspace: ws, user: { uid: 'u1' },
      history: [{ role: 'user', content: 'analyze the quiz' }, { role: 'assistant', content: 'Which section should I analyze, Sir?' }],
    });
    const sent = JSON.stringify(callGeminiProxy.mock.calls[0][0].contents);
    expect(sent).toMatch(/Your previous reply asked the teacher a question/);
    expect(sent).toMatch(/Think before you plan/); // rule 11 is in the planner instructions
  });
});
