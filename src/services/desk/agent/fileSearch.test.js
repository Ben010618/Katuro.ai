import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as XLSX from 'xlsx';
import { Document, Packer, Paragraph, Table, TableRow, TableCell } from 'docx';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { callGeminiProxy } from '../../geminiConfig';
import { runDeskAgentTurn, clearAnswerMemory } from './deskAgent';
import { resetTaskActionSupport } from './llm';
import { createVirtualWorkspace } from '../../localFileSystem';
import { termsFromQuery, termPattern } from './fileSearch';

vi.mock('../../geminiConfig', () => ({ callGeminiProxy: vi.fn() }));

// Reading scans on this computer: a stand-in for Tesseract (off unless a test turns it on).
const ocr = vi.hoisted(() => ({ on: false, keys: [], text: {} }));
vi.mock('../readers/ocr.js', async (importOriginal) => {
  const real = await importOriginal();
  return {
    ...real,
    ocrAvailable: () => ocr.on,
    deskOcr: () => ({
      readFile: async ({ key, kind, getBytes }) => {
        ocr.keys.push(key);
        const b = await getBytes();
        if (!b?.length) throw new Error('no bytes');
        const path = key.split('|')[0];
        if (/Broken/.test(path)) throw new Error('unreadable');
        const pages = (ocr.text[path] || []).map((text, i) => ({ number: i + 1, text, confidence: 80 }));
        return { pages, total: pages.length, read: pages.length, kind };
      },
    }),
  };
});

const xlsx = (sheets) => {
  const wb = XLSX.utils.book_new();
  for (const [name, rows] of Object.entries(sheets)) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), name);
  return new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }));
};

async function folder() {
  const ws = createVirtualWorkspace('Class');
  ws.handle.saveVirtualFile('Grades/Science 5.xlsx', xlsx({ Summary: [['SCIENCE 5 - RIZAL'], ['Learner', 'Term 1', 'Term 2'], ['Dela Cruz, Juan P.', 88, 90], ['Santos, Maria A.', 91, 93]] }));
  ws.handle.saveVirtualFile('Grades/Math 5.xlsx', xlsx({ Q1: [['Name', 'Quarter 1'], ['Reyes, Ben', 80]] }));
  ws.handle.saveVirtualFile('Letters/Parent Letter.docx', new Uint8Array(await Packer.toArrayBuffer(new Document({ sections: [{ children: [
    new Paragraph('Dear parent of Juan Dela Cruz,'), new Paragraph('The Science fair is on Friday.'),
    new Table({ rows: [new TableRow({ children: [new TableCell({ children: [new Paragraph('Activity')] }), new TableCell({ children: [new Paragraph('Date')] })] }), new TableRow({ children: [new TableCell({ children: [new Paragraph('Science fair')] }), new TableCell({ children: [new Paragraph('Oct 9')] })] })] }),
  ] }] }))));
  const pdf = await PDFDocument.create();
  const pg = pdf.addPage();
  const f = await pdf.embedFont(StandardFonts.Helvetica);
  pg.drawText('SF2 Daily Attendance - October', { font: f, x: 50, y: 700 });
  pg.drawText('School Form 2 for Grade 5 Rizal, School Year 2026-2027, Dayap Elementary School', { font: f, x: 50, y: 680, size: 9 });
  ws.handle.saveVirtualFile('Forms/SF2 October.pdf', await pdf.save());
  ws.handle.saveVirtualFile('Photos/IMG_1.jpg', new Uint8Array([0xff, 0xd8, 0xff, 0xd9]));
  ws.files = ws.handle.getFiles();
  return ws;
}

describe('search inside every file', () => {
  beforeEach(() => { resetTaskActionSupport(); clearAnswerMemory(); callGeminiProxy.mockReset(); });

  const run = async (ws, args) => {
    let ai = 0;
    callGeminiProxy.mockImplementation(async (req) => {
      if (JSON.stringify(req.contents).includes('You are the planner')) return { text: JSON.stringify({ confidence: 'high', reply: 'Hahanapin ko po.', tasks: [{ id: 't1', tool: 'search_files', args }] }) };
      ai += 1;
      return { text: '{}' };
    });
    const res = await runDeskAgentTurn({ prompt: 'which file has it?', workspace: ws, user: { uid: 'u1' }, profile: { fullName: 'Ana Reyes' }, autoApprove: true });
    return { res, ai };
  };

  it('terms from a question; names in any order; Term 1 = Quarter 1 = Q1', () => {
    expect(termsFromQuery("Which file has Juan's Term 1 grades?")).toEqual(['Term 1', 'Juan', 'grades']);
    const name = termPattern('Juan Dela Cruz');
    expect(['Dela Cruz, Juan P.', 'JUAN DELA CRUZ', 'Juan P. Dela Cruz'].every((t) => name.test(t))).toBe(true);
    expect(name.test('Juana Delacruz')).toBe(false);
    const t1 = termPattern('Term 1');
    expect(['Term 1', 'Quarter 1', 'Q1', 'T1'].every((t) => t1.test(t))).toBe(true);
    expect(t1.test('Term 12')).toBe(false);
  });

  it('"Juan Dela Cruz" + "Term 1": the grade sheet first, with his Term 1 grade from the column heading', async () => {
    const ws = await folder();
    const { res, ai } = await run(ws, { terms: ['Juan Dela Cruz', 'Term 1'] });
    expect(ai).toBe(0);
    expect(res.content).toMatch(/1 file\(s\) have all of "Juan Dela Cruz", "Term 1":/);
    expect(res.content).toMatch(/- Grades\/Science 5\.xlsx — Summary, row 3: Dela Cruz, Juan P\. — Term 1: 88/);
    expect(res.content).toMatch(/1 photo\(s\) could not be searched/);
    expect(res.content).toMatch(/Searched \d+ file\(s\) by code; nothing was sent to the AI/);
  });

  it('words in Word paragraphs and tables, PDF pages, and file names', async () => {
    const ws = await folder();
    const a = await run(ws, { terms: ['Science fair'] });
    expect(a.res.content).toMatch(/Letters\/Parent Letter\.docx — (paragraph 2: The Science fair is on Friday\.|table 1, row 2: Science fair)/);
    clearAnswerMemory();
    const b = await run(ws, { terms: ['SF2', 'October'] });
    expect(b.res.content).toMatch(/Forms\/SF2 October\.pdf — page 1: SF2 Daily Attendance - October/);
    clearAnswerMemory();
    const c = await run(ws, { terms: ['Quarter 1'], folder: 'Grades' });
    expect(c.res.content).toMatch(/2 file\(s\) have all of "Quarter 1"/);   // "Term 1" heading counts as Quarter 1
  });

  it('on this computer, the words in scanned PDFs and photos are read and searched too (nothing sent to the AI)', async () => {
    const ws = await folder();
    const blank = await PDFDocument.create();
    blank.addPage();
    blank.addPage();
    ws.handle.saveVirtualFile('Scans/Quiz 1 scores.pdf', await blank.save());
    ws.handle.saveVirtualFile('Scans/Broken scan.pdf', await blank.save());
    ws.handle.saveVirtualFile('Photos/IMG_2.png', new Uint8Array([0x89, 0x50, 0x4e, 0x47]));
    ws.handle.saveVirtualFile('Photos/IMG_3.heic', new Uint8Array([1, 2, 3, 4]));
    ws.files = ws.handle.getFiles();
    ocr.on = true;
    ocr.keys = [];
    ocr.text = {
      'Scans/Quiz 1 scores.pdf': ['QUIZ 1 - SCIENCE 5', 'Santos, Maria A. 18/20'],
      'Photos/IMG_1.jpg': ['Bulletin: Maria Santos, Best in Science'],
      'Photos/IMG_2.png': ['Lunch menu'],
    };
    try {
      const { res, ai } = await run(ws, { terms: ['Maria Santos'] });
      expect(ai).toBe(0);
      expect(res.content).toContain('Scans/Quiz 1 scores.pdf — scanned page 2: Santos, Maria A. 18/20');
      expect(res.content).toContain('Photos/IMG_1.jpg — photo: Bulletin: Maria Santos, Best in Science');
      expect(res.content).not.toContain('IMG_2');
      expect(res.content).toContain('I read the words in 3 scan(s)/photo(s) on this computer');
      // The broken scan and the HEIC photo were not read: said plainly.
      expect(res.content).toContain('1 scanned PDF(s) and 1 photo(s) could not be searched');
      expect(res.content).toMatch(/nothing was sent to the AI/);
      // Each file version is read with its own key (path, size, date).
      expect(ocr.keys.some((k) => k.startsWith('Scans/Quiz 1 scores.pdf|'))).toBe(true);
      expect(ocr.keys.some((k) => k.startsWith('Photos/IMG_3.heic'))).toBe(false);
    } finally {
      ocr.on = false;
    }
  });

  it('nothing found, said plainly', async () => {
    const ws = await folder();
    const { res } = await run(ws, { terms: ['Pedro Penduko'] });
    expect(res.content).toMatch(/I found no file with "Pedro Penduko"/);
  });
});
