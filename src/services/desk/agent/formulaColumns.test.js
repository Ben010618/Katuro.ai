import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Buffer } from 'node:buffer';
import fs from 'node:fs';
import process from 'node:process';
import ExcelJS from 'exceljs';
import PizZip from 'pizzip';
import { callGeminiProxy } from '../../geminiConfig';
import { runDeskAgentTurn, clearAnswerMemory } from './deskAgent';
import { resetTaskActionSupport } from './llm';
import { createVirtualWorkspace, readFileBytes } from '../../localFileSystem';
import { locateGradeTable, gradeNumber } from '../generators/formulaColumns';

vi.mock('../../geminiConfig', () => ({ callGeminiProxy: vi.fn() }));

/** A class record like teachers keep: title rows, Male/Female blocks, Final Grade as a formula. */
async function classRecord({ remarksColumn = false } = {}) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Science 5');
  ws.getCell('A1').value = 'CLASS RECORD - SCIENCE 5';
  ws.getCell('A2').value = 'School Name: Dayap Elementary School';
  const head = ['No.', "Learner's Name", 'Q1', 'Q2', 'Final Grade', ...(remarksColumn ? ['Remarks'] : [])];
  ws.getRow(4).values = head;
  ws.getRow(4).eachCell((c) => { c.font = { bold: true }; c.border = { bottom: { style: 'thin' } }; });
  const learners = [
    ['MALE'],
    [1, 'Dela Cruz, Juan', 90, 92], [2, 'Reyes, Ben', 70, 72], [3, 'Santos, Leo', 80, 80],
    ['FEMALE'],
    [4, 'Bautista, Ana', 92, 90], [5, 'Garcia, Mia', null, null], [6, 'Lopez, Kim', 'INC', 'INC'], [7, 'Cruz, Joy', 74, 75],
  ];
  let r = 5;
  for (const row of learners) {
    ws.getRow(r).values = row;
    if (row.length > 1) {
      const nums = row.slice(2).filter((v) => typeof v === 'number');
      const fg = row[2] === 'INC' ? 'INC' : nums.length ? Math.round(nums.reduce((a, b) => a + b, 0) / nums.length) : '';
      ws.getCell(`E${r}`).value = row[2] === 'INC' ? 'INC' : { formula: `IF(COUNT(C${r}:D${r})=0,"",ROUND(AVERAGE(C${r}:D${r}),0))`, result: fg };
      ws.getCell(`E${r}`).border = { left: { style: 'thin' } };
    }
    r += 1;
  }
  return new Uint8Array(await wb.xlsx.writeBuffer());
}

describe('computed columns as Excel formulas', () => {
  beforeEach(() => { resetTaskActionSupport(); clearAnswerMemory(); callGeminiProxy.mockReset(); });

  const run = async (ws, args, prompt = 'add remarks and rank to my class record') => {
    callGeminiProxy.mockImplementation(async () => ({ text: JSON.stringify({ confidence: 'high', reply: 'Sige po.', tasks: [{ id: 't1', tool: 'add_formula_columns', args }] }) }));
    return runDeskAgentTurn({ prompt, workspace: ws, user: { uid: 'u1' }, profile: { fullName: 'Ana Reyes' }, autoApprove: true });
  };

  it('finds the learners (skipping MALE/FEMALE) and the Final Grade column', async () => {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await classRecord());
    const loc = locateGradeTable(wb);
    expect(loc).toMatchObject({ headerRow: 4, nameCol: 2, gradeCol: 5, gradeHeader: 'Final Grade', learnerRows: [6, 7, 8, 10, 11, 12, 13] });
    expect(gradeNumber({ formula: 'X', result: 91 })).toBe(91);
    expect(gradeNumber(' 85 ')).toBe(85);
    expect(gradeNumber('INC')).toBe(null);
  });

  it('adds Remarks, Descriptor, Rank and the passed/failed counts as live formulas; original untouched', async () => {
    const ws = createVirtualWorkspace('Class');
    const original = await classRecord();
    ws.handle.saveVirtualFile('Science 5.xlsx', original);
    ws.files = ws.handle.getFiles();
    const res = await run(ws, { path: 'Science 5.xlsx', columns: ['remarks', 'descriptor', 'rank', 'counts'] });
    expect(res.content).toMatch(/Added to Science 5 \(KaTuro edit\)\.xlsx \(sheet "Science 5", 7 learner\(s\), using Final Grade in column E\)/);
    expect(res.content).toMatch(/Remarks in column F; Descriptor in column G; Rank in column H; number passed and failed under the table \(row 15\): 4 passed, 1 failed/);
    expect(res.content).toMatch(/1 learner\(s\) have no grade yet.*1 grade\(s\) are not numbers \(like INC\); they show "Check"/);
    const file = res.createdFiles.find((f) => /KaTuro edit/.test(f.name));
    const bytes = await readFileBytes(ws.handle, file.path);
    if (process.env.KT_FORMULA_OUT) fs.writeFileSync(process.env.KT_FORMULA_OUT, bytes);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(bytes);
    const s = wb.getWorksheet('Science 5');
    expect([s.getCell('F4').value, s.getCell('G4').value, s.getCell('H4').value]).toEqual(['Remarks', 'Descriptor', 'Rank']);
    expect(s.getCell('F4').font).toMatchObject({ bold: true });                       // styled like the heading next to it
    expect(s.getCell('F6').value).toEqual({ formula: 'IF(E6="","",IFERROR(IF(--E6>=75,"Passed","Failed"),"Check"))', result: 'Passed' });
    expect(s.getCell('H6').value).toEqual({ formula: 'IF(E6="","",IFERROR(RANK(--E6,$E$6:$E$13,0),""))', result: 1 });
    const col = (c) => [6, 7, 8, 10, 11, 12, 13].map((r) => s.getCell(`${c}${r}`).value.result ?? "");
    // Final grades: 91, 71, 80, 91, (none), INC, 75 (74.5 rounds up).
    expect(col('F')).toEqual(['Passed', 'Failed', 'Passed', 'Passed', '', 'Check', 'Passed']);
    expect(col('G')).toEqual(['Advancing', 'Developing', 'Benchmarking', 'Advancing', '', 'Check', 'Connecting']);
    expect(col('H')).toEqual([1, 5, 3, 1, '', '', 4]);                                // ties share rank 1
    expect(s.getCell('F5').value).toBe(null);                                        // the MALE line gets nothing
    expect(s.getCell('B15').value).toBe('Number passed (75 and above)');
    expect(s.getCell('E15').value).toEqual({ formula: 'COUNTIF(E6:E13,">=75")', result: 4 });
    expect(s.getCell('E16').value).toEqual({ formula: 'COUNTIF(E6:E13,"<75")', result: 1 });
    expect(new PizZip(bytes).file('xl/workbook.xml').asText()).toMatch(/<calcPr[^>]*fullCalcOnLoad="1"/); // Excel works the formulas out on opening
    expect(Buffer.from(await readFileBytes(ws.handle, 'Science 5.xlsx')).equals(Buffer.from(original))).toBe(true);
  });

  it('uses an empty Remarks column already in the template; asks before replacing typed remarks', async () => {
    const ws = createVirtualWorkspace('Class');
    ws.handle.saveVirtualFile('With Remarks.xlsx', await classRecord({ remarksColumn: true }));
    ws.files = ws.handle.getFiles();
    const res = await run(ws, { path: 'With Remarks.xlsx', columns: ['remarks'] });
    expect(res.content).toMatch(/Remarks in column F \(your existing column\)/);

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await classRecord({ remarksColumn: true }));
    wb.getWorksheet(1).getCell('F6').value = 'Passed';
    ws.handle.saveVirtualFile('Typed.xlsx', new Uint8Array(await wb.xlsx.writeBuffer()));
    ws.files = ws.handle.getFiles();
    clearAnswerMemory();
    const ask = await run(ws, { path: 'Typed.xlsx', columns: ['remarks'] });
    expect(ask.content).toMatch(/Needs your input.*Column F \("Remarks"\) already has 1 value\(s\)\. Should I replace them with formulas\?/);
    expect(ask.createdFiles).toHaveLength(0);
  });

  it('asks which grades to use when there are several, and for .xls files', async () => {
    const wb = new ExcelJS.Workbook();
    const s = wb.addWorksheet('Conso');
    s.addRow(['Name', 'Math Final Grade', 'Science Final Grade']);
    s.addRow(['Dela Cruz, Juan', 90, 85]);
    s.addRow(['Reyes, Ben', 80, 70]);
    const ws = createVirtualWorkspace('Class');
    ws.handle.saveVirtualFile('Conso.xlsx', new Uint8Array(await wb.xlsx.writeBuffer()));
    ws.handle.saveVirtualFile('Old.xls', new Uint8Array([1]));
    ws.files = ws.handle.getFiles();
    const a = await run(ws, { path: 'Conso.xlsx', columns: ['remarks'] });
    expect(a.content).toMatch(/Needs your input.*Which grades should I use\? I found: Math Final Grade \(Conso, column B\); Science Final Grade \(Conso, column C\)/);
    clearAnswerMemory();
    const b = await run(ws, { path: 'Conso.xlsx', columns: ['remarks'], gradeColumn: 'Science Final Grade' });
    expect(b.content).toMatch(/using Science Final Grade in column C/);
    clearAnswerMemory();
    const c = await run(ws, { path: 'Old.xls', columns: ['remarks'] });
    expect(c.content).toMatch(/Save As \.xlsx first/);
  });
});
