/* global Buffer */
import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import mammoth from 'mammoth';
import { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, Header, ShadingType, VerticalMergeType } from 'docx';
import { applyTemplateEdits } from './docxTemplate';
import { buildDocxMap } from './docxMap';

/** A lesson plan template: own margins, fonts and sizes, a header, a shaded table. */
async function lessonPlanTemplate() {
  const doc = new Document({
    sections: [{
      properties: { page: { margin: { top: 1000, bottom: 1100, left: 1200, right: 900 } } },
      headers: { default: new Header({ children: [new Paragraph({ children: [new TextRun({ text: 'Sample National High School', font: 'Arial Narrow', size: 20 })] })] }) },
      children: [
        new Paragraph({ children: [new TextRun({ text: 'DETAILED LESSON PLAN IN SCIENCE 7', bold: true, font: 'Bookman Old Style', size: 28 })] }),
        new Paragraph({ children: [new TextRun({ text: 'I. Objectives', bold: true, font: 'Bookman Old Style', size: 24 })] }),
        new Paragraph({ children: [new TextRun({ text: 'Describe the parts of a cell.', font: 'Bookman Old Style', size: 22, italics: true })] }),
        new Table({
          rows: [
            new TableRow({ children: [
              new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: 'Teacher\'s Activity', bold: true, font: 'Calibri', size: 22 })] })], shading: { fill: 'C6E0B4', type: ShadingType.CLEAR, color: 'auto' } }),
              new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: 'Learners\' Activity', bold: true, font: 'Calibri', size: 22 })] })], shading: { fill: 'C6E0B4', type: ShadingType.CLEAR, color: 'auto' } }),
            ] }),
            new TableRow({ children: [
              new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: 'Show a picture of a cell.', font: 'Calibri', size: 22 })] })] }),
              new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: 'Name the parts.', font: 'Calibri', size: 22 })] })] }),
            ] }),
          ],
        }),
        new Paragraph({ children: [new TextRun({ text: 'Remove me', font: 'Bookman Old Style', size: 22 })] }),
        new Paragraph({ children: [new TextRun({ text: 'Prepared by: Teacher', font: 'Bookman Old Style', size: 22 })] }),
      ],
    }],
  });
  return new Uint8Array(await Packer.toBuffer(doc));
}

const docXml = async (bytes) => (await JSZip.loadAsync(bytes)).file('word/document.xml').async('string');
const text = async (bytes) => (await mammoth.extractRawText({ buffer: Buffer.from(bytes) })).value.replace(/\n+/g, '\n').trim();

describe('a new document from a copy of the teacher\'s template', () => {
  it('rewrites the content and keeps the template\'s margins, fonts, sizes, header and table design', async () => {
    const tpl = await lessonPlanTemplate();
    const map = await buildDocxMap(tpl);
    expect(map.blocks.map((b) => b.id)).toEqual(['p0', 'p1', 'p2', 't0', 'p3', 'p4']);

    const { bytes, applied, skipped } = await applyTemplateEdits(tpl, [
      { id: 'p0', text: 'DETAILED LESSON PLAN IN SCIENCE 8' },
      { id: 'p2', text: 'Explain photosynthesis.\nIdentify what plants need to make food.\nValue plants in the community.' },
      { id: 't0.r1', rows: [['Show a leaf.', 'Observe it.'], ['Ask what plants need.', 'Answer: light, water, air.'], ['Give the activity.', 'Do the activity.']] },
      { id: 'p3', remove: true },
    ]);
    expect(skipped).toEqual([]);
    expect(applied.map((a) => a.op)).toEqual(['text', 'text', 'rows:3', 'removed']);

    const out = await text(bytes);
    expect(out).toContain('DETAILED LESSON PLAN IN SCIENCE 8');
    expect(out).toContain('Explain photosynthesis.\nIdentify what plants need to make food.\nValue plants in the community.');
    expect(out).toContain('Ask what plants need.');
    expect(out).not.toContain('Remove me');
    expect(out).not.toContain('Describe the parts of a cell.');
    expect(out).toContain('Prepared by: Teacher');

    const before = await docXml(tpl);
    const after = await docXml(bytes);
    // Page margins (section properties) exactly as in the template.
    expect(after.match(/<w:pgMar[^>]*>/)[0]).toBe(before.match(/<w:pgMar[^>]*>/)[0]);
    // Every new objective line has the template's font, size and italics.
    const objective = /<w:p\b(?:(?!<\/w:p>).)*Identify what plants need(?:(?!<\/w:p>).)*<\/w:p>/s.exec(after)[0];
    expect(objective).toContain('w:ascii="Bookman Old Style"');
    expect(objective).toMatch(/<w:sz w:val="22"\/>/);
    expect(objective).toContain('<w:i/>');
    // Each new row is a copy of the model row: same font in its cells.
    const newRow = /<w:tr\b(?:(?!<\/w:tr>).)*Ask what plants need(?:(?!<\/w:tr>).)*<\/w:tr>/s.exec(after)[0];
    expect(newRow).toContain('w:ascii="Calibri"');
    expect((after.match(/<w:tr\b/g) || []).length).toBe(4);
    // The header, styles and everything else in the file are untouched.
    const a = await JSZip.loadAsync(tpl);
    const b = await JSZip.loadAsync(bytes);
    for (const name of Object.keys(a.files).filter((n) => n !== 'word/document.xml' && !a.files[n].dir)) {
      expect(await b.file(name).async('string')).toBe(await a.file(name).async('string'));
    }
  });

  it('a cell keeps one paragraph, and unknown ids are reported, not guessed', async () => {
    const tpl = await lessonPlanTemplate();
    const { bytes, skipped, applied } = await applyTemplateEdits(tpl, [
      { id: 't0.r1.c0.p0', remove: true },
      { id: 'p99', text: 'x' },
      { id: 'p1', rows: [['x']] },
      { id: 't0.r1.c0', text: 'overlaps the removed paragraph' },
    ]);
    expect(applied).toEqual([{ id: 't0.r1.c0.p0', op: 'emptied' }]);
    expect(skipped.map((s) => s.reason)).toEqual(['notFound', 'notARow', 'overlap']);
    expect(await text(bytes)).not.toContain('Show a picture of a cell.');
  });

  it('header text can be changed too; a whole table can go', async () => {
    const tpl = await lessonPlanTemplate();
    const { bytes, skipped } = await applyTemplateEdits(tpl, [{ id: 'h1:p0', text: 'Another National High School' }, { id: 't0', remove: true }]);
    expect(skipped).toEqual([]);
    const z = await JSZip.loadAsync(bytes);
    const header = Object.keys(z.files).find((n) => /word\/header\d*\.xml/.test(n));
    expect(await z.file(header).async('string')).toContain('Another National High School');
    expect(await text(bytes)).not.toContain('Teacher\'s Activity');
  });
});

describe('the copy is always a valid Word file', () => {
  async function tricky() {
    const doc = new Document({
      sections: [{
        headers: { default: new Header({ children: [new Paragraph('Only header line')] }) },
        children: [
          new Paragraph('Intro'),
          new Table({
            rows: [
              new TableRow({ children: [new TableCell({ children: [new Paragraph('First line'), new Paragraph('Second line')] }), new TableCell({ children: [new Paragraph('B')] })] }),
              new TableRow({ children: [new TableCell({ children: [new Paragraph('Merged')], verticalMerge: VerticalMergeType.RESTART }), new TableCell({ children: [new Paragraph('C')] })] }),
              new TableRow({ children: [new TableCell({ children: [new Paragraph('')], verticalMerge: VerticalMergeType.CONTINUE }), new TableCell({ children: [new Paragraph('D')] })] }),
            ],
          }),
          new Paragraph('Last'),
        ],
      }],
    });
    return new Uint8Array(await Packer.toBuffer(doc));
  }
  const cells = (xml) => xml.match(/<w:tc>.*?<\/w:tc>/gs) || [];

  it('a cell keeps a paragraph even when all of them are removed', async () => {
    const { bytes, applied } = await applyTemplateEdits(await tricky(), [{ id: 't0.r0.c0.p0', remove: true }, { id: 't0.r0.c0.p1', remove: true }]);
    expect(applied.map((a) => a.op)).toEqual(['removed', 'emptied']);
    for (const c of cells(await docXml(bytes))) expect(c).toMatch(/<w:p[ >]/);
  });

  it('a table whose rows would all go is removed whole', async () => {
    const { bytes, applied } = await applyTemplateEdits(await tricky(), [{ id: 't0.r0', remove: true }, { id: 't0.r1', remove: true }, { id: 't0.r2', rows: [] }]);
    expect(applied).toEqual([{ id: 't0', op: 'removed' }]);
    expect(await docXml(bytes)).not.toContain('<w:tbl>');
  });

  it('the last paragraph of a header and of the document are emptied, not removed', async () => {
    const tpl = await tricky();
    const { bytes, applied } = await applyTemplateEdits(tpl, [{ id: 'h1:p0', remove: true }, { id: 'p1', remove: true }, { id: 'p0', remove: true }]);
    expect(applied.map((a) => a.op)).toEqual(['emptied', 'emptied', 'removed']);
    const z = await JSZip.loadAsync(bytes);
    const header = Object.keys(z.files).find((n) => /word\/header\d*\.xml/.test(n));
    expect(await z.file(header).async('string')).toMatch(/<w:p[ >]/);
    expect(await text(bytes)).not.toContain('Last');
  });

  it('copies of a merged row do not join the merge', async () => {
    const { bytes } = await applyTemplateEdits(await tricky(), [{ id: 't0.r1', rows: [['M1', 'x'], ['M2', 'y'], ['M3', 'z']] }]);
    const xml = await docXml(bytes);
    expect((xml.match(/<w:vMerge/g) || []).length).toBe(2); // the model row's restart and the original continue
  });
});
