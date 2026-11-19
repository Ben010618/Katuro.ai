import { describe, it, expect, vi, beforeEach } from 'vitest';
import { callGeminiProxy } from '../../geminiConfig';
import { runDeskAgentTurn, clearAnswerMemory } from './deskAgent';
import { resetTaskActionSupport } from './llm';
import { createVirtualWorkspace, readFileBytes } from '../../localFileSystem';
import { buildClassRecordWorkbook } from '../generators/xlsxWriters';
import { WEIGHT_PRESETS } from '../depedGrading';
import { readDocument } from '../readers/index';
import { parseQuiz, QUIZ_FILE, CHECK_FILE } from '../bubble/quiz';
import { validateTestJson, columnKeyFrom } from './testTools';

vi.mock('../../geminiConfig', () => ({ callGeminiProxy: vi.fn() }));

const RECORD = 'Records/Grade 7 - Rizal - Science.xlsx';
const LEARNERS = [
  { name: 'Dela Cruz, Juan P.', lrn: '136512340001', gender: 'M' },
  { name: 'Santos, Maria L.', lrn: '136512340003', gender: 'F' },
];
const item = (i, answer = 'B') => ({ question: `Question ${i}: which one is a mixture?`, choices: ['A. Water', 'Salt water', 'Gold', 'Oxygen'], answer });

async function home() {
  const ws = createVirtualWorkspace('KaTuro');
  ws.handle.katuroHome = true;
  ws.handle.saveVirtualFile(RECORD, await buildClassRecordWorkbook({
    meta: { subject: 'Science' }, weights: WEIGHT_PRESETS.scienceMath,
    hps: { ww: Array(10).fill(null), pt: Array(10).fill(null), qa: [null] }, learners: LEARNERS, withLrn: true,
  }));
  ws.handle.saveVirtualFile('Lessons/Read me.txt', 'Lessons');
  ws.files = ws.handle.getFiles();
  return ws;
}

const run = (workspace, args) => runDeskAgentTurn({
  prompt: 'make a test', workspace, user: { uid: 'u1' }, profile: { fullName: 'Ana Reyes', school: 'Rizal NHS' }, autoApprove: true,
  confirmedPlan: { reply: '', tasks: [{ id: 't1', tool: 'make_test', args, label: 'Make a test' }] },
});

beforeEach(() => {
  resetTaskActionSupport();
  clearAnswerMemory();
  callGeminiProxy.mockReset();
});

describe('make_test', () => {
  it("checks the AI's test: N items, the right number of choices, answers within the choices", () => {
    const good = validateTestJson({ title: 'T', directions: 'D', items: [item(1), { ...item(2), answer: 'c.' }, { ...item(3), answer: 'Gold' }] }, { items: 3, choices: 4 });
    expect(good.ok).toBe(true);
    expect(good.test.items.map((i) => i.answer)).toEqual(['B', 'C', 'C']);
    expect(good.test.items[0].choices).toEqual(['Water', 'Salt water', 'Gold', 'Oxygen']); // "A. " taken off
    // More items than asked: the first N are kept.
    expect(validateTestJson({ items: [item(1), item(2), item(3)] }, { items: 2, choices: 4 }).test.items).toHaveLength(2);
    const bad = validateTestJson({ items: [item(1, 'E'), { ...item(2), choices: ['a', 'b', 'c'] }, { ...item(3), question: '' }, { ...item(4), choices: ['x', 'X', 'y', 'z'] }] }, { items: 5, choices: 4 });
    expect(bad.ok).toBe(false);
    expect(bad.problems).toEqual([
      'There are 4 items, but 5 were asked for.',
      'Item 1: the answer must be one of A, B, C, D.',
      'Item 2 needs exactly 4 choices.',
      'Item 3 has no question.',
      'Item 4 has the same choice twice.',
    ]);
    expect(validateTestJson({ items: [{ ...item(1), choices: ['a', 'b', 'c', 'd', 'e'], answer: 'E' }] }, { items: 1, choices: 5 }).ok).toBe(true);
    expect(validateTestJson(null, { items: 1, choices: 4 }).ok).toBe(false);
  });

  it('record columns the way teachers say them', () => {
    expect(['ww3', 'WW 3', 'Written Work 3', 'written works 3', 'PT1', 'Performance Task 2', 'QA', 'Quarterly Assessment', 'quarterly exam', 'Periodical Test'].map(columnKeyFrom))
      .toEqual(['ww3', 'ww3', 'ww3', 'ww3', 'pt1', 'pt2', 'qa1', 'qa1', 'qa1', 'qa1']);
    expect(columnKeyFrom('')).toBe('');
    expect(columnKeyFrom('Quiz 3')).toBe('');
  });

  it('makes the test paper, the answer key and bubble sheets for the class in Lessons/Tests, with the manifest and the key', async () => {
    const ws = await home();
    const prompts = [];
    let calls = 0;
    callGeminiProxy.mockImplementation(async (req) => {
      prompts.push(JSON.stringify(req.contents));
      calls += 1;
      // First answer: one item short and a bad answer; the retry is right.
      if (calls === 1) return { text: JSON.stringify({ title: 'Mixtures Quiz', directions: 'Choose the best answer.', items: [item(1, 'F'), item(2)] }) };
      return { text: JSON.stringify({ title: 'Mixtures Quiz', directions: 'Choose the best answer.', items: [item(1, 'A'), item(2, 'B'), item(3, 'C')] }) };
    });
    const res = await run(ws, { recordPath: RECORD, topic: 'Mixtures', items: 3, choices: 4, column: 'Written Work 3' });
    expect(res.content, res.content).toMatch(/Made "Mixtures Quiz" for Grade 7 - Rizal - Science: 3 items \(A to D\), counts as Written Work 3\./);
    expect(res.content).toMatch(/Print the bubble sheets; then scan them with the KaTuro App \(Camera → Test papers\)\./);
    expect(calls).toBe(2);
    expect(prompts[1]).toMatch(/fix them/);
    expect(prompts.join('')).not.toMatch(/Dela Cruz|Santos/); // the learners never go to the AI

    const folder = 'Lessons/Tests/Grade 7 - Rizal - Science/Mixtures Quiz';
    const art = res.artifacts.find((a) => a.type === 'files');
    expect(art.files.map((f) => f.path)).toEqual([`${folder}/Mixtures Quiz - Test.docx`, `${folder}/Mixtures Quiz - Answer Key.docx`, `${folder}/Mixtures Quiz - Bubble Sheets.pdf`]);
    const manifest = JSON.parse(new TextDecoder().decode(await readFileBytes(ws.handle, `${folder}/${QUIZ_FILE}`)));
    expect(parseQuiz(JSON.stringify(manifest))).toBeTruthy();
    expect(manifest).toMatchObject({
      title: 'Mixtures Quiz', items: 3, choices: 4, paper: 'a4', perPage: 4, className: 'Grade 7 - Rizal - Science', recordPath: RECORD, column: 'ww3', columnLabel: 'Written Work 3',
      testPaper: `${folder}/Mixtures Quiz - Test.docx`, answerKeyDoc: `${folder}/Mixtures Quiz - Answer Key.docx`, pdfPath: `${folder}/Mixtures Quiz - Bubble Sheets.pdf`,
    });
    expect(manifest.learners).toEqual([{ n: 1, name: 'Dela Cruz, Juan P.', lrn: '136512340001' }, { n: 2, name: 'Santos, Maria L.', lrn: '136512340003' }]);
    const check = JSON.parse(new TextDecoder().decode(await readFileBytes(ws.handle, `${folder}/${CHECK_FILE}`)));
    expect(check).toEqual({ answerKey: ['A', 'B', 'C'], keyText: 'ABC', sheets: {}, decisions: {} });
    expect(await readFileBytes(ws.handle, `${folder}/Photos/About this folder.txt`)).toBeTruthy();
    const paper = await readDocument({ bytes: await readFileBytes(ws.handle, `${folder}/Mixtures Quiz - Test.docx`), name: 'x.docx' });
    expect(paper.text).toMatch(/Question 3: which one is a mixture\?/);
    expect(paper.text).toMatch(/Salt water/);
    const key = await readDocument({ bytes: await readFileBytes(ws.handle, `${folder}/Mixtures Quiz - Answer Key.docx`), name: 'x.docx' });
    expect(key.text).toMatch(/ABC/);
    const pdf = await readFileBytes(ws.handle, `${folder}/Mixtures Quiz - Bubble Sheets.pdf`);
    expect(new TextDecoder().decode(pdf.slice(0, 5))).toBe('%PDF-');
  });

  it('two tests with the same title in one turn get their own folders (nothing overwritten)', async () => {
    const ws = await home();
    callGeminiProxy.mockImplementation(async (req) => {
      const second = JSON.stringify(req.contents).includes('Cells');
      return { text: JSON.stringify({ title: 'Quiz', items: [item(1, second ? 'D' : 'A')] }) };
    });
    const args = (topic) => ({ recordPath: RECORD, topic, items: 1, column: 'ww1', title: 'Quiz' });
    const res = await runDeskAgentTurn({
      prompt: 'two tests', workspace: ws, user: { uid: 'u1' }, profile: {}, autoApprove: true,
      confirmedPlan: { reply: '', tasks: [{ id: 't1', tool: 'make_test', args: args('Mixtures'), label: 'a' }, { id: 't2', tool: 'make_test', args: args('Cells'), label: 'b' }] },
    });
    const folders = res.artifacts.filter((a) => a.type === 'files').map((a) => a.files[0].path.split('/').slice(0, -1).join('/')).sort();
    expect(folders).toEqual(['Lessons/Tests/Grade 7 - Rizal - Science/Quiz', 'Lessons/Tests/Grade 7 - Rizal - Science/Quiz (2)']);
    const keys = [];
    for (const f of folders) keys.push(JSON.parse(new TextDecoder().decode(await readFileBytes(ws.handle, `${f}/${CHECK_FILE}`))).keyText);
    expect(keys.sort()).toEqual(['A', 'D']);
  });

  it("the test's own folder wins over a save folder the plan names", async () => {
    const ws = await home();
    callGeminiProxy.mockImplementation(async () => ({ text: JSON.stringify({ title: 'Q', items: [item(1)] }) }));
    const res = await run(ws, { recordPath: RECORD, topic: 'Mixtures', items: 1, column: 'ww1', title: 'Q', outputFolder: 'Lessons/Week 3' });
    expect(res.artifacts.find((a) => a.type === 'files').files.map((f) => f.path.split('/').slice(0, -1).join('/'))).toEqual(Array(3).fill('Lessons/Tests/Grade 7 - Rizal - Science/Q'));
  });

  it('outside the KaTuro folder the test goes in Bubble Quizzes', async () => {
    const record = await readFileBytes((await home()).handle, RECORD);
    const plain = createVirtualWorkspace('Plain'); // a folder with Records but no Lessons: not the KaTuro folder
    plain.handle.saveVirtualFile(RECORD, record);
    plain.files = plain.handle.getFiles();
    callGeminiProxy.mockImplementation(async () => ({ text: JSON.stringify({ title: 'Q', items: [item(1)] }) }));
    const res = await run(plain, { recordPath: RECORD, topic: 'Mixtures', items: 1, column: 'ww1', title: 'Q' });
    expect(res.artifacts.find((a) => a.type === 'files').files[0].path).toBe('Bubble Quizzes/Q - Grade 7 - Rizal - Science/Q - Test.docx');
  });

  it('asks, never guesses: the class, the topic, the items, the column', async () => {
    const ws = await home();
    callGeminiProxy.mockImplementation(async () => { throw new Error('the AI should not be asked'); });
    expect((await run(ws, { topic: 'Mixtures', items: 10, column: 'ww1' })).content).toMatch(/Which class is this test for\? Your class records: Grade 7 - Rizal - Science/);
    clearAnswerMemory();
    expect((await run(ws, { recordPath: RECORD, items: 10, column: 'ww1' })).content).toMatch(/What topic or lesson/);
    clearAnswerMemory();
    expect((await run(ws, { recordPath: RECORD, topic: 'Mixtures', column: 'ww1' })).content).toMatch(/How many items/);
    clearAnswerMemory();
    expect((await run(ws, { recordPath: RECORD, topic: 'Mixtures', items: 10 })).content).toMatch(/Which column should this test's scores go to\?/);
    clearAnswerMemory();
    expect((await run(ws, { recordPath: RECORD, topic: 'Mixtures', items: 10, column: 'Quiz 3' })).content).toMatch(/I could not find "Quiz 3"/);
    expect(callGeminiProxy).not.toHaveBeenCalled();
  });
});
