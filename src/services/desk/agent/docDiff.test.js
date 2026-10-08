import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'node:fs';
import process from 'node:process';
import PizZip from 'pizzip';
import ExcelJS from 'exceljs';
import { Document, Packer, Paragraph, Table, TableRow, TableCell } from 'docx';
import { callGeminiProxy } from '../../geminiConfig';
import { runDeskAgentTurn, clearAnswerMemory } from './deskAgent';
import { resetTaskActionSupport } from './llm';
import { createVirtualWorkspace, readFileBytes } from '../../localFileSystem';
import { diffWords, diffParagraphs } from '../generators/docDiff';

vi.mock('../../geminiConfig', () => ({ callGeminiProxy: vi.fn() }));

const docx = async (paras, table) => new Uint8Array(await Packer.toArrayBuffer(new Document({ sections: [{ children: [
  ...paras.map((t) => new Paragraph(t)),
  ...(table ? [new Table({ rows: table.map((r) => new TableRow({ children: r.map((c) => new TableCell({ children: [new Paragraph(c)] })) })) })] : []),
] }] })));

describe('what changed between two versions', () => {
  beforeEach(() => { resetTaskActionSupport(); clearAnswerMemory(); callGeminiProxy.mockReset(); });

  const run = async (ws, args) => {
    let aiCalls = 0;
    callGeminiProxy.mockImplementation(async (req) => {
      if (JSON.stringify(req.contents).includes('You are the planner')) return { text: JSON.stringify({ confidence: 'high', reply: 'Sige po.', tasks: [{ id: 't1', tool: 'track_changes', args }] }) };
      aiCalls += 1;
      return { text: '{}' };
    });
    const res = await runDeskAgentTurn({ prompt: 'what changed between the draft and the final?', workspace: ws, user: { uid: 'u1' }, profile: { fullName: 'Ana Reyes' }, autoApprove: true });
    return { res, aiCalls };
  };

  it('helpers: word changes inside a paragraph; edited vs added/removed paragraphs', () => {
    expect(diffWords('The quiz is on Friday.', 'The quiz is on Monday.')).toEqual([{ type: 'same', text: 'The quiz is on ' }, { type: 'del', text: 'Friday.' }, { type: 'ins', text: 'Monday.' }]);
    const ops = diffParagraphs(['Title', 'Bring your notebook.', 'Old rule here'], ['Title', 'Bring your science notebook.', 'A brand new instruction for everyone']);
    expect(ops.map((o) => o.type)).toEqual(['same', 'mod', 'del', 'ins']);
  });

  it('Word: a tracked-changes file (real insertions/deletions) and the list of changes; nothing sent to the AI', async () => {
    const ws = createVirtualWorkspace('Class');
    ws.handle.saveVirtualFile('Letter v1.docx', await docx(['PARENT MEETING', 'The meeting is on Friday at 2:00 PM.', 'Please bring your report card.', 'Thank you.'], [['Topic', 'Time'], ['Grades', '30 min']]));
    ws.handle.saveVirtualFile('Letter v2.docx', await docx(['PARENT MEETING', 'The meeting is on Monday at 2:00 PM.', 'Thank you.', 'Snacks will be served.'], [['Topic', 'Time'], ['Grades', '45 min']]));
    ws.files = ws.handle.getFiles();
    const { res, aiCalls } = await run(ws, { pathOld: 'Letter v1.docx', pathNew: 'Letter v2.docx' });
    expect(aiCalls).toBe(0);
    expect(res.content).toMatch(/From Letter v1\.docx \(older\) to Letter v2\.docx \(newer\): 2 paragraph\(s\) changed, 1 added, 1 removed/);
    const file = res.createdFiles.find((f) => f.name === 'Letter v2 (tracked changes).docx');
    const bytes = await readFileBytes(ws.handle, file.path);
    if (process.env.KT_DIFF_OUT) fs.writeFileSync(process.env.KT_DIFF_OUT, bytes);
    const xml = new PizZip(bytes).file('word/document.xml').asText();
    expect(xml).toMatch(/<w:del [^>]*w:author="KaTuroDesk"[^>]*>[\s\S]*?<w:delText[^>]*>Friday<\/w:delText>/);
    expect(xml).toMatch(/<w:ins [^>]*w:author="KaTuroDesk"[^>]*>[\s\S]*?<w:t[^>]*>Monday<\/w:t>/);
    expect(xml).toMatch(/<w:delText[^>]*>Please bring your report card\.<\/w:delText>/);
    expect(xml).toMatch(/<w:ins [^>]*>[\s\S]*?Snacks will be served\./);
    expect(xml).toMatch(/<w:delText[^>]*>30<\/w:delText>[\s\S]*?<w:t[^>]*>45<\/w:t>/);
  });

  it('Excel: changed cells marked yellow with the old value; new sheets listed', async () => {
    const make = async (score, formula, extraSheet) => {
      const wb = new ExcelJS.Workbook();
      const s = wb.addWorksheet('Q1');
      s.addRow(['Name', 'Score', 'Total']);
      s.addRow(['Dela Cruz, Juan', score, { formula, result: score }]);
      if (extraSheet) wb.addWorksheet('Q2').getCell('A1').value = 'new';
      return new Uint8Array(await wb.xlsx.writeBuffer());
    };
    const ws = createVirtualWorkspace('Class');
    ws.handle.saveVirtualFile('Record old.xlsx', await make(18, 'B2'));
    ws.handle.saveVirtualFile('Record new.xlsx', await make(20, 'B2*1', true));
    ws.files = ws.handle.getFiles();
    const { res } = await run(ws, { pathOld: 'Record old.xlsx', pathNew: 'Record new.xlsx' });
    expect(res.content).toMatch(/2 cell\(s\) changed; new sheet\(s\): Q2/);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await readFileBytes(ws.handle, res.createdFiles[0].path));
    const s = wb.getWorksheet('Q1');
    expect(s.getCell('B2').fill.fgColor.argb).toBe('FFFFF2A8');
    const note = (c) => (typeof c.note === 'string' ? c.note : (c.note?.texts || []).map((t) => t.text).join(''));
    expect(note(s.getCell('B2'))).toBe('Was: 18');
    expect(note(s.getCell('C2'))).toBe('Was: 18 (formula changed)');
    expect(s.getCell('A2').fill).toBeUndefined();
  });

  it('same words → says so without saving; mixed kinds → asks', async () => {
    const ws = createVirtualWorkspace('Class');
    ws.handle.saveVirtualFile('A.docx', await docx(['Hello class.']));
    ws.handle.saveVirtualFile('B.docx', await docx(['Hello class.']));
    ws.handle.saveVirtualFile('C.xlsx', new Uint8Array(await new ExcelJS.Workbook().xlsx.writeBuffer()));
    ws.files = ws.handle.getFiles();
    const a = await run(ws, { pathOld: 'A.docx', pathNew: 'B.docx' });
    expect(a.res.content).toMatch(/No differences in the words/);
    expect(a.res.createdFiles).toHaveLength(0);
    clearAnswerMemory();
    const b = await run(ws, { pathOld: 'A.docx', pathNew: 'C.xlsx' });
    expect(b.res.content).toMatch(/Needs your input.*One file is a spreadsheet/);
  });
});
