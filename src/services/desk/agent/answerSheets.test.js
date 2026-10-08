import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Buffer } from 'node:buffer';
import jpeg from 'jpeg-js';
import ExcelJS from 'exceljs';
import * as XLSX from 'xlsx';
import { callGeminiProxy } from '../../geminiConfig';
import { runDeskAgentTurn, clearAnswerMemory } from './deskAgent';
import { resetTaskActionSupport } from './llm';
import { createVirtualWorkspace, readFileBytes } from '../../localFileSystem';
import { parseAnswerKey, scoreSheet, answerForm } from '../generators/answerSheets';

vi.mock('../../geminiConfig', () => ({ callGeminiProxy: vi.fn() }));

/** A different little JPEG per sheet, so the pretend AI knows which photo it was given. */
const photo = (shade) => {
  const data = Buffer.alloc(16 * 16 * 4, shade);
  return new Uint8Array(jpeg.encode({ data, width: 16, height: 16 }, 90).data);
};
const b64 = (u8) => Buffer.from(u8).toString('base64');

describe('check answer sheets from photos', () => {
  beforeEach(() => { resetTaskActionSupport(); clearAnswerMemory(); callGeminiProxy.mockReset(); });

  it('answer keys in the ways teachers type them', () => {
    expect(parseAnswerKey('1. A 2. C 3. B').key).toEqual(['A', 'C', 'B']);
    expect(parseAnswerKey('Answer key: 1-a, 2-c, 3-b').key).toEqual(['A', 'C', 'B']);
    expect(parseAnswerKey('ACBD').key).toEqual(['A', 'C', 'B', 'D']);
    expect(parseAnswerKey('A C B D').key).toEqual(['A', 'C', 'B', 'D']);
    expect(parseAnswerKey('1. True 2. False 3. Tama 4. Mali').key).toEqual(['T', 'F', 'T', 'F']);
    expect(parseAnswerKey('A\nC\nB').key).toEqual(['A', 'C', 'B']);
    expect(parseAnswerKey('1. A 3. B').error).toBe('no answer for item 2');
    expect(parseAnswerKey('1. A 1. B').error).toBe('item 1 is given twice');
    expect([answerForm('true'), answerForm(' b. '), answerForm('?'), answerForm('')]).toEqual(['T', 'B', '?', '']);
  });

  it('scoring: right, wrong, blank and unclear items', () => {
    const s = scoreSheet({ answers: { 1: 'A', 2: 'B', 3: '', 4: '?' } }, ['A', 'C', 'B', 'D']);
    expect(s).toMatchObject({ score: 1, total: 4, wrong: [2], blank: [3], unclear: [4], responses: [1, 0, 0, 0] });
  });

  it('a folder of sheets: read, scored, names matched to the class list, flags; results ready for item analysis', async () => {
    const ws = createVirtualWorkspace('Class');
    const sheets = {
      'Quiz/IMG_1.jpg': { img: photo(250), read: { name: 'Juan Dela Cruz', answers: { 1: 'A', 2: 'C', 3: 'B', 4: 'D', 5: 'A' } } },
      'Quiz/IMG_2.jpg': { img: photo(200), read: { name: 'Maria Santos', answers: { 1: 'A', 2: 'B', 3: 'B', 4: '?', 5: 'A' } } },
      'Quiz/IMG_10.jpg': { img: photo(150), read: { name: 'Pedro Penduko', answers: { 1: 'B', 2: 'C', 3: '', 4: 'D', 5: 'C' } } },
    };
    for (const [p, s] of Object.entries(sheets)) ws.handle.saveVirtualFile(p, s.img);
    const list = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(list, XLSX.utils.aoa_to_sheet([['No.', 'Name'], [1, 'Dela Cruz, Juan P.'], [2, 'Santos, Maria A.'], [3, 'Reyes, Ben']]), 'L');
    ws.handle.saveVirtualFile('Class List.xlsx', new Uint8Array(XLSX.write(list, { type: 'array', bookType: 'xlsx' })));
    ws.files = ws.handle.getFiles();
    const seen = [];
    callGeminiProxy.mockImplementation(async (req) => {
      const text = JSON.stringify(req.contents);
      if (text.includes('You are the planner')) return { text: JSON.stringify({ confidence: 'high', reply: 'Sige po.', tasks: [{ id: 't1', tool: 'check_answer_sheets', args: { folder: 'Quiz', answerKey: '1. A 2. C 3. B 4. D 5. A', listPath: 'Class List.xlsx', title: 'Science Quiz 1' } }] }) };
      const hit = Object.entries(sheets).find(([, s]) => text.includes(b64(s.img)));
      seen.push(hit?.[0]);
      return { text: JSON.stringify(hit ? hit[1].read : {}) };
    });
    const res = await runDeskAgentTurn({ prompt: 'check the answer sheets in Quiz', workspace: ws, user: { uid: 'u1' }, profile: { fullName: 'Ana Reyes' }, autoApprove: true });
    expect(seen.sort()).toEqual(['Quiz/IMG_1.jpg', 'Quiz/IMG_10.jpg', 'Quiz/IMG_2.jpg']);
    expect(res.content).toMatch(/Checked 3 of 3 answer sheet\(s\) against the 5-item key: average 3\.3\/5, highest 5, lowest 2\./);
    expect(res.content).toMatch(/2 sheet\(s\) need a quick look/);
    expect(res.content).toMatch(/please spot-check a few sheets before recording/);
    const file = res.createdFiles.find((f) => /Science_Quiz_1|Science Quiz 1/.test(f.name));
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await readFileBytes(ws.handle, file.path));
    const rows = [];
    wb.getWorksheet('Scores').eachRow((r) => rows.push(r.values.slice(1).map((v) => (v && typeof v === 'object' ? v.result ?? v.text : v))));
    const body = rows.slice(rows.findIndex((r) => r[0] === 'No.') + 1);
    // File-name order: IMG_1, IMG_2, IMG_10.
    expect(body.map((r) => [r[1], r[2], r[3]])).toEqual([['Dela Cruz, Juan P.', 'Juan Dela Cruz', 5], ['Santos, Maria A.', 'Maria Santos', 3], ['Pedro Penduko', 'Pedro Penduko', 2]]);
    expect(body[1][7]).toBe('unclear: item 4');
    expect(body[2][7]).toBe('name not in the class list; blank: 3');

    // The Responses sheet works for item analysis.
    callGeminiProxy.mockReset();
    clearAnswerMemory();
    callGeminiProxy.mockImplementation(async (req) => {
      const text = JSON.stringify(req.contents);
      if (text.includes('You are the planner')) return { text: JSON.stringify({ confidence: 'high', reply: 'Sige po.', tasks: [{ id: 't1', tool: 'analyze_scores', args: { path: file.path, sheet: 'Responses' } }] }) };
      return { text: JSON.stringify({ remarks: ['ok'], interventions: ['ok'] }) };
    });
    const ia = await runDeskAgentTurn({ prompt: 'item analysis of that', workspace: { ...ws, files: ws.handle.getFiles() }, user: { uid: 'u1' }, profile: { fullName: 'Ana Reyes' }, autoApprove: true });
    expect(ia.content).not.toMatch(/Not finished|Needs your input/);
    expect(ia.content).toMatch(/MPS/);
  });

  it('asks for the key; refuses a key it cannot read', async () => {
    const ws = createVirtualWorkspace('Class');
    ws.handle.saveVirtualFile('Quiz/IMG_1.jpg', photo(250));
    ws.files = ws.handle.getFiles();
    const run = async (args) => {
      callGeminiProxy.mockImplementation(async () => ({ text: JSON.stringify({ confidence: 'high', reply: 'Sige po.', tasks: [{ id: 't1', tool: 'check_answer_sheets', args }] }) }));
      return runDeskAgentTurn({ prompt: 'check', workspace: ws, user: { uid: 'u1' }, profile: {}, autoApprove: true });
    };
    expect((await run({ folder: 'Quiz' })).content).toMatch(/Needs your input.*What is the answer key\?/);
    clearAnswerMemory();
    expect((await run({ folder: 'Quiz', answerKey: '1. A 3. C' })).content).toMatch(/Needs your input.*could not use that answer key \(no answer for item 2\)/);
  });
});
