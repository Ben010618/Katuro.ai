import { describe, it, expect, vi, beforeEach } from 'vitest';
import ExcelJS from 'exceljs';
import * as XLSX from 'xlsx';
import { callGeminiProxy } from '../../geminiConfig';
import { runDeskAgentTurn, clearAnswerMemory } from './deskAgent';
import { resetTaskActionSupport } from './llm';
import { createVirtualWorkspace, readFileBytes, flattenFileTree } from '../../localFileSystem';

vi.mock('../../geminiConfig', () => ({ callGeminiProxy: vi.fn() }));

const LEARNERS = ['1. Jose Miguel Dela Cruz', '2. Maria Angelica Santos', '3. Rafael Antonio Bautista', '4. Kristine Joy Villanueva', '5. Emmanuel Reyes'];
const xlsx = (rows) => {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'Sheet1');
  return new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }));
};
// The teacher's own table (like conso.xlsx), with a stray "`" typed in one empty cell.
const conso = () => xlsx([['STUDENT', 'AP ', 'FILIPINO', 'MATH', 'SCIENCE', 'Average'], ...LEARNERS.map((n, i) => [n, null, i === 3 ? '`' : null, null, null, null])]);
const subject = (grades) => xlsx([['STUDENT', 'Grade '], ...LEARNERS.map((n, i) => [n, grades[i]])]);
const GRADES = {
  AP: [88, 90, 88, 77, 89],
  Filipino: [85, 92, 80, 79, 90],
  Math: [97, 89, 89, 89, 76],
  Science: [90, 88, 84, 81, 78],
};

async function setup(extra = {}) {
  const ws = createVirtualWorkspace('Testing');
  ws.handle.saveVirtualFile('conso.xlsx', conso());
  for (const [s, g] of Object.entries(GRADES)) ws.handle.saveVirtualFile(`${s}_Term1.xlsx`, subject(g));
  for (const [p, b] of Object.entries(extra)) ws.handle.saveVirtualFile(p, b);
  ws.files = ws.handle.getFiles();
  return ws;
}
const plan = (args, reply = 'Sige po, pupunan ko ang conso.') => callGeminiProxy.mockImplementation(async () => ({
  text: JSON.stringify({ confidence: 'high', reply, tasks: [{ id: 't1', tool: 'fill_table_from_files', args }] }),
}));
const SOURCES = ['AP_Term1.xlsx', 'Filipino_Term1.xlsx', 'Math_Term1.xlsx', 'Science_Term1.xlsx'];

describe('fill the teacher\'s own table from several files ("edit and complete my conso")', () => {
  beforeEach(() => {
    resetTaskActionSupport();
    clearAnswerMemory();
    callGeminiProxy.mockReset();
  });

  it('fills one column per subject file by learner name, adds =AVERAGE, keeps the original, sends no grades to the AI', async () => {
    const ws = await setup();
    const aiTexts = [];
    callGeminiProxy.mockImplementation(async (req) => {
      aiTexts.push(JSON.stringify(req.contents));
      return { text: JSON.stringify({ confidence: 'high', reply: 'Sige po.', tasks: [{ id: 't1', tool: 'fill_table_from_files', args: { targetPath: 'conso.xlsx', sourcePaths: SOURCES } }] }) };
    });
    const res = await runDeskAgentTurn({
      prompt: 'Can you edit and complete the Excel file conso and extract all of the needed data from AP, Filipino, Math, Science, Term 1 Excel files?',
      workspace: ws, user: { uid: 'u1' }, profile: { fullName: 'Ben Cruz' }, autoApprove: true,
    });
    expect(aiTexts).toHaveLength(1); // the planner only
    for (const g of ['Jose Miguel Dela Cruz', '97']) expect(aiTexts[0]).not.toContain(g);
    expect(res.content).toMatch(/Filled your conso\.xlsx from 4 file\(s\)/);
    expect(res.content).toMatch(/replaced stray symbols in C5 \("`"\)/);
    expect(res.content).toMatch(/plain average/);

    const out = res.createdFiles.find((f) => f.format === 'xlsx');
    expect(out.name).toBe('conso (KaTuro edit).xlsx');
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await readFileBytes(ws.handle, out.path));
    const sh = wb.worksheets[0];
    const row = (r) => [2, 3, 4, 5].map((c) => sh.getRow(r).getCell(c).value);
    expect(row(2)).toEqual([88, 85, 97, 90]);
    expect(row(5)).toEqual([77, 79, 89, 81]);          // the "`" cell got the Filipino grade
    expect(sh.getCell('F2').value).toMatchObject({ formula: 'AVERAGE(B2,C2,D2,E2)', result: 90 });
    expect(sh.getCell('A1').value).toBe('STUDENT');     // headers untouched

    // The teacher's original conso.xlsx is unchanged.
    const orig = new ExcelJS.Workbook();
    await orig.xlsx.load(await readFileBytes(ws.handle, 'conso.xlsx'));
    expect(orig.worksheets[0].getCell('B2').value ?? null).toBeNull();
    expect(flattenFileTree(ws.handle.getFiles()).some((f) => f.path.startsWith('KaTuro Backups/'))).toBe(true);
  });

  it('asks instead of guessing when a file does not name a subject in the table', async () => {
    const ws = await setup({ 'Quarter_scores.xlsx': subject([1, 2, 3, 4, 5]) });
    plan({ targetPath: 'conso.xlsx', sourcePaths: [...SOURCES, 'Quarter_scores.xlsx'] });
    const res = await runDeskAgentTurn({ prompt: 'complete my conso from these files', workspace: ws, user: { uid: 'u1' }, autoApprove: true });
    expect(res.content).toMatch(/Needs your input.*could not tell which column of conso\.xlsx Quarter_scores\.xlsx belongs to.*AP \(column B\), FILIPINO \(column C\), MATH \(column D\), SCIENCE \(column E\)/);
    expect(res.createdFiles).toHaveLength(0);
  });

  it('the teacher can say which file goes to which column', async () => {
    const ws = await setup({ 'Araling.xlsx': subject([70, 71, 72, 73, 74]) });
    plan({ targetPath: 'conso.xlsx', sourcePaths: ['Araling.xlsx'], columnFor: { 'Araling.xlsx': 'AP' } });
    const res = await runDeskAgentTurn({ prompt: 'Araling.xlsx goes to AP', workspace: ws, user: { uid: 'u1' }, autoApprove: true });
    expect(res.content).toMatch(/AP ← Araling\.xlsx: 5 filled/);
    expect(res.content).toMatch(/no file was given for FILIPINO, MATH, SCIENCE/);
  });

  it('never overwrites a value the teacher already typed', async () => {
    const filled = xlsx([['STUDENT', 'AP', 'MATH'], [LEARNERS[0], 99, null], [LEARNERS[1], null, null]]);
    const ws = await setup({ 'mine.xlsx': filled });
    plan({ targetPath: 'mine.xlsx', sourcePaths: ['AP_Term1.xlsx'] });
    const res = await runDeskAgentTurn({ prompt: 'fill mine.xlsx', workspace: ws, user: { uid: 'u1' }, autoApprove: true });
    expect(res.content).toMatch(/1 cell\(s\) already had a value and were kept \(B2\)/);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await readFileBytes(ws.handle, res.createdFiles[0].path));
    expect(wb.worksheets[0].getCell('B2').value).toBe(99);
    expect(wb.worksheets[0].getCell('B3').value).toBe(90);
  });
});
