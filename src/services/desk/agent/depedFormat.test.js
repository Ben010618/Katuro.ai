import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Buffer } from 'node:buffer';
import fs from 'node:fs';
import process from 'node:process';
import PizZip from 'pizzip';
import { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, ImageRun } from 'docx';
import { callGeminiProxy } from '../../geminiConfig';
import { runDeskAgentTurn, clearAnswerMemory } from './deskAgent';
import { resetTaskActionSupport } from './llm';
import { createVirtualWorkspace, readFileBytes } from '../../localFileSystem';
import { paperName } from '../generators/depedFormat';

vi.mock('../../geminiConfig', () => ({ callGeminiProxy: vi.fn() }));

// 1x1 PNG
const PNG = Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64'));

async function messyDoc({ withSignatures = false } = {}) {
  const cell = (t, w) => new TableCell({ width: { size: w, type: WidthType.DXA }, children: [new Paragraph(t)] });
  const doc = new Document({
    sections: [{
      properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } } },
      children: [
        new Paragraph({ children: [new TextRun({ text: 'ACTIVITY SHEET IN SCIENCE 5', font: 'Calibri', size: 32, bold: true })] }),
        new Paragraph({ children: [new TextRun({ text: 'Read each item carefully. ', font: 'Times New Roman', size: 24 }), new TextRun({ text: 'Answer on the space provided.', font: 'Calibri', size: 24 })] }),
        new Paragraph({ children: [new TextRun({ text: '', font: 'Wingdings', size: 24 }), new TextRun({ text: ' Done', size: 24 })] }),
        new Table({ width: { size: 11000, type: WidthType.DXA }, columnWidths: [5500, 5500], rows: [new TableRow({ children: [cell('Item', 5500), cell('Answer', 5500)] })] }),
        new Paragraph({ children: [new ImageRun({ data: PNG, type: 'png', transformation: { width: 800, height: 400 } })] }),
        ...(withSignatures ? [new Paragraph('Prepared by:'), new Paragraph('ANA REYES')] : []),
      ],
    }],
  });
  return new Uint8Array(await Packer.toArrayBuffer(doc));
}

describe('DepEd formatting fix in one step', () => {
  beforeEach(() => { resetTaskActionSupport(); clearAnswerMemory(); callGeminiProxy.mockReset(); });

  const run = async (ws, args, profile = { fullName: 'Ana Reyes', school: 'Dayap Elementary School', region: 'Region IV-A CALABARZON', division: 'Division of Laguna' }) => {
    callGeminiProxy.mockImplementation(async () => ({ text: JSON.stringify({ confidence: 'high', reply: 'Sige po.', tasks: [{ id: 't1', tool: 'deped_format_docx', args }] }) }));
    return runDeskAgentTurn({ prompt: 'format this to DepEd long bond with the letterhead and signatories', workspace: ws, user: { uid: 'u1' }, profile, autoApprove: true });
  };

  it('long bond, margins, one font, body size, tables and pictures fitted, letterhead and signatures; original untouched', async () => {
    const ws = createVirtualWorkspace('Class');
    const original = await messyDoc();
    ws.handle.saveVirtualFile('Activity Sheet.docx', original);
    ws.files = ws.handle.getFiles();
    const res = await run(ws, { path: 'Activity Sheet.docx', size: 11, letterhead: true, signatures: true });
    expect(res.content).toMatch(/Formatted Activity Sheet \(KaTuro edit\)\.docx: paper A4 → Long bond \(8\.5" x 13"\); margins 1"\/1"\/1"\/1" \(top\/right\/bottom\/left\) → 0\.5" top, 0\.5" bottom, 0\.6" left, 0\.6" right; font (Calibri, Times New Roman|Times New Roman, Calibri)[^;]* → Arial; body text 12 pt → 11 pt \(headings keep their sizes\); 1 table\(s\) narrowed to fit the page; 1 picture\(s\) scaled down to fit the page; DepEd letterhead added \(5 lines\); signature block added \(Prepared by\)/);
    expect(res.content).toMatch(/The font and margins follow KaTuroDesk's DepEd layout; tell me if your school uses others/);
    const file = res.createdFiles.find((f) => /KaTuro edit/.test(f.name));
    const bytes = await readFileBytes(ws.handle, file.path);
    if (process.env.KT_FORMAT_OUT) fs.writeFileSync(process.env.KT_FORMAT_OUT, bytes);
    const zip = new PizZip(bytes);
    const doc = zip.file('word/document.xml').asText();
    expect(doc).toMatch(/<w:pgSz w:w="12240" w:h="18720"\/>/);
    expect(doc).toMatch(/<w:pgMar w:top="720" w:right="864" w:bottom="720" w:left="864"/);
    const fonts = [...doc.matchAll(/<w:rFonts w:ascii="([^"]+)"/g)].map((x) => x[1]);
    expect(new Set(fonts)).toEqual(new Set(['Arial', 'Wingdings']));                  // symbol font kept
    expect(zip.file('word/styles.xml').asText()).toMatch(/<w:rPrDefault><w:rPr><w:rFonts w:ascii="Arial"/);
    expect(doc).toContain('<w:sz w:val="32"/>');                                      // title size kept
    expect(doc).not.toContain('<w:sz w:val="24"/>');                                  // body 12 pt → 11 pt
    const grid = [...doc.matchAll(/<w:gridCol w:w="(\d+)"\/>/g)].map((x) => Number(x[1]));
    expect(grid[0] + grid[1]).toBeLessThanOrEqual(12240 - 864 * 2);
    const cx = Number(doc.match(/<wp:extent cx="(\d+)"/)[1]);
    expect(cx).toBeLessThanOrEqual((12240 - 864 * 2) * 635);
    const text = doc.replace(/<\/w:p>/g, '\n').replace(/<[^>]+>/g, '');
    expect(text.trim().split('\n').slice(0, 6)).toEqual(['Republic of the Philippines', 'Department of Education', 'REGION IV-A CALABARZON', 'DIVISION OF LAGUNA', 'DAYAP ELEMENTARY SCHOOL', 'ACTIVITY SHEET IN SCIENCE 5']);
    expect(text).toMatch(/Prepared by:\nANA REYES\n/);
    expect(doc.lastIndexOf('Prepared by:')).toBeLessThan(doc.lastIndexOf('<w:sectPr'));  // before the page settings
    const mod = await import('mammoth');
    const html = (await (mod.default || mod).convertToHtml({ buffer: Buffer.from(bytes) })).value;
    expect(html).toContain('Answer on the space provided.');                          // content unchanged
    expect(Buffer.from(await readFileBytes(ws.handle, 'Activity Sheet.docx')).equals(Buffer.from(original))).toBe(true);
  });

  it('teacher\'s own margins and font; does not add a second signature block or letterhead', async () => {
    const ws = createVirtualWorkspace('Class');
    ws.handle.saveVirtualFile('Letter.docx', await messyDoc({ withSignatures: true }));
    ws.files = ws.handle.getFiles();
    const res = await run(ws, { path: 'Letter.docx', margins: 1, font: 'Bookman Old Style', signatures: true });
    expect(res.content).toMatch(/margins [^;]*→ 1" all around; font [^;]*→ Bookman Old Style/);
    expect(res.content).toMatch(/it already has a signature block/);
    expect(res.content).not.toMatch(/follow KaTuroDesk's DepEd layout/);
    const doc = new PizZip(await readFileBytes(ws.handle, res.createdFiles[0].path)).file('word/document.xml').asText();
    expect(doc.match(/Prepared by:/g)).toHaveLength(1);
    expect(doc).toMatch(/<w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/);
  });

  it('asks instead of guessing: no signatories in the profile, odd margins, old .doc', async () => {
    const ws = createVirtualWorkspace('Class');
    ws.handle.saveVirtualFile('A.docx', await messyDoc());
    ws.handle.saveVirtualFile('Old.doc', new Uint8Array([1]));
    ws.files = ws.handle.getFiles();
    const a = await run(ws, { path: 'A.docx', signatures: true }, { school: 'Dayap ES' });
    expect(a.content).toMatch(/Needs your input.*Your profile has no signatories yet/);
    clearAnswerMemory();
    const b = await run(ws, { path: 'A.docx', margins: 7 });
    expect(b.content).toMatch(/Needs your input.*margin of 7 inch does not look right/);
    clearAnswerMemory();
    const c = await run(ws, { path: 'Old.doc' });
    expect(c.content).toMatch(/Save As \.docx first/);
    expect(paperName(12240, 18720)).toBe('long');
    expect(paperName(16838, 11906)).toBe('a4');
  });
});
