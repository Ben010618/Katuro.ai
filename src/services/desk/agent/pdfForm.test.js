import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Buffer } from 'node:buffer';
import jpeg from 'jpeg-js';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { callGeminiProxy } from '../../geminiConfig';
import { runDeskAgentTurn, clearAnswerMemory } from './deskAgent';
import { resetTaskActionSupport } from './llm';
import { createVirtualWorkspace, readFileBytes } from '../../localFileSystem';
import { fieldsFromBoxes } from '../generators/pdfForm';

vi.mock('../../geminiConfig', () => ({ callGeminiProxy: vi.fn() }));

async function fillablePdf() {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const page = pdf.addPage([612, 936]);
  const form = pdf.getForm();
  page.drawText('Name of Learner:', { x: 50, y: 800, size: 11, font });
  form.createTextField('Text1').addToPage(page, { x: 160, y: 795, width: 220, height: 18 });
  page.drawText('School:', { x: 50, y: 770, size: 11, font });
  form.createTextField('Text2').addToPage(page, { x: 160, y: 765, width: 220, height: 18 });
  page.drawText('Grade Level:', { x: 50, y: 740, size: 11, font });
  const dd = form.createDropdown('Dropdown1');
  dd.addOptions(['Grade 4', 'Grade 5', 'Grade 6']);
  dd.addToPage(page, { x: 160, y: 735, width: 120, height: 18 });
  page.drawText('Parent consent', { x: 50, y: 710, size: 11, font });
  form.createCheckBox('CheckBox1').addToPage(page, { x: 160, y: 707, width: 12, height: 12 });
  page.drawText('Contact Number:', { x: 50, y: 680, size: 11, font });
  form.createTextField('Text3').addToPage(page, { x: 160, y: 675, width: 220, height: 18 });
  return pdf.save();
}

async function flatPdf() {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const page = pdf.addPage([612, 936]);
  page.drawText('PERMIT TO JOIN THE FIELD TRIP', { x: 150, y: 880, size: 14, font });
  page.drawText('Please fill out and return to the adviser.', { x: 50, y: 850, size: 11, font });
  page.drawText('Name: ______________________', { x: 50, y: 800, size: 11, font });
  page.drawText('Section:', { x: 50, y: 770, size: 11, font });
  page.drawText('Date: ..................', { x: 50, y: 740, size: 11, font });
  return pdf.save();
}

async function scannedPdf() {
  const w = 200;
  const h = 300;
  const data = Buffer.alloc(w * h * 4, 255);
  const img = new Uint8Array(jpeg.encode({ data, width: w, height: h }, 80).data);
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([612, 936]);
  page.drawImage(await pdf.embedJpg(img), { x: 0, y: 0, width: 612, height: 936 });
  return pdf.save();
}

async function pageText(bytes) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await pdfjs.getDocument({ data: bytes.slice(), isEvalSupported: false, verbosity: 0 }).promise;
  const items = (await (await doc.getPage(1)).getTextContent()).items;
  return items.map((it) => ({ str: it.str, x: Math.round(it.transform[4]), y: Math.round(it.transform[5]) }));
}

describe('fill a PDF form', () => {
  beforeEach(() => { resetTaskActionSupport(); clearAnswerMemory(); callGeminiProxy.mockReset(); });

  const run = async (ws, args, { boxes } = {}) => {
    callGeminiProxy.mockImplementation(async (req) => {
      const text = JSON.stringify(req.contents);
      if (text.includes('You are the planner')) return { text: JSON.stringify({ confidence: 'high', reply: 'Sige po.', tasks: [{ id: 't1', tool: 'fill_pdf_form', args }] }) };
      if (text.includes('scanned school form')) return { text: JSON.stringify({ fields: boxes || [] }) };
      return { text: '{}' };
    });
    return runDeskAgentTurn({ prompt: 'fill this pdf form', workspace: ws, user: { uid: 'u1' }, profile: { fullName: 'Ana Reyes', school: 'Dayap Elementary School' }, autoApprove: true });
  };

  it('fillable: text fields, a choice and a check box; labels read from the page; the rest listed', async () => {
    const ws = createVirtualWorkspace('Class');
    ws.handle.saveVirtualFile('Enrollment.pdf', await fillablePdf());
    ws.files = ws.handle.getFiles();
    const res = await run(ws, { path: 'Enrollment.pdf', values: { 'Name of Learner': 'SAMPLE LEARNER', 'Grade Level': 'grade 5', 'Parent consent': 'yes' } });
    expect(res.content).toMatch(/Filled 4 of 5 blank\(s\) in Enrollment \(KaTuro edit\)\.pdf\. Its form fields were filled/);
    expect(res.content).toMatch(/Left blank \(tell me what to put\): Contact Number\./);
    const file = res.createdFiles.find((f) => /KaTuro edit/.test(f.name));
    const form = (await PDFDocument.load(await readFileBytes(ws.handle, file.path))).getForm();
    expect([form.getTextField('Text1').getText(), form.getTextField('Text2').getText(), form.getDropdown('Dropdown1').getSelected(), form.getCheckBox('CheckBox1').isChecked(), form.getTextField('Text3').getText()])
      .toEqual(['SAMPLE LEARNER', 'Dayap Elementary School', ['Grade 5'], true, undefined]);
  });

  it('a choice that is not in the list is not forced in', async () => {
    const ws = createVirtualWorkspace('Class');
    ws.handle.saveVirtualFile('Enrollment.pdf', await fillablePdf());
    ws.files = ws.handle.getFiles();
    const res = await run(ws, { path: 'Enrollment.pdf', values: { 'Grade Level': 'Grade 9' } });
    expect(res.content).toMatch(/Not filled: Grade Level \("Grade 9" is not one of its choices \(Grade 4, Grade 5, Grade 6\)\)/);
  });

  it('flat PDF: values written on the blank lines', async () => {
    const ws = createVirtualWorkspace('Class');
    ws.handle.saveVirtualFile('Permit.pdf', await flatPdf());
    ws.files = ws.handle.getFiles();
    const res = await run(ws, { path: 'Permit.pdf', values: { Name: 'SAMPLE LEARNER', Section: 'Rizal' } });
    expect(res.content).toMatch(/Filled 3 of 3 blank\(s\).*The values were written on the blank lines/);
    const items = await pageText(await readFileBytes(ws.handle, res.createdFiles[0].path));
    const at = (s) => items.find((it) => it.str === s);
    const onLine = (it, y) => it && it.y >= y && it.y <= y + 3;          // just above the line's baseline
    expect(onLine(at('SAMPLE LEARNER'), 800)).toBe(true);              // on the Name line, after "Name: "
    expect(at('SAMPLE LEARNER').x).toBeGreaterThan(70);
    expect(onLine(at('Rizal'), 770)).toBe(true);
    expect(at('Rizal').x).toBeGreaterThan(90);                         // after "Section:"
    expect(items.some((it) => /^[A-Z][a-z]+ \d{1,2}, \d{4}$/.test(it.str) && onLine(it, 740))).toBe(true); // today's date
  });

  it('scanned PDF: blanks found by reading the page; values placed in those boxes and flagged to check', async () => {
    const ws = createVirtualWorkspace('Class');
    ws.handle.saveVirtualFile('Scan.pdf', await scannedPdf());
    ws.files = ws.handle.getFiles();
    const boxes = [{ label: 'Section', page: 1, box: [100, 300, 130, 700] }, { label: 'Guardian', page: 1, box: [150, 300, 180, 700] }];
    const res = await run(ws, { path: 'Scan.pdf', values: { Section: 'Rizal' } }, { boxes });
    expect(res.content).toMatch(/Filled 1 of 2 blank\(s\).*scanned form: I found the blanks by reading the page, so please check/);
    const items = await pageText(await readFileBytes(ws.handle, res.createdFiles[0].path));
    const r = items.find((it) => it.str === 'Rizal');
    expect(r.x).toBeGreaterThanOrEqual(183);                            // 300/1000 of 612
    expect(r.y).toBeGreaterThan(936 - 0.13 * 936 - 1);                  // inside the box
    expect(r.y).toBeLessThan(936 - 0.1 * 936);
  });

  it('boxes from the AI are checked; asks when nothing is known', async () => {
    expect(fieldsFromBoxes([{ label: 'Name', page: 1, box: [10, 10, 5, 50] }, { label: 'x', page: 1, box: [1, 1, 2, 2] }, { label: 'Age', page: 9, box: [1, 2, 3, 4000] }], [{ width: 612, height: 936 }])).toEqual([]);
    const ws = createVirtualWorkspace('Class');
    ws.handle.saveVirtualFile('Permit.pdf', await flatPdf());
    ws.files = ws.handle.getFiles();
    const res = await run(ws, { path: 'Permit.pdf' }, {});
    // Date comes from today, so it is not "nothing known": Name and Section are listed.
    expect(res.content).toMatch(/Left blank \(tell me what to put\): Name, Section\./);
  });
});
