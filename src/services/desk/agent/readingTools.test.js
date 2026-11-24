import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as XLSX from 'xlsx';
import { callGeminiProxy } from '../../geminiConfig';
import { runDeskAgentTurn, clearAnswerMemory } from './deskAgent';
import { resetTaskActionSupport } from './llm';
import { createVirtualWorkspace, readFileBytes } from '../../localFileSystem';
import { readDocument } from '../readers/index.js';

vi.mock('../../geminiConfig', () => ({ callGeminiProxy: vi.fn() }));

const xlsx = (rows) => {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'Pre-test');
  return new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }));
};

function folder(rows) {
  const ws = createVirtualWorkspace('Class');
  ws.handle.saveVirtualFile('Reading/Grade 5 Rizal Phil-IRI.xlsx', xlsx(rows));
  ws.files = ws.handle.getFiles();
  return ws;
}

const RESULTS = [
  ['PHIL-IRI GROUP SCREENING / ORAL READING — GRADE 5 RIZAL'],
  [],
  ['Name', 'Miscues', 'Comprehension', 'Time'],
  ['Dela Cruz, Juan P.', 2, 6, '1:40'], // 98% · 86% → Independent
  ['Santos, Maria A.', 9, 5, '2:30'], // 94% · 71% → Instructional
  ['Reyes, Ben', 20, 2, '4:10'], // 87% · 29% → Frustration
  ['Lopez, Ana', '', 4, ''], // no miscues → not scored
];

describe('reading_check (Phil-IRI, scored by code)', () => {
  beforeEach(() => { resetTaskActionSupport(); clearAnswerMemory(); callGeminiProxy.mockReset(); });

  const run = async (ws, args) => {
    let ai = 0;
    callGeminiProxy.mockImplementation(async (req) => {
      if (JSON.stringify(req.contents).includes('You are the planner')) return { text: JSON.stringify({ confidence: 'high', reply: 'Sige po.', tasks: [{ id: 't1', tool: 'reading_check', args }] }) };
      ai += 1;
      return { text: '{}' };
    });
    const res = await runDeskAgentTurn({ prompt: 'score the Phil-IRI results', workspace: ws, user: { uid: 'u1' }, profile: { fullName: 'Ana Reyes' }, autoApprove: true });
    return { res, ai };
  };

  it('levels, words per minute and the class profile, saved as Excel; no AI used for the numbers', async () => {
    const ws = folder(RESULTS);
    const { res, ai } = await run(ws, { path: 'Reading/Grade 5 Rizal Phil-IRI.xlsx', passageWords: 150, questions: 7, gradeSection: 'Grade 5 - Rizal', test: 'pre-test' });
    expect(ai).toBe(0);
    expect(res.content).toContain('Phil-IRI reading check for 4 learner(s): 1 Independent, 1 Instructional, 1 Frustration');
    expect(res.content).toContain('1 not scored (Lopez, Ana: no miscue count)');
    expect(res.content).toContain('1 at Frustration level need reading intervention');

    const flat = (tree) => tree.flatMap((e) => (e.children ? flat(e.children) : [e]));
    const out = flat(ws.handle.getFiles()).find((f) => /Phil-IRI.*Reading_Profile.*\.xlsx$/i.test(f.path));
    expect(out?.path).toMatch(/^KaTuro Outputs\/\d{4}-\d{2}-\d{2}\//);
    const parsed = await readDocument({ bytes: await readFileBytes(ws.handle, out.path), name: out.path });
    const [profile, summary] = parsed.sheets;
    expect(profile.rows[0]).toEqual(['Learner', 'Miscues', 'Words', 'Word reading %', 'Word reading level', 'Correct answers', 'Questions', 'Comprehension %', 'Comprehension level', 'Reading level', 'Words per minute', 'Notes']);
    expect(profile.rows[1]).toEqual(['Dela Cruz, Juan P.', 2, 150, 99, 'Independent', 6, 7, 86, 'Independent', 'Independent', 90]);
    expect(profile.rows[3]).toEqual(['Reyes, Ben', 20, 150, 87, 'Frustration', 2, 7, 29, 'Frustration', 'Frustration', 36]);
    expect(profile.rows[4]).toEqual(['Lopez, Ana', null, 150, null, null, 4, 7, 57, 'Frustration', 'Not scored', null, 'no miscue count']);
    expect(summary.rows).toContainEqual(['Frustration', 1, 33]);
    expect(summary.rows).toContainEqual(['For reading intervention (Frustration level)', 1]);
    expect(summary.rows).toContainEqual(['Reyes, Ben']);
  });

  it('asks for the passage length or the number of questions instead of guessing', async () => {
    const ws = folder(RESULTS);
    const a = await run(ws, { path: 'Reading/Grade 5 Rizal Phil-IRI.xlsx', questions: 7 });
    expect(a.res.content).toMatch(/How many words are in the passage/);
    clearAnswerMemory();
    const b = await run(ws, { path: 'Reading/Grade 5 Rizal Phil-IRI.xlsx', passageWords: 150 });
    expect(b.res.content).toMatch(/How many comprehension questions/);
  });

  it('a sheet with Pre-test and Post-test: asks which one, then scores the one named (its name in the title)', async () => {
    const rows = [
      ['Name', 'Pre-test', null, 'Post-test', null],
      [null, 'Miscues', 'Comprehension', 'Miscues', 'Comprehension'],
      ['Cruz, Juan', 20, 2, 2, 7],
    ];
    const ws = folder(rows);
    const a = await run(ws, { path: 'Reading/Grade 5 Rizal Phil-IRI.xlsx', passageWords: 100, questions: 7 });
    expect(a.res.content).toContain('has results for Pre-test and Post-test. Which one should I score?');
    clearAnswerMemory();
    const b = await run(ws, { path: 'Reading/Grade 5 Rizal Phil-IRI.xlsx', passageWords: 100, questions: 7, test: 'post-test' });
    expect(b.res.content).toContain('Phil-IRI reading check for 1 learner(s): 1 Independent, 0 Instructional, 0 Frustration');
    expect(b.res.content).toMatch(/Phil-IRI Class Reading Profile — Post-test|Post-test/);
  });

  it('a sheet that only shows the levels is explained, not scored', async () => {
    const ws = folder([['Name', 'Word Reading', 'Comprehension', 'Reading Level'], ['Cruz, Juan', 'Independent', 'Instructional', 'Instructional']]);
    const { res } = await run(ws, { path: 'Reading/Grade 5 Rizal Phil-IRI.xlsx', passageWords: 100, questions: 7 });
    expect(res.content).toMatch(/no miscue counts or comprehension scores \(it may already show the reading levels\)/);
  });

  it('a file without reading results is said plainly', async () => {
    const ws = folder([['Name', 'Quarter 1'], ['Dela Cruz, Juan', 88]]);
    const { res } = await run(ws, { path: 'Reading/Grade 5 Rizal Phil-IRI.xlsx', passageWords: 150, questions: 7 });
    expect(res.content).toMatch(/couldn't find reading results/);
  });
});
