import { describe, it, expect } from 'vitest';
import { Document, Packer, Paragraph, HeadingLevel, Table, TableRow, TableCell, TextRun } from 'docx';
import * as XLSX from 'xlsx';
import PptxGenJS from 'pptxgenjs';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { readDocument, describeParsed, SUPPORTED_EXTENSIONS, stripRtf } from './index.js';

const enc = (s) => new TextEncoder().encode(s);
const cell = (text) => new TableCell({ children: [new Paragraph({ children: [new TextRun(text)] })] });

async function makeDocx() {
  const doc = new Document({
    sections: [{
      children: [
        new Paragraph({ text: 'Lesson Plan in Science 7', heading: HeadingLevel.HEADING_1 }),
        new Paragraph({ children: [new TextRun('The learners identify the parts of a cell.')] }),
        new Table({
          rows: [
            new TableRow({ children: [cell('Name'), cell('Score')] }),
            new TableRow({ children: [cell('Dela Cruz, Juan'), cell('25')] }),
          ],
        }),
      ],
    }],
  });
  return new Uint8Array(await Packer.toBuffer(doc));
}

async function makePdf(pageTexts) {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  for (const text of pageTexts) {
    const page = pdf.addPage([400, 400]);
    if (text) page.drawText(text, { x: 20, y: 350, size: 10, font });
  }
  return pdf.save();
}

describe('readDocument', () => {
  it('reads a docx with heading, paragraph and table', async () => {
    const parsed = await readDocument({ bytes: await makeDocx(), name: 'plan.docx' });
    expect(parsed.kind).toBe('docx');
    expect(parsed.text).toContain('Lesson Plan in Science 7');
    expect(parsed.text).toContain('parts of a cell');
    expect(parsed.tables).toHaveLength(1);
    expect(parsed.tables[0].rows).toEqual([['Name', 'Score'], ['Dela Cruz, Juan', '25']]);
    expect(parsed.html).toContain('<h1>');
    expect(parsed.meta.wordCount).toBeGreaterThan(5);
    expect(parsed.needsVision).toBe(false);
    expect(describeParsed(parsed)).toContain('Word document');
    expect(describeParsed(parsed)).toContain('1 table');
  });

  it('reads an xlsx with numbers preserved and trailing blanks trimmed', async () => {
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([
      ['Grade 7 - Rizal'],
      [],
      ['Name', 'Score', null],
      ['Dela Cruz, Juan', 25],
      ['Santos, Maria', 28.5],
    ]);
    XLSX.utils.book_append_sheet(wb, ws, 'Grade 7 - Rizal');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Date', new Date(2026, 5, 15)]], { cellDates: true }), 'Dates');
    const bytes = new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }));
    const parsed = await readDocument({ bytes, name: 'class.xlsx' });
    expect(parsed.kind).toBe('xlsx');
    expect(parsed.sheets).toHaveLength(2);
    const s = parsed.sheets[0];
    expect(s.name).toBe('Grade 7 - Rizal');
    expect(s.rows[0]).toEqual(['Grade 7 - Rizal']);
    expect(s.rows[1]).toEqual([]);
    expect(s.rows[3]).toEqual(['Dela Cruz, Juan', 25]);
    expect(s.rows[4][1]).toBe(28.5);
    expect(s.rowCount).toBe(5);
    expect(s.colCount).toBe(2);
    expect(parsed.sheets[1].rows[0][1]).toBe('2026-06-15');
    expect(parsed.text).toContain('Dela Cruz, Juan\t25');
    expect(parsed.meta.sheetCount).toBe(2);
    expect(describeParsed(parsed)).toBe('Excel workbook · 2 sheets (Grade 7 - Rizal: 5 rows; Dates: 1 row)');
  });

  it('caps sheet text at 500 rows per sheet', async () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(Array.from({ length: 520 }, (_, i) => [i])), 'Big');
    const parsed = await readDocument({ bytes: new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xlsx' })), name: 'big.xlsx' });
    expect(parsed.sheets[0].rowCount).toBe(520);
    expect(parsed.text).toContain('(… 20 more rows)');
  });

  it('reads csv and tsv', async () => {
    const csv = await readDocument({ bytes: enc('﻿Name,Score\nSantos, 1\n"Reyes, Ana",30\n'), name: 'scores.csv' });
    expect(csv.kind).toBe('csv');
    expect(csv.sheets[0].rows[0]).toEqual(['Name', 'Score']);
    expect(csv.sheets[0].rows[2]).toEqual(['Reyes, Ana', 30]);
    const tsv = await readDocument({ bytes: enc('Name\tScore\nAna Reyes\t12\n'), name: 'scores.tsv' });
    expect(tsv.sheets[0].rows[1]).toEqual(['Ana Reyes', 12]);
  });

  it('reads a pptx with ordered slides, titles and notes', async () => {
    const pres = new PptxGenJS();
    const s1 = pres.addSlide();
    s1.addText('Photosynthesis', { x: 0.5, y: 0.3, w: 9, h: 1 });
    s1.addText('Plants make food using sunlight.', { x: 0.5, y: 1.5, w: 9, h: 1 });
    s1.addNotes('Ask learners about plants at home.');
    const s2 = pres.addSlide();
    s2.addText('Summary', { x: 0.5, y: 0.3, w: 9, h: 1 });
    s2.addText('Chlorophyll captures light.', { x: 0.5, y: 1.5, w: 9, h: 1 });
    s2.addNotes('Give the quiz.');
    const bytes = new Uint8Array(await pres.write({ outputType: 'uint8array' }));
    const parsed = await readDocument({ bytes, name: 'lesson.pptx' });
    expect(parsed.kind).toBe('pptx');
    expect(parsed.slides).toHaveLength(2);
    expect(parsed.slides[0]).toMatchObject({ number: 1, title: 'Photosynthesis', notes: 'Ask learners about plants at home.' });
    expect(parsed.slides[0].text).toContain('Plants make food');
    expect(parsed.slides[1]).toMatchObject({ number: 2, title: 'Summary', notes: 'Give the quiz.' });
    expect(parsed.text).toContain('Slide 2: Summary');
    expect(parsed.meta.slideCount).toBe(2);
    expect(describeParsed(parsed)).toBe('PowerPoint presentation · 2 slides');
  });

  it('extracts pdf text per page', async () => {
    const bytes = await makePdf([
      'Page one: The learners will identify the parts of a plant cell today.',
      'Page two: Assessment covers the cell membrane and the cell wall functions.',
    ]);
    const parsed = await readDocument({ bytes, name: 'notes.pdf' });
    expect(parsed.kind).toBe('pdf');
    expect(parsed.warnings).toEqual([]);
    expect(parsed.pages).toHaveLength(2);
    expect(parsed.pages[0].text).toContain('parts of a plant cell');
    expect(parsed.pages[1].text).toContain('cell membrane');
    expect(parsed.needsVision).toBe(false);
    expect(parsed.meta.pageCount).toBe(2);
    expect(parsed.text).toContain('--- Page 2 ---');
    expect(bytes.byteLength).toBeGreaterThan(0); // caller's bytes are not detached
  });

  it('flags a text-less (scanned) pdf for vision', async () => {
    const bytes = await makePdf(['']);
    const parsed = await readDocument({ bytes, name: 'scan.pdf' });
    expect(parsed.kind).toBe('pdf');
    expect(parsed.needsVision).toBe(true);
    expect(parsed.vision.mimeType).toBe('application/pdf');
    expect(atob(parsed.vision.base64).slice(0, 5)).toBe('%PDF-');
    expect(describeParsed(parsed)).toContain('needs AI vision');
  });

  it('treats images as needing vision', async () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d]);
    const parsed = await readDocument({ bytes: png, name: 'photo.PNG' });
    expect(parsed.kind).toBe('image');
    expect(parsed.needsVision).toBe(true);
    expect(parsed.vision).toEqual({ mimeType: 'image/png', base64: 'iVBORw0KGgoAAAAN' });
  });

  it('falls back to mimeType when the name has no extension', async () => {
    const parsed = await readDocument({ bytes: enc('hello world'), name: 'pasted', mimeType: 'text/plain' });
    expect(parsed.kind).toBe('text');
    expect(parsed.text).toBe('hello world');
  });

  it('reads text and rtf', async () => {
    const md = await readDocument({ bytes: enc('﻿# Title\nBody'), name: 'a.md' });
    expect(md.text).toBe('# Title\nBody');
    const rtf = await readDocument({ bytes: enc('{\\rtf1\\ansi{\\fonttbl\\f0\\fswiss Helvetica;}\\f0\\pard Hello \\b World\\b0\\par Next line \\{x\\}}'), name: 'a.rtf' });
    expect(rtf.kind).toBe('text');
    expect(rtf.text).toBe('Hello World\nNext line {x}');
    expect(stripRtf('{\\rtf1 caf\\\'e9}')).toBe('café');
  });

  it('rejects legacy .doc / .ppt with a friendly warning', async () => {
    const doc = await readDocument({ bytes: new Uint8Array([0xd0, 0xcf, 0x11, 0xe0]), name: 'old.doc' });
    expect(doc.kind).toBe('unsupported');
    expect(doc.warnings[0]).toMatch(/re-save as \.docx/);
    const ppt = await readDocument({ bytes: new Uint8Array([1]), name: 'old.ppt' });
    expect(ppt.warnings[0]).toMatch(/\.pptx/);
  });

  it('never throws on corrupt or unknown files', async () => {
    const bad = await readDocument({ bytes: enc('not a zip at all'), name: 'broken.docx' });
    expect(bad.kind).toBe('unsupported');
    expect(bad.warnings.length).toBeGreaterThan(0);
    const badPdf = await readDocument({ bytes: enc('garbage'), name: 'broken.pdf' });
    expect(badPdf.warnings.length).toBeGreaterThan(0);
    const badPptx = await readDocument({ bytes: enc('garbage'), name: 'broken.pptx' });
    expect(badPptx.kind).toBe('unsupported');
    const unknown = await readDocument({ bytes: enc('x'), name: 'file.exe' });
    expect(unknown.kind).toBe('unsupported');
    const empty = await readDocument({ bytes: new Uint8Array(0), name: 'empty.docx' });
    expect(empty.warnings.length).toBe(1);
  });

  it('exports supported extensions', () => {
    expect(SUPPORTED_EXTENSIONS).toEqual(expect.arrayContaining(['docx', 'xlsx', 'csv', 'pptx', 'pdf', 'png', 'txt', 'rtf']));
    expect(SUPPORTED_EXTENSIONS).not.toContain('doc');
  });
});
