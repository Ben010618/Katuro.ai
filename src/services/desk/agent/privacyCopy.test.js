import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Buffer } from 'node:buffer';
import ExcelJS from 'exceljs';
import PizZip from 'pizzip';
import * as XLSX from 'xlsx';
import { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell } from 'docx';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { callGeminiProxy } from '../../geminiConfig';
import { runDeskAgentTurn, clearAnswerMemory } from './deskAgent';
import { resetTaskActionSupport } from './llm';
import { createVirtualWorkspace, readFileBytes, flattenFileTree } from '../../localFileSystem';
import { buildMatcher, nameVariants, learnersFromRows, maskOfficeXml, officeText, pdfRedactionBoxes } from '../generators/privacyCopy';

vi.mock('../../geminiConfig', () => ({ callGeminiProxy: vi.fn() }));

const LEARNERS = [['No.', "Learner's Name", 'LRN', 'Birthdate', 'Address', 'Q1'],
  [1, 'Dela Cruz, Juan P.', 123456789012, '2015-03-02', 'Purok 1, Dayap', 88],
  [2, 'Santos, Maria A.', '123456789013', '2015-07-21', 'Purok 2, Dayap', 91],
  [3, 'Reyes, Ben', '123456789014', '2015-01-10', 'Purok 3, Dayap', 79]];

async function classRecord() {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Grade 5 - Rizal');
  ws.addRow(['School Name: Dayap Elementary School']);
  for (const r of LEARNERS) ws.addRow(r);
  ws.getCell('B3').note = 'Juan Dela Cruz was absent on the test day';
  const sum = wb.addWorksheet('Summary');
  sum.getCell('A1').value = 'Top: Juan Dela Cruz (with honors)';
  sum.getCell('A2').value = { formula: "'Grade 5 - Rizal'!B4", result: 'Santos, Maria A.' };
  sum.getCell('A3').value = 'Class average: 86';
  wb.addWorksheet('SANTOS, MARIA A.').getCell('A1').value = 'Portfolio of MARIA SANTOS';
  return new Uint8Array(await wb.xlsx.writeBuffer());
}

async function letterDocx() {
  const doc = new Document({ sections: [{ children: [
    new Paragraph({ children: [new TextRun('Dear parent of '), new TextRun({ text: 'JUAN P. ', bold: true }), new TextRun({ text: 'DELA CRUZ', bold: true }), new TextRun(',')] }),
    new Paragraph('Your child, LRN 123456789012, will join the contest with Maria Santos.'),
    new Table({ rows: [
      new TableRow({ children: ['Name', 'LRN', 'Birthdate'].map((t) => new TableCell({ children: [new Paragraph(t)] })) }),
      new TableRow({ children: ['Dela Cruz, Juan P.', '123456789012', 'March 2, 2015'].map((t) => new TableCell({ children: [new Paragraph(t)] })) }),
      new TableRow({ children: ['Santos, Maria A.', '123456789013', 'July 21, 2015'].map((t) => new TableCell({ children: [new Paragraph(t)] })) }),
    ] }),
  ] }] });
  return new Uint8Array(await Packer.toArrayBuffer(doc));
}

describe('hide learner details in a copy', () => {
  beforeEach(() => { resetTaskActionSupport(); clearAnswerMemory(); callGeminiProxy.mockReset(); });

  const run = async (ws, args, prompt = 'hide the names and LRNs before I share this') => {
    callGeminiProxy.mockImplementation(async () => ({ text: JSON.stringify({ confidence: 'high', reply: 'Sige po.', tasks: [{ id: 't1', tool: 'hide_learner_details', args }] }) }));
    return runDeskAgentTurn({ prompt, workspace: ws, user: { uid: 'u1' }, profile: { fullName: 'Ana Reyes' }, autoApprove: true });
  };

  it('helpers: name variants, longest name first, initials, rows with a title above the headings', () => {
    expect(nameVariants('Dela Cruz, Juan P.')).toEqual(expect.arrayContaining(['Dela Cruz, Juan P.', 'Juan P. Dela Cruz', 'Juan Dela Cruz', 'Dela Cruz Juan P.']));
    const m = buildMatcher([{ name: 'Cruz, Ana' }, { name: 'Cruz, Ana Marie' }]);
    expect(m.replace('Ana Marie Cruz and ANA CRUZ').text).toBe('Learner 2 and Learner 1');
    expect(buildMatcher([{ name: 'Dela Cruz, Juan P.' }], { mode: 'initials' }).replace('JUAN DELA CRUZ').text).toBe('J.D.C.');
    expect(buildMatcher([], { hideNames: false }).replace('LRN 123456789012; phone 09171234567').text).toBe('LRN [LRN hidden]; phone 09171234567');
    const rows = [['School Name: Dayap ES'], ['Last Name', 'First Name', 'Middle Name', 'LRN'], ['Dela Cruz', 'Juan', 'Perez', '123456789012'], ['TOTAL']];
    expect(learnersFromRows(rows).learners).toEqual([{ name: 'Dela Cruz, Juan Perez', lrn: '123456789012', parts: { last: 'Dela Cruz', first: 'Juan', middle: 'Perez' } }]);
  });

  it('Excel: names, LRNs and birthdates hidden everywhere (cells, notes, formulas, sheet names); key saved apart; original untouched', async () => {
    const ws = createVirtualWorkspace('Class');
    const original = await classRecord();
    ws.handle.saveVirtualFile('Grade 5 Rizal.xlsx', original);
    ws.files = ws.handle.getFiles();
    const res = await run(ws, { path: 'Grade 5 Rizal.xlsx', hide: ['names', 'lrn', 'birthdate'], keepKey: true });
    expect(res.content).toMatch(/Made Grade 5 Rizal \(privacy copy\)\.xlsx/);
    expect(res.content).toMatch(/names shown as Learner 1 to Learner 3; LRNs removed; cleared: Birthdate/);
    expect(res.content).toMatch(/I checked the copy: no learner names or LRNs are left/);
    expect(res.content).toMatch(/privacy key \(keep private\)\.xlsx; keep it private/);
    const copy = res.createdFiles.find((f) => /privacy copy/.test(f.name));
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await readFileBytes(ws.handle, copy.path));
    const s1 = wb.getWorksheet('Grade 5 - Rizal');
    expect([s1.getCell('B3').value, s1.getCell('C3').value, s1.getCell('D3').value, s1.getCell('E3').value, s1.getCell('F3').value]).toEqual(['Learner 1', '[LRN hidden]', null, 'Purok 1, Dayap', 88]);
    expect(s1.getCell('B4').value).toBe('Learner 2');
    expect(s1.getCell('C5').value).toBe('[LRN hidden]');
    expect(s1.getCell('A1').value).toBe('School Name: Dayap Elementary School');
    const noteText = (n) => (typeof n === 'string' ? n : (n?.texts || []).map((t) => t.text).join(''));
    expect(noteText(s1.getCell('B3').note)).toBe('Learner 1 was absent on the test day');
    const sum = wb.getWorksheet('Summary');
    expect(sum.getCell('A1').value).toBe('Top: Learner 1 (with honors)');
    expect(sum.getCell('A2').value).toMatchObject({ formula: "'Grade 5 - Rizal'!B4", result: 'Learner 2' });
    expect(sum.getCell('A3').value).toBe('Class average: 86');
    expect(wb.worksheets.map((w) => w.name)).toEqual(['Grade 5 - Rizal', 'Summary', 'Learner 2']);
    expect(wb.getWorksheet('Learner 2').getCell('A1').value).toBe('Portfolio of Learner 2');
    // The original file is exactly as it was.
    expect(Buffer.from(await readFileBytes(ws.handle, 'Grade 5 Rizal.xlsx')).equals(Buffer.from(original))).toBe(true);
    const key = res.createdFiles.find((f) => /privacy key/.test(f.name));
    const kb = XLSX.read(await readFileBytes(ws.handle, key.path));
    expect(XLSX.utils.sheet_to_json(kb.Sheets[kb.SheetNames[0]], { header: 1 }).flat()).toEqual(expect.arrayContaining(['Learner 1', 'Dela Cruz, Juan P.']));
  });

  it('Word: names from the table and in letters (split across bold runs), LRNs and table birthdates', async () => {
    const ws = createVirtualWorkspace('Class');
    ws.handle.saveVirtualFile('Letter.docx', await letterDocx());
    ws.files = ws.handle.getFiles();
    const res = await run(ws, { path: 'Letter.docx', hide: ['names', 'lrn', 'birthdate'] });
    expect(res.content).toMatch(/I checked the copy: no learner names or LRNs are left/);
    const copy = res.createdFiles.find((f) => /privacy copy/.test(f.name));
    const t = await officeText(await readFileBytes(ws.handle, copy.path), 'docx');
    expect(t).toMatch(/Dear parent of\s+Learner 1\s*,/);
    expect(t).toMatch(/Your child, LRN \[LRN hidden\], will join the contest with Learner 2\./);
    expect(t).not.toMatch(/Juan|Maria|Santos|Cruz|1234567890|March 2|July 21/i);
    expect(t).toMatch(/Birthdate/); // the heading stays
  });

  it('PowerPoint and CSV', async () => {
    const zip = new PizZip();
    zip.file('ppt/slides/slide1.xml', '<p:sld xmlns:a="a" xmlns:p="p"><a:p><a:r><a:t>Star of the week: </a:t></a:r><a:r><a:t>Maria Santos</a:t></a:r></a:p></p:sld>');
    const m = buildMatcher([{ name: 'Santos, Maria A.' }]);
    const res = await maskOfficeXml(zip.generate({ type: 'uint8array' }), m, 'pptx');
    expect(res.count).toBe(1);
    expect(await officeText(res.bytes, 'pptx')).toMatch(/Star of the week: Learner 1/);

    const ws = createVirtualWorkspace('Class');
    ws.handle.saveVirtualFile('List.csv', new TextEncoder().encode('Name,LRN,Contact No.\r\n"Dela Cruz, Juan P.",123456789012,09171234567\r\n"Reyes, Ben",123456789014,09181234567\r\n'));
    ws.files = ws.handle.getFiles();
    const out = await run(ws, { path: 'List.csv', hide: ['names', 'lrn', 'contact'] });
    const csv = new TextDecoder().decode(await readFileBytes(ws.handle, out.createdFiles[0].path));
    expect(csv.replace(new RegExp(`^${String.fromCharCode(0xfeff)}`), '').split('\r\n')).toEqual(['Name,LRN,Contact No.', 'Learner 1,[LRN hidden],', 'Learner 2,[LRN hidden],']);
  });

  it('PDF: finds the names and LRNs on the page (even split into pieces); the picture copy needs the desktop app', async () => {
    const pdf = await PDFDocument.create();
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const page = pdf.addPage([612, 936]);
    page.drawText('1.', { x: 40, y: 800, size: 11, font });
    page.drawText('DELA CRUZ,', { x: 60, y: 800, size: 11, font });
    page.drawText('JUAN P.', { x: 128, y: 800, size: 11, font });
    page.drawText('123456789012', { x: 300, y: 800, size: 11, font });
    page.drawText('Prepared by: Ana Reyes', { x: 40, y: 700, size: 11, font });
    const bytes = await pdf.save();
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const doc = await pdfjs.getDocument({ data: bytes.slice(), isEvalSupported: false, verbosity: 0 }).promise;
    const plan = await pdfRedactionBoxes(doc, buildMatcher([{ name: 'Dela Cruz, Juan P.' }]));
    const boxes = plan[0].boxes;
    expect(boxes.map((b) => b.label).sort()).toEqual(['LRN hidden', 'Learner 1']);
    const nameBox = boxes.find((b) => b.label === 'Learner 1');
    expect(nameBox.x).toBeLessThan(62);
    expect(nameBox.x + nameBox.w).toBeGreaterThan(160);     // covers both pieces
    expect(nameBox.y).toBeLessThan(800);
    expect(nameBox.y + nameBox.h).toBeGreaterThan(808);
    expect(boxes.every((b) => b.y > 750)).toBe(true);        // the teacher's own name is left alone

    const ws = createVirtualWorkspace('Class');
    ws.handle.saveVirtualFile('SF2.pdf', bytes);
    ws.handle.saveVirtualFile('List.xlsx', (() => { const b = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(b, XLSX.utils.aoa_to_sheet(LEARNERS), 'L'); return new Uint8Array(XLSX.write(b, { type: 'array', bookType: 'xlsx' })); })());
    ws.files = ws.handle.getFiles();
    const res = await run(ws, { path: 'SF2.pdf', listPath: 'List.xlsx' });
    expect(res.content).toMatch(/needs the KaTuroDesk desktop app/);
    expect(flattenFileTree(ws.handle.getFiles()).some((f) => /privacy copy/.test(f.name))).toBe(false);
  });

  it('asks instead of guessing when there are no names to go by; says so when there is nothing to hide', async () => {
    const ws = createVirtualWorkspace('Class');
    const pdf = await PDFDocument.create();
    pdf.addPage().drawText('Quiz 1', { font: await pdf.embedFont(StandardFonts.Helvetica) });
    ws.handle.saveVirtualFile('Quiz.pdf', await pdf.save());
    const plain = new Document({ sections: [{ children: [new Paragraph('Lesson plan in Science 5')] }] });
    ws.handle.saveVirtualFile('Plan.docx', new Uint8Array(await Packer.toArrayBuffer(plain)));
    ws.files = ws.handle.getFiles();
    const a = await run(ws, { path: 'Quiz.pdf' });
    expect(a.content).toMatch(/Needs your input.*could not find the learners' names in Quiz\.pdf.*class list/);
    clearAnswerMemory();
    const b = await run(ws, { path: 'Plan.docx', hide: ['lrn'] });
    expect(b.content).toMatch(/I found no LRNs to hide in Plan\.docx\. I did not save a copy/);
    expect(b.createdFiles).toHaveLength(0);
  });
});
