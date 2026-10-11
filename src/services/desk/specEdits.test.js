import { describe, it, expect } from 'vitest';
import { normalizeDocumentSpec } from './docSpec';
import {
  setBlockStyle, shiftIndent, marginPresetOf, setMargins, setPage, setFont, insertBlock, addColumn, deleteColumn,
  findReplace, countMatches, emptyHistory, record, undo, redo,
} from './specEdits';
import { buildHtml } from './generators/htmlFromSpec';
import { buildDocx } from './generators/docxFromSpec';
import JSZip from 'jszip';

const base = () => normalizeDocumentSpec({
  title: 'Quarterly Report', subtitle: 'Grade 7 report', paper: 'long',
  meta: [{ label: 'Section', value: 'Grade 7 - Rizal' }],
  blocks: [
    { type: 'heading', level: 2, text: 'Grade 7 results' },
    { type: 'paragraph', text: 'The grade 7 learners did well.' },
    { type: 'bullets', items: ['Grade 7 A', 'Grade 8 B'] },
    { type: 'table', columns: ['Grade', 'Score'], rows: [['Grade 7', '90']] },
    { type: 'questions', items: [{ question: 'Which grade?', choices: ['Grade 7', 'Grade 9'], answer: 'Grade 7' }] },
  ],
});

describe('Canvas editor changes', () => {
  it('formatting: set, clear and keep only valid values; nothing else in the block changes', () => {
    const p = base().blocks[1];
    let b = setBlockStyle(p, { align: 'justify', firstLine: 0.5, bold: true, lineSpacing: 1.5 });
    expect(b).toEqual({ type: 'paragraph', text: p.text, style: { align: 'justify', firstLine: 0.5, lineSpacing: 1.5, bold: true } });
    b = setBlockStyle(b, { bold: false, align: 'left', size: 99 });
    expect(b.style).toEqual({ firstLine: 0.5, lineSpacing: 1.5 });
    b = setBlockStyle(b, { firstLine: null, lineSpacing: null });
    expect(b).toEqual(p);
    expect(p.style).toBeUndefined();
    expect(shiftIndent(shiftIndent(p, 0.5), 0.5).style).toEqual({ indent: 1 });
    expect(shiftIndent(shiftIndent(p, 0.5), -1).style).toBeUndefined();
  });

  it('page setup: margins presets, refused margins, paper changes, font', () => {
    const s = base();
    expect(marginPresetOf(s.margins)).toBe('katuro');
    const one = setMargins(s, { top: 1, bottom: 1, left: 1, right: 1 });
    expect(one.margins).toEqual({ top: 1, bottom: 1, left: 1, right: 1 });
    expect(marginPresetOf(one.margins)).toBe('normal');
    expect(setMargins(s, { top: 1, bottom: 1, left: 0.6, right: 0.6 }).margins).toEqual({ top: 1, bottom: 1, left: 0.6, right: 0.6 });
    expect(marginPresetOf({ top: 1, bottom: 1, left: 0.6, right: 0.6 })).toBe('custom');
    expect(setMargins(s, { top: 0.5, bottom: 0.5, left: 0.6, right: 0.6 }).margins).toBeUndefined(); // back to KaTuro's
    expect(setMargins(s, { top: 1, bottom: 1, left: 3, right: 'x' })).toBeNull();
    expect(setPage(one, { paper: 'a4', orientation: 'landscape' })).toMatchObject({ paper: 'a4', orientation: 'landscape', margins: one.margins });
    expect(setFont(s, { family: 'Times New Roman' }).font).toEqual({ family: 'Times New Roman', size: 11 });
    expect(setFont(setFont(s, { size: 12 }), { size: 11 }).font).toBeUndefined();
  });

  it('insert blocks and edit table columns', () => {
    const s = insertBlock(base(), 0, 'table');
    expect(s.blocks[1]).toEqual({ type: 'table', columns: ['Column 1', 'Column 2', 'Column 3'], rows: [['', '', ''], ['', '', '']] });
    expect(insertBlock(base(), 4, 'pageBreak').blocks[5]).toEqual({ type: 'pageBreak' });
    expect(insertBlock(base(), 1, 'numbered').blocks[2]).toMatchObject({ type: 'bullets', ordered: true });
    const t = { type: 'table', columns: ['A', 'B'], rows: [['1', '2']], widths: [1, 2] };
    expect(addColumn(t, 0)).toEqual({ type: 'table', columns: ['A', 'Column 3', 'B'], rows: [['1', '', '2']] });
    expect(deleteColumn(t, 0)).toEqual({ type: 'table', columns: ['B'], rows: [['2']], widths: [2] });
    expect(deleteColumn(deleteColumn(t, 0), 0).columns).toEqual(['B']);
  });

  it('find and replace everywhere the teacher sees text', () => {
    const s = base();
    expect(countMatches(s, 'grade 7')).toBe(8);
    expect(countMatches(s, 'grade 7', { matchCase: true })).toBe(1);
    const { spec, count } = findReplace(s, 'Grade 7', 'Grade 8');
    expect(count).toBe(8);
    expect(JSON.stringify(spec)).not.toMatch(/grade 7/i);
    expect(spec.blocks[4].items[0]).toEqual({ question: 'Which grade?', choices: ['Grade 8', 'Grade 9'], answer: 'Grade 8' });
    expect(findReplace(s, 'grade', 'year', { wholeWord: true }).spec.title).toBe('Quarterly Report');
    expect(findReplace(s, 'a.b', 'x').count).toBe(0); // the dot is a dot, not "any letter"
    expect(s.blocks[1].text).toBe('The grade 7 learners did well.'); // the original is untouched
  });

  it('undo and redo; quick typing is one step', () => {
    let h = emptyHistory();
    h = record(h, 'A', 1000);
    h = record(h, 'A2', 1300); // merged with the step before
    h = record(h, 'B', 3000);
    expect(h.past).toEqual(['A', 'B']);
    const u1 = undo(h, 'C');
    expect(u1.spec).toBe('B');
    const u2 = undo(u1.history, 'B');
    expect(u2.spec).toBe('A');
    expect(undo(u2.history, 'A')).toBeNull();
    const r1 = redo(u2.history, 'A');
    expect(r1.spec).toBe('B');
    expect(redo(redo(r1.history, 'B').history, 'C')).toBeNull();
  });

  it('formatting reaches the preview and the Word file', async () => {
    let s = setMargins(base(), { top: 1, bottom: 1, left: 1.25, right: 1 });
    s = setFont(s, { family: 'Times New Roman', size: 12 });
    s = { ...s, blocks: s.blocks.map((b, i) => (i === 1 ? setBlockStyle(b, { align: 'justify', firstLine: 0.5, lineSpacing: 2, italic: true, underline: true }) : i === 0 ? setBlockStyle(b, { align: 'center' }) : b)) };
    const html = buildHtml(s, { forPrint: true });
    expect(html).toContain('margin: 1in 1in 1in 1.25in');
    expect(html).toContain("font-family: 'Times New Roman'");
    expect(html).toContain('<p style="text-align:justify;text-indent:0.5in;line-height:2.34;font-style:italic;text-decoration:underline">');
    expect(html).toContain('<h3 class="h2" style="text-align:center">');
    const xml = await (await JSZip.loadAsync(await buildDocx(s))).file('word/document.xml').async('string');
    expect(xml).toMatch(/<w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1800"/);
    expect(xml).toContain('<w:jc w:val="both"/>');
    expect(xml).toMatch(/<w:ind w:left="0" w:firstLine="720"\/>/);
    expect(xml).toMatch(/w:line="480"/);
    expect(xml).toContain('<w:u w:val="single"/>');
    expect(xml).toContain('w:ascii="Times New Roman"');
    // A hanging indent keeps the first line at the margin and the rest moved in.
    const hang = setBlockStyle(base().blocks[1], { firstLine: -0.5 });
    expect(buildHtml({ ...base(), blocks: [hang] })).toContain('style="margin-left:0.50in;text-indent:-0.5in"');
    const hx = await (await JSZip.loadAsync(await buildDocx({ ...base(), blocks: [hang] }))).file('word/document.xml').async('string');
    expect(hx).toMatch(/<w:ind w:left="720" w:hanging="720"\/>/);
  });
});
