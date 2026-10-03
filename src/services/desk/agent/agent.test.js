import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as XLSX from 'xlsx';
import { callGeminiProxy } from '../../geminiConfig';
import { runDeskAgentTurn, personaFor, docPersonaFor, clearAnswerMemory } from './deskAgent';
import { getPersona, PERSONAS, timeOfDay } from '../personas';
import { runTaskGraph } from './runner';
import { createNameMasker } from './privacy';
import { sanitizePlan, resolvePath, planOffline } from './planner';
import { parseJsonReply, buildContents, resetTaskActionSupport } from './llm';
import { createVirtualWorkspace, flattenFileTree, readFileBytes } from '../../localFileSystem';
import { readDocument } from '../readers/index.js';

vi.mock('../../geminiConfig', () => ({ callGeminiProxy: vi.fn() }));

const LEARNERS = [
  ['Dela Cruz, Juan P.', 1, 1, 0, 1, 0],
  ['Santos, Maria L.', 1, 1, 1, 1, 0],
  ['Reyes, Pedro A.', 1, 0, 0, 1, 0],
  ['Bautista, Ana M.', 1, 1, 0, 0, 0],
  ['Garcia, Jose R.', 1, 1, 1, 1, 1],
];

function scoreSheetBytes() {
  const rows = [
    ['Grade 7 - Rizal Quiz 1'],
    [],
    ['Name of Learners', 1, 2, 3, 4, 5],
    ...LEARNERS,
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'Rizal');
  return new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }));
}

function workspaceWithScores() {
  const ws = createVirtualWorkspace('Test Folder');
  ws.handle.saveVirtualFile('Scores/Quiz1_Rizal.xlsx', scoreSheetBytes());
  ws.files = ws.handle.getFiles();
  return ws;
}

function sentText(callIndex) {
  const { contents } = callGeminiProxy.mock.calls[callIndex][0];
  return JSON.stringify(contents);
}

beforeEach(() => {
  resetTaskActionSupport();
  clearAnswerMemory();
  callGeminiProxy.mockReset();
});

describe('runDeskAgentTurn (plan → parallel tools → real files)', () => {
  it('answers a greeting instantly in the persona voice with no AI call', async () => {
    const res = await runDeskAgentTurn({
      prompt: 'hello po!',
      workspace: createVirtualWorkspace('X'),
      user: { uid: 'u1' },
      profile: { firstName: 'Ben', gender: 'male' },
      persona: 'matt',
    });
    expect(res.content).toMatch(/^Yow Sir Ben!/);
    expect(res.fastPath).toBe('local');
    expect(callGeminiProxy).not.toHaveBeenCalled();
  });

  it('answers a general question through the planner on the fast tier, streaming the reply', async () => {
    callGeminiProxy.mockImplementationOnce(async (req) => {
      req.onChunk?.('{"reply": "Hello, Sir', '{"reply": "Hello, Sir');
      req.onChunk?.(' Ben! Use exit tickets."', '{"reply": "Hello, Sir Ben! Use exit tickets."');
      return { text: JSON.stringify({ reply: 'Hello, Sir Ben! Use exit tickets.', tasks: [] }) };
    });
    const updates = [];
    const res = await runDeskAgentTurn({
      prompt: 'Any tips for checking understanding in Grade 4?',
      workspace: createVirtualWorkspace('X'),
      user: { uid: 'u1' },
      profile: { firstName: 'Ben', gender: 'male' },
      onUpdate: (u) => u.reply && updates.push(u.reply),
    });
    expect(res.content).toContain('exit tickets');
    const req = callGeminiProxy.mock.calls[0][0];
    expect(req).toMatchObject({ action: 'desk_agent_run', tier: 'fast', stream: true, region: 'asia-southeast1' });
    expect(updates).toContain('Hello, Sir');

    // Asking again with nothing changed is answered from memory (no second AI call).
    const again = await runDeskAgentTurn({
      prompt: 'Any tips for checking understanding in Grade 4?',
      workspace: createVirtualWorkspace('X'),
      user: { uid: 'u1' },
      profile: { firstName: 'Ben', gender: 'male' },
    });
    expect(again.fastPath).toBe('memory');
    expect(callGeminiProxy).toHaveBeenCalledTimes(1);
  });

  it('routes an obvious request straight to the tool (no planner call)', async () => {
    const workspace = workspaceWithScores();
    callGeminiProxy.mockResolvedValueOnce({ text: JSON.stringify({ remarks: ['ok'], interventions: ['ok'] }) });
    const res = await runDeskAgentTurn({
      prompt: 'Run an item analysis on the attached score sheet. Show the MPS, mastery level, and least mastered competencies.',
      workspace,
      attachedPaths: ['Scores/Quiz1_Rizal.xlsx'],
      user: { uid: 'u1' },
      persona: 'luna',
    });
    expect(res.content).toMatch(/^Certainly, Teacher\. I will take care of the item analysis now\./);
    expect(res.createdFiles.map((f) => f.format).sort()).toEqual(['docx', 'xlsx']);
    // Only the remarks call reached the AI; no planner round trip.
    expect(callGeminiProxy).toHaveBeenCalledTimes(1);
    expect(callGeminiProxy.mock.calls[0][0].action).toBe('desk_agent_task');
  });

  it('runs an item analysis on a real xlsx, saves docx + xlsx, and masks learner names', async () => {
    const workspace = workspaceWithScores();
    callGeminiProxy
      .mockResolvedValueOnce({
        text: JSON.stringify({
          reply: 'I will analyze the quiz.',
          tasks: [{ id: 't1', tool: 'analyze_scores', label: 'Item analysis – Rizal', args: { path: 'scores/quiz1_rizal.xlsx', testTitle: 'Quiz 1' } }],
        }),
      })
      .mockResolvedValueOnce({ text: JSON.stringify({ remarks: ['Item 5 needs reteaching for Learner 01.'], interventions: ['Small-group drill.'] }) });

    const steps = [];
    const res = await runDeskAgentTurn({
      prompt: 'Item analysis please',
      workspace,
      user: { uid: 'u1' },
      privacyMode: true,
      onUpdate: ({ steps: s }) => steps.push(s),
    });

    expect(res.content).toContain('MPS');
    expect(res.createdFiles.map((f) => f.format).sort()).toEqual(['docx', 'xlsx']);
    expect(res.createdFiles.every((f) => f.path.startsWith('KaTuro Outputs/'))).toBe(true);

    // Files really exist in the workspace and are real Office files.
    const docx = res.createdFiles.find((f) => f.format === 'docx');
    const bytes = await readFileBytes(workspace.handle, docx.path);
    expect(String.fromCharCode(bytes[0], bytes[1])).toBe('PK');
    const parsed = await readDocument({ bytes, name: docx.name });
    expect(parsed.text).toContain('Dela Cruz'); // real name restored locally
    expect(parsed.text).toMatch(/Item 5 needs reteaching for (Dela Cruz|Juan)/);

    // The remarks prompt must not contain real learner names.
    const remarksPrompt = sentText(1);
    expect(remarksPrompt).not.toContain('Dela Cruz');
    expect(callGeminiProxy.mock.calls[1][0].action).toBe('desk_agent_task');

    // Item 5 (1/5 correct) is least mastered; live steps were emitted.
    const art = res.artifacts[0];
    expect(art.data.analysis.leastMastered.map((i) => i.number)).toContain(5);
    expect(steps.some((s) => s.some((x) => x.status === 'running'))).toBe(true);
  });

  it('falls back to the offline planner when the AI is unreachable', async () => {
    const workspace = workspaceWithScores();
    const err = Object.assign(new Error('unavailable'), { code: 'functions/unavailable' });
    callGeminiProxy.mockRejectedValue(err);
    const res = await runDeskAgentTurn({
      // Not fast-routable ("and then" = multi-step), so it goes to the planner, which is offline.
      prompt: 'Do the item analysis and then suggest next steps for my class',
      workspace,
      attachedPaths: ['Scores/Quiz1_Rizal.xlsx'],
      user: { uid: 'u1' },
    });
    expect(res.aiOffline).toBeTruthy();
    expect(res.createdFiles.length).toBeGreaterThan(0);
    expect(res.content).toMatch(/offline/i);
  });

  it('reports a bad file path instead of inventing one', async () => {
    callGeminiProxy.mockResolvedValueOnce({
      text: JSON.stringify({ reply: 'On it.', tasks: [{ id: 't1', tool: 'analyze_scores', args: { path: 'Nope/missing.xlsx' } }] }),
    });
    const res = await runDeskAgentTurn({ prompt: 'analyze', workspace: createVirtualWorkspace('X'), user: { uid: 'u1' } });
    expect(res.content).toContain("couldn't find");
    expect(res.createdFiles).toHaveLength(0);
  });

  it('writes a document from an AI DocumentSpec into a named folder', async () => {
    const workspace = createVirtualWorkspace('X');
    callGeminiProxy
      .mockResolvedValueOnce({
        text: JSON.stringify({
          reply: 'Drafting your letter.',
          tasks: [{ id: 't1', tool: 'write_document', args: { docType: 'letter', title: 'Parent Meeting Notice', instructions: 'Invite parents', outputFolder: 'Letters' } }],
        }),
      })
      .mockResolvedValueOnce({
        text: '```json\n{"title":"x","blocks":[{"type":"paragraph","text":"Dear Parents, **please** attend."},{"type":"table","columns":["Date","Time"],"rows":[["Oct 10","2 PM"]]}]}\n```',
      });
    const res = await runDeskAgentTurn({ prompt: 'letter', workspace, user: { uid: 'u1' } });
    const file = res.createdFiles[0];
    expect(file.path).toBe('Letters/Parent_Meeting_Notice.docx');
    expect(res.artifacts[0].spec.title).toBe('Parent Meeting Notice');
    expect(flattenFileTree(workspace.handle.getFiles()).some((f) => f.path === file.path)).toBe(true);
  });
});

describe('gateway compatibility', () => {
  it('falls back to desk_agent_run when the deployed function lacks desk_agent_task (plain Error, no code)', async () => {
    const workspace = createVirtualWorkspace('X');
    callGeminiProxy
      .mockResolvedValueOnce({ text: JSON.stringify({ reply: 'Writing it.', tasks: [{ id: 't1', tool: 'write_document', args: { docType: 'summary', title: 'Folder Summary', instructions: 'Summarize' } }] }) })
      // Exactly what callGeminiProxy throws today: message only, Firebase code stripped.
      .mockRejectedValueOnce(new Error('Unknown or missing action.'))
      .mockResolvedValueOnce({ text: JSON.stringify({ title: 'Folder Summary', blocks: [{ type: 'paragraph', text: 'Overview.' }] }) });
    const res = await runDeskAgentTurn({ prompt: 'summary', workspace, user: { uid: 'u1' } });
    expect(callGeminiProxy.mock.calls.map((c) => c[0].action)).toEqual(['desk_agent_run', 'desk_agent_task', 'desk_agent_run']);
    expect(res.createdFiles).toHaveLength(1);
    expect(res.content).not.toMatch(/Unknown or missing action/);
  });

  it('treats the gateway daily-limit error (status 429, no code) as AI unavailable', async () => {
    const limit = Object.assign(new Error("You've reached today's limit."), { status: 429, dailyLimit: true });
    callGeminiProxy.mockRejectedValue(limit);
    const res = await runDeskAgentTurn({ prompt: 'make a DLL', workspace: createVirtualWorkspace('X'), user: { uid: 'u1' } });
    expect(res.aiOffline).toMatch(/limit/i);
  });
});

describe('personas (Matt / Luna)', () => {
  const teacher = { salutation: 'Sir Ben' };

  it('builds distinct chat voices and a neutral document voice', () => {
    expect(personaFor(teacher, 'matt')).toMatch(/Matt/);
    expect(personaFor(teacher, 'matt')).toMatch(/Yow Sir/);
    expect(personaFor(teacher, 'luna')).toMatch(/Luna/);
    expect(personaFor(teacher, 'luna')).toMatch(/pleasant morning/i);
    expect(personaFor(teacher, 'nobody')).toMatch(/Matt/); // unknown id → default
    expect(docPersonaFor(teacher)).not.toMatch(/Matt|Luna/);
    expect(personaFor(teacher, 'luna', new Date(2026, 9, 2, 15))).toMatch(/afternoon/);
  });

  it('greets in each persona and exposes avatars metadata', () => {
    expect(PERSONAS.matt.welcome('Sir Ben')).toMatch(/^Yow Sir Ben!/);
    expect(PERSONAS.luna.welcome("Ma'am April")).toMatch(/^A pleasant day, Ma'am April\./);
    expect(getPersona('luna').gender).toBe('girl');
    expect(timeOfDay(new Date(2026, 0, 1, 8))).toBe('morning');
  });

  it('sends the chosen persona to the planner but keeps document prompts formal', async () => {
    const workspace = workspaceWithScores();
    callGeminiProxy
      .mockResolvedValueOnce({ text: JSON.stringify({ reply: 'A pleasant morning, Sir Ben.', tasks: [{ id: 't1', tool: 'analyze_scores', args: { path: 'Scores/Quiz1_Rizal.xlsx' } }] }) })
      .mockResolvedValueOnce({ text: JSON.stringify({ remarks: ['ok'], interventions: ['ok'] }) });
    await runDeskAgentTurn({ prompt: 'analyze', workspace, user: { uid: 'u1' }, persona: 'luna' });
    expect(sentText(0)).toContain('Your name is Luna');
    expect(sentText(1)).not.toMatch(/Your name is (Luna|Matt)/);
    expect(sentText(1)).toMatch(/formal, clear, professional/);
  });
});

describe('runTaskGraph', () => {
  it('runs independent tasks in parallel (capped) and dependents after', async () => {
    let running = 0;
    let peak = 0;
    const order = [];
    const tasks = [
      { id: 'a', tool: 'x' }, { id: 'b', tool: 'x' }, { id: 'c', tool: 'x' }, { id: 'd', tool: 'x' },
      { id: 'e', tool: 'x', dependsOn: ['a', 'b'] },
    ];
    const results = await runTaskGraph(tasks, async (t, deps) => {
      running += 1;
      peak = Math.max(peak, running);
      await new Promise((r) => setTimeout(r, 10));
      running -= 1;
      order.push(t.id);
      return { summary: t.id, deps: Object.keys(deps) };
    }, { concurrency: 3 });
    expect(peak).toBe(3);
    expect(order.indexOf('e')).toBeGreaterThan(order.indexOf('a'));
    expect(results.get('e').result.deps.sort()).toEqual(['a', 'b']);
  });

  it('skips dependents of a failed task but finishes the rest', async () => {
    const results = await runTaskGraph(
      [{ id: 'a', tool: 'x' }, { id: 'b', tool: 'x', dependsOn: ['a'] }, { id: 'c', tool: 'x' }],
      async (t) => {
        if (t.id === 'a') throw new Error('boom');
        return {};
      },
    );
    expect(results.get('a').status).toBe('error');
    expect(results.get('b').status).toBe('skipped');
    expect(results.get('c').status).toBe('done');
  });

  it('does not hang on circular dependencies', async () => {
    const results = await runTaskGraph([{ id: 'a', tool: 'x', dependsOn: ['b'] }, { id: 'b', tool: 'x', dependsOn: ['a'] }], async () => ({}));
    expect(results.get('a').status).toBe('skipped');
  });
});

describe('privacy masker', () => {
  it('masks name variants and restores them deeply', () => {
    const m = createNameMasker();
    m.addNames(['Dela Cruz, Juan P.', 'Santos, Maria']);
    const masked = m.mask('Juan Dela Cruz and DELA CRUZ, JUAN P. scored low; Maria Santos too.');
    expect(masked).not.toMatch(/Juan|Maria/);
    expect(masked).toContain('Learner 01');
    expect(m.unmask({ a: ['Learner 02 improved'] })).toEqual({ a: ['Santos, Maria improved'] });
  });

  it('does nothing when disabled', () => {
    const m = createNameMasker({ enabled: false });
    m.addNames(['Reyes, Pedro']);
    expect(m.mask('Pedro Reyes')).toBe('Pedro Reyes');
  });
});

describe('planner helpers', () => {
  const files = [{ kind: 'file', name: 'Quiz.xlsx', path: 'Grade 7/Quiz.xlsx' }, { kind: 'file', name: 'DLL.docx', path: 'DLL.docx' }];

  it('resolves case/slash differences and unique basenames', () => {
    expect(resolvePath('grade 7\\quiz.xlsx', files)).toBe('Grade 7/Quiz.xlsx');
    expect(resolvePath('Quiz.xlsx', files)).toBe('Grade 7/Quiz.xlsx');
    expect(resolvePath('Other.xlsx', files)).toBeNull();
  });

  it('drops unknown tools and missing paths', () => {
    const { tasks, problems } = sanitizePlan({
      tasks: [
        { id: 't1', tool: 'analyze_scores', args: { path: 'quiz.xlsx' } },
        { id: 't2', tool: 'hack_the_planet', args: {} },
        { id: 't3', tool: 'write_document', args: { sourcePaths: ['DLL.docx', 'ghost.docx'] } },
      ],
    }, files);
    expect(tasks.map((t) => t.id)).toEqual(['t1', 't3']);
    expect(tasks[1].args.sourcePaths).toEqual(['DLL.docx']);
    expect(problems.join(' ')).toMatch(/hack_the_planet/);
    expect(problems.join(' ')).toMatch(/ghost/);
  });

  it('offline planner routes code-only workflows', () => {
    expect(planOffline('merge these', { attachedPaths: ['a.pdf', 'b.pdf'] })[0].tool).toBe('merge_pdfs');
    expect(planOffline('check attendance', { attachedPaths: ['sf2.xlsx'] })[0].tool).toBe('check_attendance');
    expect(planOffline('write me a poem', { attachedPaths: [] })).toEqual([]);
  });
});

describe('llm helpers', () => {
  it('parses fenced or chatty JSON', () => {
    expect(parseJsonReply('Sure! ```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(parseJsonReply('Here: {"b":[1,2]} thanks')).toEqual({ b: [1, 2] });
    expect(() => parseJsonReply('no json')).toThrow();
  });

  it('builds alternating contents with the system prompt first', () => {
    const contents = buildContents({
      system: 'SYS',
      history: [{ role: 'assistant', content: 'welcome' }, { role: 'user', content: 'q1' }, { role: 'assistant', content: 'a1' }],
      prompt: 'q2',
      parts: [{ inlineData: { mimeType: 'image/png', data: 'xx' } }],
    });
    expect(contents.map((c) => c.role)).toEqual(['user', 'model', 'user']);
    expect(contents[0].parts[0].text.startsWith('SYS')).toBe(true);
    expect(contents[2].parts[1].inlineData.mimeType).toBe('image/png');
  });
});
