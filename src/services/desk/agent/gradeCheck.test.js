import { describe, it, expect, vi, beforeEach } from 'vitest';
import ExcelJS from 'exceljs';
import { callGeminiProxy } from '../../geminiConfig';
import { runDeskAgentTurn, clearAnswerMemory } from './deskAgent';
import { resetTaskActionSupport } from './llm';
import { createVirtualWorkspace, readFileBytes } from '../../localFileSystem';
import { checkGradeFiles, cellsFromExcelJs, formulaRefs } from './gradeCheck';

vi.mock('../../geminiConfig', () => ({ callGeminiProxy: vi.fn() }));

/** rows: arrays of plain values or { formula, result } cells. */
async function workbookBytes(rows, name = 'Sheet1') {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(name);
  rows.forEach((row) => ws.addRow(row));
  return new Uint8Array(await wb.xlsx.writeBuffer());
}
async function asFile(name, rows) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await workbookBytes(rows));
  return { name, sheets: wb.worksheets.map((ws) => ({ name: ws.name, cells: cellsFromExcelJs(ws) })) };
}
const find = (issues, type, cell) => issues.find((i) => i.type === type && (!cell || i.cell === cell));

describe('grade-sheet error checker', () => {
  it('a clean sheet has no problems', async () => {
    const f = await asFile('conso.xlsx', [
      ['STUDENT', 'AP', 'FILIPINO', 'MATH', 'Average'],
      ['1. Jose Miguel Dela Cruz', 88, 85, 97, { formula: 'AVERAGE(B2,C2,D2)', result: 90 }],
      ['2. Maria Angelica Santos', 90, 92, 89, { formula: 'AVERAGE(B3,C3,D3)', result: 90.33 }],
      ['3. Rafael Antonio Bautista', 88, 80, 89, 85.67],
    ]);
    expect(checkGradeFiles([f]).issues).toEqual([]);
  });

  it('finds missing grades, stray symbols, out-of-range and below-60 grades', async () => {
    const f = await asFile('conso.xlsx', [
      ['STUDENT', 'AP', 'FILIPINO', 'MATH'],
      ['Jose Miguel Dela Cruz', 88, null, 97],
      ['Maria Angelica Santos', 90, '`', 105],
      ['Rafael Antonio Bautista', 55, 80, 89],
      ['Kristine Joy Villanueva', 77, 79, 89],
    ]);
    const { issues } = checkGradeFiles([f]);
    expect(find(issues, 'Missing grade', 'C2')).toMatchObject({ severity: 'error', learner: 'Jose Miguel Dela Cruz' });
    expect(find(issues, 'Not a number', 'C3').detail).toMatch(/"`" instead of a number/);
    expect(find(issues, 'Out of range', 'D3').detail).toMatch(/105 \(grades are 0 to 100\)/);
    expect(find(issues, 'Below 60', 'B4')).toMatchObject({ severity: 'warning' });
    expect(find(issues, 'Below 60', 'B4').detail).toMatch(/DO 15, s\. 2026, Annex D para 18/);
    expect(issues.filter((i) => i.severity === 'error')).toHaveLength(3);
  });

  it('totals and averages that do not add up (typed by hand, or a stale formula result)', async () => {
    const f = await asFile('record.xlsx', [
      ["LEARNER'S NAME", 'WW1', 'WW2', 'WW3', 'Total', 'Grade', 'Average'],
      ['HIGHEST POSSIBLE SCORE', 10, 10, 10, 30, null, null],
      ['Jose Dela Cruz', 9, 8, 10, 27, 90, 90],
      ['Ana Reyes', 7, 12, 6, 24, 80, 80],                           // 12 > HPS 10; 7+12+6 = 25, not 24
      ['Ben Santos', 5, 5, 5, { formula: 'SUM(B5:D5)', result: 16 }, 70, 70], // stale result
    ]);
    const { issues } = checkGradeFiles([f]);
    expect(find(issues, 'Above highest possible score', 'C4').detail).toMatch(/12 but the highest possible score is 10/);
    expect(find(issues, 'Total does not add up', 'E4').detail).toMatch(/Total is 24, but B to D add up to 25/);
    expect(find(issues, 'Total does not add up', 'E5').detail).toMatch(/=SUM\(B5:D5\) gives 15, but the file shows 16/);
  });

  it('LRNs: duplicates, wrong length, one LRN with two different learners across files', async () => {
    const a = await asFile('AP.xlsx', [
      ['LRN', 'Learner Name', 'Grade'],
      ['123456789012', 'Jose Dela Cruz', 88],
      ['123456789012', 'Ana Reyes', 90],
      ['12345', 'Ben Santos', 85],
    ]);
    const b = await asFile('Math.xlsx', [
      ['LRN', 'Learner Name', 'Grade'],
      ['123456789012', 'Carlo Mendoza', 88],
      ['223456789012', 'Ana Reyes', 90],
      ['323456789012', 'Ben Santos', 85],
    ]);
    const { issues } = checkGradeFiles([a, b]);
    expect(find(issues, 'Duplicate LRN', 'A3').detail).toMatch(/same LRN as Jose Dela Cruz \(row 2\)/);
    expect(find(issues, 'LRN format', 'A4')).toMatchObject({ severity: 'warning' });
    expect(find(issues, 'Same LRN, different learner')).toMatchObject({ file: 'Math.xlsx', learner: 'Carlo Mendoza' });
  });

  it('across files: different spellings and learners missing from a list', async () => {
    const a = await asFile('AP_Term1.xlsx', [['STUDENT', 'Grade'], ['1. Jose Miguel Dela Cruz', 88], ['2. Maria Angelica Santos', 90], ['3. Rafael Bautista', 88], ['4. Emmanuel Reyes', 89]]);
    const b = await asFile('Math_Term1.xlsx', [['STUDENT', 'Grade'], ['1. Jose Miguel Dela Cruz', 97], ['2. Maria Angelika Santos', 89], ['3. Rafael Bautista', 89]]);
    const { issues } = checkGradeFiles([a, b]);
    expect(find(issues, 'Name spelled differently').detail).toMatch(/"2\. Maria Angelika Santos" here, "2\. Maria Angelica Santos" in AP_Term1\.xlsx/);
    expect(find(issues, 'Learner missing')).toMatchObject({ file: 'Math_Term1.xlsx', learner: '4. Emmanuel Reyes' });
  });

  it('reads SUM / AVERAGE / A1+B1 formulas', () => {
    expect(formulaRefs('SUM(B2:D2)').refs).toEqual([[1, 1], [1, 2], [1, 3]]);
    expect(formulaRefs('=AVERAGE($B$2,C2)'.slice(1))).toMatchObject({ fn: 'AVERAGE', refs: [[1, 1], [1, 2]] });
    expect(formulaRefs('B2+C2+D2').refs).toHaveLength(3);
    expect(formulaRefs('VLOOKUP(A2,X:Y,2,0)')).toBeNull();
  });
});

describe('check_grade_sheets in KaTuroDesk', () => {
  beforeEach(() => { resetTaskActionSupport(); clearAnswerMemory(); callGeminiProxy.mockReset(); });

  it('lists the problems in a report, changes no file, sends no grades to the AI', async () => {
    const ws = createVirtualWorkspace('Grades');
    const consoBytes = await workbookBytes([['STUDENT', 'AP', 'MATH'], ['Jose Miguel Dela Cruz', 88, null], ['Maria Angelica Santos', 101, 89]]);
    ws.handle.saveVirtualFile('conso.xlsx', consoBytes);
    ws.files = ws.handle.getFiles();
    const sent = [];
    callGeminiProxy.mockImplementation(async (req) => {
      sent.push(JSON.stringify(req.contents));
      return { text: JSON.stringify({ confidence: 'high', reply: 'Titingnan ko po.', tasks: [{ id: 't1', tool: 'check_grade_sheets', args: { sourcePaths: ['conso.xlsx'] } }] }) };
    });
    const res = await runDeskAgentTurn({ prompt: 'check my conso for errors before I submit', workspace: ws, user: { uid: 'u1' } });
    expect(res.content).toMatch(/Found \*\*2 error\(s\)\*\*/);
    expect(res.content).toMatch(/Your files were not changed/);
    expect(sent).toHaveLength(1);
    expect(sent[0]).not.toContain('101');
    const out = res.createdFiles.find((f) => f.format === 'xlsx');
    expect(out.name).toMatch(/^Grade_Check/);
    const report = new ExcelJS.Workbook();
    await report.xlsx.load(await readFileBytes(ws.handle, out.path));
    const rows = report.getWorksheet('Issues').getSheetValues().slice(2).map((r) => r.slice(1, 6).join(' | '));
    expect(rows).toEqual(expect.arrayContaining([expect.stringMatching(/Error \| Missing grade \| conso\.xlsx \| Sheet1 \| C2/), expect.stringMatching(/Error \| Out of range \| conso\.xlsx \| Sheet1 \| B3/)]));
    expect(Array.from(await readFileBytes(ws.handle, 'conso.xlsx'))).toEqual(Array.from(consoBytes)); // untouched
  });
});
