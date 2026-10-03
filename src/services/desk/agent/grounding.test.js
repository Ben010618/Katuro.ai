import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as XLSX from 'xlsx';
import { verifySpec, extractCodes, GROUNDING_RULES } from './grounding';
import { callGeminiProxy } from '../../geminiConfig';
import { runDeskAgentTurn, personaFor, docPersonaFor, clearAnswerMemory } from './deskAgent';
import { resetTaskActionSupport } from './llm';
import { createVirtualWorkspace } from '../../localFileSystem';

vi.mock('../../geminiConfig', () => ({ callGeminiProxy: vi.fn() }));

beforeEach(() => {
  resetTaskActionSupport();
  clearAnswerMemory();
  callGeminiProxy.mockReset();
});

describe('verifySpec — AI output is checked against its sources', () => {
  const spec = {
    title: 'DLL',
    blocks: [
      { type: 'paragraph', text: 'Competency (S7LT-IIa-1): Identify cell parts. Also M7NS-Ia-1 basics.' },
      { type: 'table', columns: ['Code', 'Competency'], rows: [['SCI7-Q1-01', 'Real one'], ['ZZ9-Q9-99', 'Invented']] },
    ],
  };

  it('keeps codes found in the official list / files and removes unverifiable ones (with a warning)', () => {
    const { spec: out, warnings } = verifySpec(spec, { allowedText: 'Official list: [S7LT-IIa-1] Identify parts. [SCI7-Q1-01] Cells.' });
    const text = JSON.stringify(out);
    expect(text).toContain('S7LT-IIa-1');
    expect(text).toContain('SCI7-Q1-01');
    expect(text).not.toContain('M7NS-Ia-1');
    expect(text).not.toContain('ZZ9-Q9-99');
    expect(warnings[0]).toMatch(/M7NS-Ia-1, ZZ9-Q9-99/);
  });

  it('flags learner names that are not in the files (only when a class list is involved)', () => {
    const doc = { title: 'x', blocks: [{ type: 'paragraph', text: 'Dela Cruz, Juan and Ramos, Pedro need help. Monday, Tuesday review.' }] };
    expect(verifySpec(doc, { knownNames: ['Dela Cruz, Juan'] }).warnings.join(' ')).toMatch(/Ramos, Pedro/);
    expect(verifySpec(doc, { knownNames: ['Dela Cruz, Juan'] }).warnings.join(' ')).not.toMatch(/Monday/);
    expect(verifySpec(doc, { knownNames: [] }).warnings).toEqual([]);
  });

  it('never mistakes ordinary text for codes', () => {
    expect(extractCodes('A4-size paper, Q1-01, COVID-19, SY 2026-2027, DO 8')).toEqual([]);
  });

  it('puts the accuracy rules into every chat and document prompt', () => {
    expect(personaFor({ salutation: 'Sir Ben' }, 'matt')).toContain(GROUNDING_RULES);
    expect(docPersonaFor({ salutation: 'Sir Ben' })).toContain(GROUNDING_RULES);
  });
});

function sheetBytes(rows) {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'Rizal');
  return new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }));
}

async function turnWithTask(task, file) {
  const ws = createVirtualWorkspace('X');
  ws.handle.saveVirtualFile('Scores/s.xlsx', sheetBytes(file));
  ws.files = ws.handle.getFiles();
  callGeminiProxy.mockResolvedValueOnce({ text: JSON.stringify({ reply: 'On it.', tasks: [{ id: 't1', ...task }] }) });
  return runDeskAgentTurn({ prompt: 'please do it', workspace: ws, user: { uid: 'u1' } });
}

describe('tools ask instead of assuming', () => {
  const totalsOnly = [['Name of Learners', 'Score'], ['Dela Cruz, Juan', 12], ['Santos, Maria', 15], ['Reyes, Pedro', 9]];

  it('item analysis: asks for the number of items instead of using the top score', async () => {
    const res = await turnWithTask({ tool: 'analyze_scores', args: { path: 'Scores/s.xlsx' } }, totalsOnly);
    expect(res.content).toMatch(/Needs your input.*How many items\?/);
    expect(res.createdFiles).toHaveLength(0);
  });

  it('item analysis: uses a total the teacher stated, and refuses impossible scores', async () => {
    callGeminiProxy.mockResolvedValue({ text: JSON.stringify({ remarks: [], interventions: [] }) });
    const ok = await turnWithTask({ tool: 'analyze_scores', args: { path: 'Scores/s.xlsx', totalItems: 20 } }, totalsOnly);
    expect(ok.createdFiles.length).toBeGreaterThan(0);
    const bad = await turnWithTask({ tool: 'analyze_scores', args: { path: 'Scores/s.xlsx', totalItems: 10 } }, totalsOnly);
    expect(bad.content).toMatch(/Needs your input.*scored above 10/);
  });

  it('class record: asks for the learning area instead of guessing DO 8 weights', async () => {
    const res = await turnWithTask({ tool: 'make_class_record', args: { path: 'Scores/s.xlsx' } }, totalsOnly);
    expect(res.content).toMatch(/Needs your input.*Which learning area/);
  });

  it('class record: asks which component a single score column is', async () => {
    const res = await turnWithTask({ tool: 'make_class_record', args: { path: 'Scores/s.xlsx', subject: 'Mathematics' } }, totalsOnly);
    expect(res.content).toMatch(/Needs your input.*Which component are they/);
  });

  it('class record: asks for missing HPS instead of estimating it from scores', async () => {
    // A real e-Class Record layout whose HPS row was left out.
    const ecrNoHps = [
      ["LEARNERS' NAMES", 'WRITTEN WORKS (40%)', null, null, null, null, 'PERFORMANCE TASKS (40%)', null, null, null, null, 'QUARTERLY ASSESSMENT (20%)', null, null],
      [null, 1, 2, 3, 'Total', 'WS', 1, 2, 3, 'Total', 'WS', 1, 'PS', 'WS'],
      ['MALE'],
      ['Dela Cruz, Juan', 8, 15, 12, 35, null, 18, 25, 40, 83, null, 40],
      ['Reyes, Mark', 9, null, 10, 19, null, 15, 20, 30, 65, null, 35],
      ['FEMALE'],
      ['Santos, Maria', 10, 19, 14, 43, null, 20, 28, 48, 96, null, 47],
    ];
    const res = await turnWithTask({ tool: 'make_class_record', args: { path: 'Scores/s.xlsx', subject: 'Mathematics' } }, ecrNoHps);
    expect(res.content).toMatch(/Needs your input.*highest possible scores \(HPS\)/);
    expect(res.createdFiles).toHaveLength(0);
  });

  it('class record: maps scores by learner name even when some scores are blank', async () => {
    const withBlank = [['Name of Learners', 'Score'], ['Dela Cruz, Juan', 12], ['Santos, Maria', null], ['Reyes, Pedro', 9]];
    const res = await turnWithTask({ tool: 'make_class_record', args: { path: 'Scores/s.xlsx', subject: 'Mathematics', component: 'ww', hps: 20 } }, withBlank);
    const rows = res.artifacts[0].spec.blocks.find((b) => b.type === 'table').rows;
    const reyes = rows.find((r) => r.some((c) => String(c).includes('Reyes')));
    const santos = rows.find((r) => r.some((c) => String(c).includes('Santos')));
    expect(reyes.join(' ')).toContain('45'); // 9/20 = 45% WW → Reyes keeps HIS score
    expect(santos.join(' ')).not.toContain('45');
  });
});
