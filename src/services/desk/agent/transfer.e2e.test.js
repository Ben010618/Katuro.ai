import { describe, it, expect, vi, beforeEach } from 'vitest';
import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import { Document, Packer, Paragraph, Table, TableRow, TableCell, TextRun } from 'docx';
import { callGeminiProxy } from '../../geminiConfig';
import { runDeskAgentTurn } from './deskAgent';
import { resetTaskActionSupport } from './llm';
import { createVirtualWorkspace, readFileBytes, fileExists } from '../../localFileSystem';
import { useDeskStore } from '../../../store/deskStore';

vi.mock('../../geminiConfig', () => ({ callGeminiProxy: vi.fn() }));
vi.mock('../../db', () => ({ deductTokens: vi.fn().mockResolvedValue(true) }));

const PNG_1x1 = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='), (c) => c.charCodeAt(0));

/** The school's own SF2 template: logo, merged title, colored header, borders, a formula. */
async function schoolSf2() {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('SF2');
  ws.mergeCells('B1:J1');
  ws.getCell('B1').value = 'RIZAL NATIONAL HIGH SCHOOL — School Form 2';
  ws.getCell('B1').font = { bold: true, size: 14, color: { argb: 'FF1F3A2E' } };
  ws.getCell('B3').value = 'Month:';
  ws.getCell('C3').value = 'October';
  const header = ['No.', '', "LEARNER'S NAME", 'LRN', 1, 2, 3, 6, 7, 'Absent'];
  header.forEach((h, i) => {
    const c = ws.getCell(5, i + 1);
    c.value = h;
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE4D5AC' } };
    c.border = { top: { style: 'thin' }, bottom: { style: 'thin' } };
  });
  ws.getCell('C6').value = 'MALE';
  ws.getCell('C7').value = 'Dela Cruz, Juan P.';
  ws.getCell('C8').value = 'FEMALE';
  ws.getCell('C9').value = 'Santos, Maria L.';
  for (const r of [7, 9]) {
    for (let c = 5; c <= 9; c++) ws.getCell(r, c).border = { left: { style: 'thin' }, right: { style: 'thin' } };
    ws.getCell(r, 10).value = { formula: `COUNTIF(E${r}:I${r},"x")`, result: 0 };
  }
  const img = wb.addImage({ buffer: PNG_1x1, extension: 'png' });
  ws.addImage(img, { tl: { col: 0, row: 0 }, ext: { width: 40, height: 40 } });
  return new Uint8Array(await wb.xlsx.writeBuffer());
}

/** A teacher's attendance typed in Word, in a different layout and marks. */
async function wordAttendance() {
  const row = (cells) => new TableRow({ children: cells.map((t) => new TableCell({ children: [new Paragraph({ children: [new TextRun(t)] })] })) });
  const doc = new Document({
    sections: [{
      children: [
        new Paragraph({ children: [new TextRun({ text: 'Attendance – Grade 7 Sampaguita – October', bold: true })] }),
        new Table({ rows: [row(['Name', 'Oct 1', 'Oct 2', 'Oct 3', 'Oct 6', 'Oct 7']), row(['JUAN DELA CRUZ', '/', 'A', '/', '/', 'A']), row(['Maria Santos', '/', '/', '/', 'A', '/'])] }),
      ],
    }],
  });
  return new Uint8Array(await Packer.toArrayBuffer(doc));
}

const WORD_LAYOUT = {
  docType: 'attendance', title: 'Attendance October', confidence: 0.9, fields: [],
  tables: [{
    id: 'w', purpose: 'attendance', location: { table: 't0', firstRow: 1, lastRow: 2 }, nameColumn: 0,
    columns: [{ key: 'n', column: 0, header: 'Name', meaning: 'learner_name' }, ...[1, 2, 3, 6, 7].map((d, i) => ({ key: `oct${d}`, column: i + 1, header: `Oct ${d}`, meaning: 'day', day: d }))],
    marks: { absent: ['A'], present: ['/'] },
  }],
};
const SF2_LAYOUT = {
  docType: 'attendance', title: 'SF2', confidence: 0.9,
  fields: [{ key: 'month', label: 'Month', location: { sheet: 'SF2', cell: 'C3' } }],
  tables: [{
    id: 's', purpose: 'attendance', location: { sheet: 'SF2', firstRow: 6, lastRow: 9 }, nameColumn: 'C',
    columns: [
      { key: 'name', column: 'C', header: "LEARNER'S NAME", meaning: 'learner_name' },
      ...['E', 'F', 'G', 'H', 'I'].map((col, i) => ({ key: `d${[1, 2, 3, 6, 7][i]}`, column: col, header: String([1, 2, 3, 6, 7][i]), meaning: 'day', day: [1, 2, 3, 6, 7][i] })),
      { key: 'abs', column: 'J', header: 'Absent', meaning: 'absences' },
    ],
    marks: { absent: ['x'], present: [''] },
  }],
};

beforeEach(() => {
  resetTaskActionSupport();
  callGeminiProxy.mockReset();
  try {
    globalThis.localStorage?.clear();
  } catch {
    // no storage in node
  }
});

describe('end to end: Word attendance → school SF2 Excel, formatting preserved', () => {
  it('previews, applies on approval, backs up the original and keeps logo/styles/formulas', async () => {
    const workspace = createVirtualWorkspace('X');
    const sf2 = await schoolSf2();
    workspace.handle.saveVirtualFile('Attendance/Oct_attendance.docx', await wordAttendance());
    workspace.handle.saveVirtualFile('Forms/SF2_Sampaguita.xlsx', sf2);
    workspace.files = workspace.handle.getFiles();

    // AI calls: planner → recognize source → recognize target → (no column mapping needed)
    callGeminiProxy.mockImplementation(async ({ contents }) => {
      const text = JSON.stringify(contents);
      if (text.includes('You are the planner')) {
        return { text: JSON.stringify({ reply: 'Filling your SF2.', tasks: [{ id: 't1', tool: 'transfer_data', args: { sourcePath: 'Attendance/Oct_attendance.docx', targetPath: 'Forms/SF2_Sampaguita.xlsx' } }] }) };
      }
      if (text.includes('Document map')) return { text: JSON.stringify(text.includes('Oct 2') ? WORD_LAYOUT : SF2_LAYOUT) };
      return { text: JSON.stringify({ mapping: {} }) };
    });

    const res = await runDeskAgentTurn({ prompt: 'Encode my Word attendance into the SF2', workspace, user: { uid: 'u1' }, tokenBalance: 10 });
    const art = res.artifacts.find((a) => a.type === 'changes');
    expect(art, res.content).toBeTruthy();
    expect(art.data.status).toBe('pending');
    expect(art.data.edits).toEqual([
      { sheet: 'SF2', cell: 'F7', value: 'x' },
      { sheet: 'SF2', cell: 'I7', value: 'x' },
      { sheet: 'SF2', cell: 'H9', value: 'x' },
    ]);
    // Nothing written yet.
    expect(await fileExists(workspace.handle, 'Forms/SF2_Sampaguita (KaTuro edit).xlsx')).toBe(false);

    // Teacher approves in the Canvas.
    useDeskStore.setState({ workspace, artifacts: [{ ...art, id: 'a1' }], activeArtifact: null });
    const saved = await useDeskStore.getState().applyPendingChanges('a1');
    expect(saved.path).toBe('Forms/SF2_Sampaguita (KaTuro edit).xlsx');
    expect(saved.backups[0]).toMatch(/^KaTuro Backups\/\d{4}-\d{2}-\d{2}\/Forms\/SF2_Sampaguita \(backup \d{6}\)\.xlsx$/);

    // Original untouched, byte for byte.
    expect(Array.from(await readFileBytes(workspace.handle, 'Forms/SF2_Sampaguita.xlsx'))).toEqual(Array.from(sf2));

    // Edited copy: values in, logo + styles + formulas intact.
    const edited = await readFileBytes(workspace.handle, saved.path);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(edited);
    const ws = wb.getWorksheet('SF2');
    expect(ws.getCell('F7').value).toBe('x');
    expect(ws.getCell('I7').value).toBe('x');
    expect(ws.getCell('H9').value).toBe('x');
    expect(ws.getCell('F7').border?.left?.style).toBe('thin');
    expect(ws.getCell('E5').fill?.fgColor?.argb).toBe('FFE4D5AC');
    expect(ws.getCell('J7').formula).toBe('COUNTIF(E7:I7,"x")');
    const [before, after] = await Promise.all([JSZip.loadAsync(sf2), JSZip.loadAsync(edited)]);
    const media = Object.keys(before.files).filter((f) => f.startsWith('xl/media/') && !before.files[f].dir);
    expect(media.length).toBeGreaterThan(0);
    for (const f of media) {
      expect(Array.from(await after.file(f).async('uint8array'))).toEqual(Array.from(await before.file(f).async('uint8array')));
    }
  });
});
