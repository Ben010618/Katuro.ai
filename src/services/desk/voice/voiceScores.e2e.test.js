import { describe, it, expect, vi, beforeEach } from 'vitest';
import ExcelJS from 'exceljs';
import { callGeminiProxy } from '../../geminiConfig';
import { runDeskAgentTurn } from '../agent/deskAgent';
import { resetTaskActionSupport } from '../agent/llm';
import { createVirtualWorkspace, readFileBytes } from '../../localFileSystem';
import { useDeskStore } from '../../../store/deskStore';
import { transcribeAudio } from './voiceInput';
import {
  NAMED_SCORES_PROMPT, LIST_SCORES_PROMPT, checkVoiceReply, parseNamedScores, parseListScores,
  emptySession, addNamedEntries, addListValues, resolveIssue, setCursor, buildScorePlan, scoreChangesArtifact,
} from './voiceScores';

vi.mock('../../geminiConfig', () => ({ callGeminiProxy: vi.fn() }));

const NAMES = ['Alvarez, Juan P.', 'Cruz, Pedro', 'De la Cruz, Maria', 'Santos, Mark', 'Santos, John'];

/** A teacher's own class record: styled header, WW columns, a total formula, one score already in. */
async function classRecord() {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('TERM1');
  ws.getCell('A1').value = 'GRADE 7 - RIZAL  |  MATHEMATICS';
  ['No.', "LEARNER'S NAME", 'WW1', 'WW2', 'TOTAL'].forEach((h, i) => {
    const c = ws.getCell(3, i + 1);
    c.value = h;
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE4D5AC' } };
  });
  ['', 'HIGHEST POSSIBLE SCORE', 20, 20].forEach((v, i) => { if (v !== '') ws.getCell(4, i + 1).value = v; });
  NAMES.forEach((n, i) => {
    const r = 5 + i;
    ws.getCell(r, 1).value = i + 1;
    ws.getCell(r, 2).value = n;
    ws.getCell(r, 5).value = { formula: `SUM(C${r}:D${r})`, result: 0 };
    ws.getCell(r, 4).border = { left: { style: 'thin' }, right: { style: 'thin' } };
  });
  ws.getCell('D8').value = 9; // Mark Santos already has a WW2 score
  return new Uint8Array(await wb.xlsx.writeBuffer());
}

const LAYOUT = {
  docType: 'class_record', title: 'Grade 7 Rizal', confidence: 0.9, fields: [],
  tables: [{
    id: 'cr', purpose: 'class_record', location: { sheet: 'TERM1', firstRow: 5, lastRow: 9 }, nameColumn: 'B',
    columns: [
      { key: 'name', column: 'B', header: "LEARNER'S NAME", meaning: 'learner_name' },
      { key: 'ww1', column: 'C', header: 'WW1', meaning: 'score', component: 'WW', item: 1, max: 20 },
      { key: 'ww2', column: 'D', header: 'WW2', meaning: 'score', component: 'WW', item: 2, max: 20 },
      { key: 'total', column: 'E', header: 'TOTAL', meaning: 'total' },
    ],
  }],
};

const voiceCalls = [];
let nextTranscript = '';

beforeEach(() => {
  resetTaskActionSupport();
  callGeminiProxy.mockReset();
  voiceCalls.length = 0;
  callGeminiProxy.mockImplementation(async (req) => {
    if (req.action === 'desk_voice') {
      voiceCalls.push(req);
      return { text: nextTranscript };
    }
    if (JSON.stringify(req.contents).includes('Document map')) return { text: JSON.stringify(LAYOUT) };
    throw new Error(`unexpected AI call: ${JSON.stringify(req.contents).slice(0, 200)}`);
  });
});

const speak = async (transcript, prompt) => {
  nextTranscript = transcript;
  return transcribeAudio(new Uint8Array([82, 73, 70, 70]), { prompt, clean: checkVoiceReply });
};

describe('end to end: spoken scores → the teacher\'s own class record', () => {
  it('opens the panel, matches what was said, asks when unsure, and writes only approved cells', async () => {
    const workspace = createVirtualWorkspace('X');
    const original = await classRecord();
    workspace.handle.saveVirtualFile('Records/G7 Rizal.xlsx', original);
    workspace.files = workspace.handle.getFiles();

    // 1. "Encode scores by voice into column D" → panel (quick route, no planner call).
    const res = await runDeskAgentTurn({ prompt: 'Encode scores by voice into column D', workspace, attachedPaths: ['Records/G7 Rizal.xlsx'], user: { uid: 'u1' } });
    const panel = res.artifacts.find((a) => a.type === 'voice_scores');
    expect(panel, res.content).toBeTruthy();
    expect(panel.data.columns.map((c) => c.header)).toEqual(['WW1', 'WW2']); // never TOTAL
    expect(panel.data.columnKey).toBe('ww2');
    expect(panel.data.learners.map((l) => l.name)).toEqual(NAMES);
    const column = panel.data.columns.find((c) => c.key === 'ww2');
    expect(column.max).toBe(20);

    // 2. The teacher reads scores aloud (named mode), in two clips.
    let session = emptySession();
    session = addNamedEntries(session, parseNamedScores(await speak('Alvarez = 18\nCruz = absent\nSantos = 15\nDe la Cruz = 25', NAMED_SCORES_PROMPT)), panel.data.learners);
    session = addNamedEntries(session, parseNamedScores(await speak('De la Cruz = 16\nMark Santos = 17', NAMED_SCORES_PROMPT)), panel.data.learners);

    // Learner names never go to the AI with the audio: only the fixed prompt + the clip.
    for (const call of voiceCalls) {
      const text = JSON.stringify(call.contents);
      for (const n of NAMES) expect(text.toLowerCase()).not.toContain(n.split(',')[0].toLowerCase());
      expect(call.contents[0].parts[1].inlineData.mimeType).toBe('audio/wav');
    }

    // "Santos" fits two learners → a question, not a guess. De la Cruz corrected 25 → 16.
    expect(session.issues).toMatchObject([{ kind: 'ambiguous', heard: 'Santos', value: 15, candidates: [3, 4] }]);
    expect(session.assignments[2]).toMatchObject({ value: 16, replaced: 25 });

    // Not reviewable yet: an open question and no choice for absent learners.
    const blocked = buildScorePlan({ learners: panel.data.learners, column, kind: panel.data.kind, session, maxScore: 20 });
    expect(blocked.ok).toBe(false);

    // 3. The teacher answers: that "Santos" was John; absent = leave blank.
    session = resolveIssue(session, session.issues[0].id, 4);
    const ready = buildScorePlan({ learners: panel.data.learners, column, kind: panel.data.kind, session, maxScore: 20, absentAs: 'blank' });
    expect(ready.ok).toBe(true);
    expect(ready.plan.edits).toEqual([
      { sheet: 'TERM1', cell: 'D5', value: 18 },
      { sheet: 'TERM1', cell: 'D7', value: 16 },
      { sheet: 'TERM1', cell: 'D9', value: 15 },
    ]);
    // Mark Santos already had 9 in the file: kept, shown as a conflict.
    expect(ready.plan.conflicts).toMatchObject([{ targetName: 'Santos, Mark', before: 9, after: 17 }]);

    // 4. Review → Apply (the same approval path as every other file change).
    const changes = scoreChangesArtifact(ready.plan, { targetPath: panel.data.targetPath, kind: panel.data.kind, columnLabel: 'WW2' });
    useDeskStore.setState({ workspace, artifacts: [changes], activeArtifact: changes });
    const saved = await useDeskStore.getState().applyPendingChanges(changes.id);
    expect(saved.path).toBe('Records/G7 Rizal (KaTuro edit).xlsx');

    // Original untouched; working copy has exactly the approved scores, styles and formulas intact.
    expect(Array.from(await readFileBytes(workspace.handle, 'Records/G7 Rizal.xlsx'))).toEqual(Array.from(original));
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await readFileBytes(workspace.handle, saved.path));
    const ws = wb.getWorksheet('TERM1');
    expect(['D5', 'D6', 'D7', 'D8', 'D9'].map((a) => ws.getCell(a).value)).toEqual([18, null, 16, 9, 15]);
    expect(ws.getCell('E5').formula).toBe('SUM(C5:D5)');
    expect(ws.getCell('C3').fill?.fgColor?.argb).toBe('FFE4D5AC');
    expect(ws.getCell('D5').border?.left?.style).toBe('thin');

    // 5. Next week: WW1 by voice for the same file. KaTuro continues in the working copy,
    //    so the WW2 scores applied above are kept (the original still untouched).
    workspace.files = workspace.handle.getFiles();
    const res2 = await runDeskAgentTurn({ prompt: 'Encode scores by voice into column C', workspace, attachedPaths: ['Records/G7 Rizal.xlsx'], user: { uid: 'u1' } });
    const panel2 = res2.artifacts.find((a) => a.type === 'voice_scores');
    expect(panel2.data.targetPath).toBe('Records/G7 Rizal (KaTuro edit).xlsx');
    expect(panel2.data.continuedFrom).toBe('Records/G7 Rizal.xlsx');
    expect(res2.content).toMatch(/continuing in your working copy/i);
    const ww1 = panel2.data.columns.find((c) => c.key === 'ww1');
    const s2 = addNamedEntries(emptySession(), parseNamedScores(await speak('Cruz = 11', NAMED_SCORES_PROMPT)), panel2.data.learners);
    const plan2 = buildScorePlan({ learners: panel2.data.learners, column: ww1, kind: panel2.data.kind, session: s2, maxScore: 20 });
    const changes2 = scoreChangesArtifact(plan2.plan, { targetPath: panel2.data.targetPath, kind: panel2.data.kind, columnLabel: 'WW1', now: Date.now() + 1 });
    useDeskStore.setState({ workspace, artifacts: [changes2], activeArtifact: changes2 });
    const saved2 = await useDeskStore.getState().applyPendingChanges(changes2.id);
    expect(saved2.path).toBe('Records/G7 Rizal (KaTuro edit).xlsx');
    const wb2 = new ExcelJS.Workbook();
    await wb2.xlsx.load(await readFileBytes(workspace.handle, saved2.path));
    const ws2 = wb2.getWorksheet('TERM1');
    expect(ws2.getCell('C6').value).toBe(11); // new WW1 score
    expect(['D5', 'D7', 'D9'].map((a) => ws2.getCell(a).value)).toEqual([18, 16, 15]); // WW2 from before: kept
    expect(Array.from(await readFileBytes(workspace.handle, 'Records/G7 Rizal.xlsx'))).toEqual(Array.from(original));
  });

  it('list mode: scores fill in order from the chosen learner; non-English is refused', async () => {
    const learners = NAMES.map((name, i) => ({ name, values: { ww1: null }, cells: { ww1: { sheet: 'TERM1', cell: `C${5 + i}` } } }));
    let session = setCursor(emptySession(), 1);
    session = addListValues(session, parseListScores(await speak('12\nskip\n19\nabsent', LIST_SCORES_PROMPT)), learners);
    expect(session.assignments).toMatchObject({ 1: { value: 12 }, 3: { value: 19 }, 4: { value: 'absent' } });
    const r = buildScorePlan({ learners, column: { key: 'ww1', header: 'WW1' }, kind: 'xlsx', session, maxScore: 20, absentAs: 'zero' });
    expect(r.plan.edits).toEqual([{ sheet: 'TERM1', cell: 'C6', value: 12 }, { sheet: 'TERM1', cell: 'C8', value: 19 }, { sheet: 'TERM1', cell: 'C9', value: 0 }]);

    await expect(speak('[not english]', LIST_SCORES_PROMPT)).rejects.toThrow(/English only/);
  });
});
