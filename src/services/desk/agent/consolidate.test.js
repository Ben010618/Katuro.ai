import { describe, it, expect, vi, beforeEach } from 'vitest';
import ExcelJS from 'exceljs';
import * as XLSX from 'xlsx';
import { Document, Packer, Paragraph, Table, TableRow, TableCell, TextRun } from 'docx';
import { callGeminiProxy } from '../../geminiConfig';
import { runDeskAgentTurn, clearAnswerMemory } from './deskAgent';
import { resetTaskActionSupport } from './llm';
import { createVirtualWorkspace, readFileBytes } from '../../localFileSystem';
import { uniqueSheetName, cleanRows, buildConsolidatedSpec } from './consolidate';

vi.mock('../../geminiConfig', () => ({ callGeminiProxy: vi.fn() }));

const PNG_1x1 = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='), (c) => c.charCodeAt(0));

describe('consolidate: building the workbook', () => {
  it('Excel tab names: 31 characters, no forbidden characters, never duplicated', () => {
    const used = new Set();
    expect(uniqueSheetName('MATH term 1 agoho class record 2026-2027 final', used)).toBe('MATH term 1 agoho class record ');
    expect(uniqueSheetName('MATH term 1 agoho class record 2026-2027 final', used)).toBe('MATH term 1 agoho class rec (2)');
    expect(uniqueSheetName('Q1/Q2: [draft]?', used)).toBe('Q1 Q2 draft');
    expect(uniqueSheetName('', used)).toBe('Sheet');
  });

  it('drops empty template rows and trailing blank cells, keeps inner blanks', () => {
    expect(cleanRows([['A', null, 'C', '', null], [null, ''], [], ['x']])).toEqual([['A', null, 'C'], ['x']]);
  });

  it('Index first, then data in file order; nothing dropped silently', () => {
    const spec = buildConsolidatedSpec([
      { path: 'Records/Math.xlsx', sheets: [{ name: 'TERM1', rows: [['Name', 'WW1'], ['Cruz, Ana', 18]] }, { name: 'Empty', rows: [[null]] }] },
      { path: 'Notes/Plan.docx', tables: [] },
      { path: 'Photos/AP Male 1.jpeg', photo: { columns: ['Name', 'Score'], rows: [['Reyes', '15']], notes: '1 cell unclear' } },
      { path: 'Other/old.ppt', skipped: 'Unsupported file type.' },
    ], { title: 'Term 1' });
    expect(spec.sheets.map((s) => s.name)).toEqual(['Index', 'Math', 'AP Male 1']);
    expect(spec.sheets[1].rows).toEqual([['Name', 'WW1'], ['Cruz, Ana', 18]]);
    expect(spec.sheets[2].rows).toEqual([['Reyes', 15]]); // numbers read from a photo become numbers
    expect(spec.sheets[0].rows.map((r) => [r[0], r[1], r[2]])).toEqual([
      ['Math.xlsx', 'Spreadsheet', 2],
      ['Plan.docx', 'Word document', 0],
      ['AP Male 1.jpeg', 'Photo / scan (read by AI)', 1],
      ['old.ppt', 'Not included', 0],
    ]);
    expect(spec.sheets[0].rows[2][4]).toMatch(/please check against the original\. AI note: 1 cell unclear/);
  });
});

function xlsxBytes() {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['LEARNER', 'WW1', 'WW2'], ['Cruz, Ana', 18, 20], ['Santos, Mark', 15, null], [], []]), 'TERM1');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['School', 'Dayap NHS'], ['Section', 'Agoho']]), 'INPUT');
  return new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }));
}

async function docxWithTable() {
  const row = (cells) => new TableRow({ children: cells.map((t) => new TableCell({ children: [new Paragraph({ children: [new TextRun(t)] })] })) });
  const doc = new Document({ sections: [{ children: [new Paragraph('Attendance'), new Table({ rows: [row(['Name', 'Absences']), row(['Reyes, Pedro', '2'])] })] }] });
  return new Uint8Array(await Packer.toArrayBuffer(doc));
}

describe('end to end: "consolidate all my files into one Excel"', () => {
  beforeEach(() => {
    resetTaskActionSupport();
    clearAnswerMemory();
    callGeminiProxy.mockReset();
  });

  it('copies spreadsheets and Word tables exactly, reads the photo once, lists everything', async () => {
    const ws = createVirtualWorkspace('Term 1');
    ws.handle.saveVirtualFile('Term 1/MATH class record.xlsx', xlsxBytes());
    ws.handle.saveVirtualFile('Term 1/Attendance.docx', await docxWithTable());
    ws.handle.saveVirtualFile('Term 1/AP Male 1.png', PNG_1x1);
    ws.handle.saveVirtualFile('Term 1/readme.txt', new TextEncoder().encode('Notes for the term.'));
    ws.files = ws.handle.getFiles();
    const paths = ['Term 1/MATH class record.xlsx', 'Term 1/Attendance.docx', 'Term 1/AP Male 1.png', 'Term 1/readme.txt'];

    const aiCalls = [];
    callGeminiProxy.mockImplementation(async (req) => {
      const text = JSON.stringify(req.contents);
      aiCalls.push(text.includes('You are the planner') ? 'planner' : 'other');
      if (text.includes('You are the planner')) {
        return { text: JSON.stringify({ reply: 'Combining your files.', tasks: [{ id: 't1', tool: 'consolidate_files', args: { sourcePaths: paths, title: 'Term 1 Consolidated' } }] }) };
      }
      return { text: JSON.stringify({ title: 'AP Male', columns: ['Name', 'Score'], rows: [['Bautista, Leo', '17']], notes: '' }) };
    });

    const res = await runDeskAgentTurn({ prompt: 'Analyze all documents and files and create me a consolidated files in an Excel document', workspace: ws, attachedPaths: paths, user: { uid: 'u1' } });
    expect(res.content).toMatch(/Combined 3 file\(s\) into 4 sheet\(s\)/);
    expect(res.content).toMatch(/read from photos/);
    expect(aiCalls).toEqual(['planner', 'other']); // only the photo needed the AI

    const out = res.createdFiles[0];
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await readFileBytes(ws.handle, out.path));
    expect(wb.worksheets.map((w) => w.name)).toEqual(['Index', 'MATH class record - TERM1', 'MATH class record - INPUT', 'Attendance', 'AP Male 1']);
    const values = (name) => wb.getWorksheet(name).getSheetValues().slice(1).map((r) => (r || []).slice(1));
    expect(values('MATH class record - TERM1')).toEqual([['LEARNER', 'WW1', 'WW2'], ['Cruz, Ana', 18, 20], ['Santos, Mark', 15]]);
    expect(values('Attendance')).toEqual([['Name', 'Absences'], ['Reyes, Pedro', '2']]);
    expect(values('AP Male 1')).toEqual([['Name', 'Score'], ['Bautista, Leo', 17]]);
    const index = values('Index');
    expect(index[0]).toEqual(['File', 'What was taken', 'Rows', 'Sheet in this workbook', 'Note']);
    expect(index.find((r) => r[0] === 'readme.txt')[1]).toBe('Not included');
  });
});
