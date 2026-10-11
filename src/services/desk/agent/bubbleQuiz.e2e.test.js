import { describe, it, expect, vi, beforeEach } from 'vitest';
import ExcelJS from 'exceljs';
import { callGeminiProxy } from '../../geminiConfig';
import { runDeskAgentTurn } from './deskAgent';
import { resetTaskActionSupport } from './llm';
import { createVirtualWorkspace, readFileBytes } from '../../localFileSystem';
import { useDeskStore } from '../../../store/deskStore';
import { buildScorePlan, scoreChangesArtifact } from '../voice/voiceScores';
import { newQuiz, quizFolder, QUIZ_FILE, CHECK_FILE } from '../bubble/quiz';

vi.mock('../../geminiConfig', () => ({ callGeminiProxy: vi.fn() }));

async function xlsx(rows) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Sheet1');
  rows.forEach((r, i) => r.forEach((v, j) => { ws.getCell(i + 1, j + 1).value = v; }));
  return new Uint8Array(await wb.xlsx.writeBuffer());
}

const LIST_LAYOUT = {
  docType: 'masterlist', title: 'Class list', confidence: 0.9, fields: [],
  tables: [{
    id: 'l', purpose: 'masterlist', location: { sheet: 'Sheet1', firstRow: 2, lastRow: 4 }, nameColumn: 'C',
    columns: [{ key: 'no', column: 'A', header: 'No.', meaning: 'other' }, { key: 'lrn', column: 'B', header: 'LRN', meaning: 'lrn' }, { key: 'name', column: 'C', header: 'Name', meaning: 'learner_name' }],
  }],
};
const RECORD_LAYOUT = {
  docType: 'class_record', title: 'Class record', confidence: 0.9, fields: [],
  tables: [{
    id: 'r', purpose: 'class_record', location: { sheet: 'Sheet1', firstRow: 2, lastRow: 5 }, nameColumn: 'A',
    columns: [{ key: 'name', column: 'A', header: 'Learner', meaning: 'learner_name' }, { key: 'lrn', column: 'B', header: 'LRN', meaning: 'lrn' }, { key: 'ww1', column: 'C', header: 'WW1', meaning: 'score', max: 5 }, { key: 'ww2', column: 'D', header: 'WW2', meaning: 'score' }],
  }],
};

beforeEach(() => {
  resetTaskActionSupport();
  callGeminiProxy.mockReset();
});

const run = (workspace, tool, args) => runDeskAgentTurn({
  prompt: 'bubble quiz', workspace, user: { uid: 'u1' }, autoApprove: true,
  confirmedPlan: { reply: '', tasks: [{ id: 't1', tool, args, label: tool }] },
});

describe('bubble quiz tools', () => {
  it('reads the names and LRNs from the class list for the sheets', async () => {
    const workspace = createVirtualWorkspace('X');
    workspace.handle.saveVirtualFile('G7/Class List.xlsx', await xlsx([['No.', 'LRN', 'Name'], [1, '100000000001', 'Learner One'], [2, '', 'Learner Two'], [3, '100000000003', 'Learner Three']]));
    workspace.files = workspace.handle.getFiles();
    callGeminiProxy.mockImplementation(async () => ({ text: JSON.stringify(LIST_LAYOUT) }));
    const res = await run(workspace, 'bubble_quiz', { listPath: 'G7/Class List.xlsx', items: 20 });
    const art = res.artifacts.find((a) => a.type === 'bubble_quiz');
    expect(art, res.content).toBeTruthy();
    expect(art.data.learners).toEqual([
      { name: 'Learner One', lrn: '100000000001', include: true },
      { name: 'Learner Two', lrn: '', include: true },
      { name: 'Learner Three', lrn: '100000000003', include: true },
    ]);
    expect(art.data.setup).toMatchObject({ items: 20, choices: 4, paper: 'a4', perPage: 4 });
    expect(res.content).toMatch(/3 learners found/);
  });

  it('records the checked scores into the class record: LRN first, then name; questions for the rest; nothing written before Apply', async () => {
    const workspace = createVirtualWorkspace('X');
    const quiz = newQuiz({
      title: 'Quiz 1', items: 5, choices: 4, paper: 'a4', perPage: 4,
      learners: [{ name: 'Learner One', lrn: '100000000001' }, { name: 'Learner Two', lrn: '' }, { name: 'Transferee Five', lrn: '100000000005' }, { name: 'Learner Three', lrn: '100000000003' }, { name: 'Zamora, Extra', lrn: '100000000009' }],
    }, { random: () => 0.3 }).quiz;
    const folder = quizFolder(quiz);
    const ans = (s) => Object.fromEntries([...s].map((c, i) => [i + 1, c]));
    const check = {
      answerKey: ['A', 'B', 'C', 'D', 'A'],
      sheets: {
        [`${folder}/Photos/p1.jpg`]: { ok: true, number: 1, answers: ans('ABCDA'), notes: {} },
        [`${folder}/Photos/p2.jpg`]: { ok: true, number: 2, answers: ans('ABCD?'), notes: { 5: 'two marks' } },
        [`${folder}/Photos/p3.jpg`]: { ok: true, number: 4, answers: ans('BBCDA'), notes: {} },
        [`${folder}/Photos/p5.jpg`]: { ok: true, number: 5, answers: ans('AACCA'), notes: {} },
        [`${folder}/Photos/gone.jpg`]: { ok: true, number: 3, answers: ans('ABCDA'), notes: {} },
      },
      decisions: { [`${folder}/Photos/p2.jpg`]: { answers: { 5: 'B' } } },
    };
    workspace.handle.saveVirtualFile(`${folder}/${QUIZ_FILE}`, JSON.stringify(quiz));
    workspace.handle.saveVirtualFile(`${folder}/${CHECK_FILE}`, JSON.stringify(check));
    for (const p of ['p1', 'p2', 'p3', 'p5']) workspace.handle.saveVirtualFile(`${folder}/Photos/${p}.jpg`, new Uint8Array([0xff, 0xd8, 0xff]));
    // The class record lists learners in another order; one has no LRN in the quiz.
    const record = await xlsx([['Learner', 'LRN', 'WW1', 'WW2'], ['Learner Three', '100000000003', null, 7], ['Learner One', '100000000001', null, 8], ['Learner Two', '100000000002', null, null], ['Learner Six', '100000000006', null, null]]);
    workspace.handle.saveVirtualFile('Records/G7 Class Record.xlsx', record);
    workspace.files = workspace.handle.getFiles();
    callGeminiProxy.mockImplementation(async () => ({ text: JSON.stringify(RECORD_LAYOUT) }));

    const res = await run(workspace, 'record_quiz_scores', { quizPath: `${folder}/${QUIZ_FILE}`, targetPath: 'Records/G7 Class Record.xlsx' });
    const art = res.artifacts.find((a) => a.type === 'voice_scores');
    expect(art, res.content).toBeTruthy();
    expect(art.data.fromQuiz).toEqual({ title: 'Quiz 1', items: 5 });
    expect(art.data.maxScore).toBe('5');
    // Learner Three (row 1) by LRN: 4; Learner One (row 2) by LRN: 5; Learner Two (row 3) by name
    // (the item the teacher settled as B is wrong): 4. The deleted photo (Transferee Five) does not count.
    expect(Object.fromEntries(Object.entries(art.data.session.assignments).map(([i, a]) => [i, a.value]))).toEqual({ 0: 4, 1: 5, 2: 4 });
    // A learner who is not in the class record is a question, never a guess.
    expect(art.data.session.issues).toEqual([{ id: 1, kind: 'unknown', heard: 'Zamora, Extra', value: 3, candidates: [] }]);
    expect(res.content).toMatch(/3 of 4 scores matched/);
    expect(res.content).toMatch(/1 need your choice/);
    expect(res.content).toMatch(/1 learner\(s\) without a sheet are left blank/);

    // Teacher picks WW1 and applies: only WW1 cells change, in a working copy.
    const session = { ...art.data.session, issues: [] }; // the teacher dismisses the question
    const result = buildScorePlan({ learners: art.data.learners, column: art.data.columns.find((c) => c.key === 'ww1'), kind: art.data.kind, session, maxScore: 5 });
    expect(result.ok).toBe(true);
    const changes = { ...scoreChangesArtifact(result.plan, { targetPath: art.data.targetPath, kind: art.data.kind, columnLabel: 'WW1' }), id: 'c1' };
    useDeskStore.setState({ workspace, artifacts: [changes], activeArtifact: null });
    const saved = await useDeskStore.getState().applyPendingChanges('c1');
    expect(saved.path).toBe('Records/G7 Class Record (KaTuro edit).xlsx');
    expect(Array.from(await readFileBytes(workspace.handle, 'Records/G7 Class Record.xlsx'))).toEqual(Array.from(record));
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await readFileBytes(workspace.handle, saved.path));
    const ws = wb.getWorksheet('Sheet1');
    expect([2, 3, 4, 5].map((r) => [ws.getCell(`C${r}`).value, ws.getCell(`D${r}`).value])).toEqual([[4, 7], [5, 8], [4, null], [null, null]]);
  });

  it('refuses to record while something on the photos is still unclear', async () => {
    const workspace = createVirtualWorkspace('X');
    const quiz = newQuiz({ title: 'Quiz 2', items: 2, choices: 4, paper: 'a4', perPage: 4, learners: [{ name: 'Learner One', lrn: '' }] }).quiz;
    const folder = quizFolder(quiz);
    workspace.handle.saveVirtualFile(`${folder}/${QUIZ_FILE}`, JSON.stringify(quiz));
    workspace.handle.saveVirtualFile(`${folder}/${CHECK_FILE}`, JSON.stringify({ answerKey: ['A', 'B'], sheets: { [`${folder}/Photos/a.jpg`]: { ok: true, number: 1, answers: { 1: 'A', 2: '?' }, notes: { 2: 'light mark' } } }, decisions: {} }));
    workspace.handle.saveVirtualFile(`${folder}/Photos/a.jpg`, new Uint8Array([0xff, 0xd8, 0xff]));
    workspace.handle.saveVirtualFile('cr.xlsx', await xlsx([['Learner', 'WW1'], ['Learner One', null]]));
    workspace.files = workspace.handle.getFiles();
    const res = await run(workspace, 'record_quiz_scores', { quizPath: `${folder}/${QUIZ_FILE}`, targetPath: 'cr.xlsx' });
    expect(res.artifacts.filter((a) => a.type === 'voice_scores')).toHaveLength(0);
    expect(res.content).toMatch(/still need your decision/);
    expect(callGeminiProxy).not.toHaveBeenCalled();
  });
});
