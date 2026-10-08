import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Buffer } from 'node:buffer';
import fs from 'node:fs';
import process from 'node:process';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { callGeminiProxy } from '../../geminiConfig';
import { runDeskAgentTurn, clearAnswerMemory } from './deskAgent';
import { resetTaskActionSupport } from './llm';
import { createVirtualWorkspace, readFileBytes } from '../../localFileSystem';
import { parsePages } from '../generators/pdfPages';

vi.mock('../../geminiConfig', () => ({ callGeminiProxy: vi.fn() }));

const PNG = Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64'));

async function fourPages() {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  for (const n of ['A', 'B', 'C', 'D']) pdf.addPage([612, 936]).drawText(`Lesson page ${n}`, { x: 60, y: 860, size: 16, font });
  return pdf.save();
}

/** Each page: its label, turn, and every text piece at its SEEN position (0,0 = top-left). */
async function inspect(bytes) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await pdfjs.getDocument({ data: bytes.slice(), isEvalSupported: false, verbosity: 0 }).promise;
  const out = [];
  for (let p = 1; p <= doc.numPages; p += 1) {
    const page = await doc.getPage(p);
    const vp = page.getViewport({ scale: 1 });
    const items = (await page.getTextContent()).items.map((it) => {
      const [X, Y] = vp.convertToViewportPoint(it.transform[4], it.transform[5]);
      return { str: it.str, X: Math.round(X), Y: Math.round(Y) };
    });
    const ops = await page.getOperatorList();
    out.push({ rotate: page.rotate, W: Math.round(vp.width), H: Math.round(vp.height), items, images: ops.fnArray.filter((f) => f === pdfjs.OPS.paintImageXObject).length });
  }
  return out;
}

describe('PDF page tools', () => {
  beforeEach(() => { resetTaskActionSupport(); clearAnswerMemory(); callGeminiProxy.mockReset(); });

  const run = async (ws, args) => {
    callGeminiProxy.mockImplementation(async () => ({ text: JSON.stringify({ confidence: 'high', reply: 'Sige po.', tasks: [{ id: 't1', tool: 'pdf_page_tools', args }] }) }));
    return runDeskAgentTurn({ prompt: 'fix the pages of my pdf', workspace: ws, user: { uid: 'u1' }, profile: { fullName: 'Ana Reyes' }, autoApprove: true });
  };

  it('page lists', () => {
    expect(parsePages('1,3-5', 6).pages).toEqual([1, 3, 4, 5]);
    expect(parsePages('even', 5).pages).toEqual([2, 4]);
    expect(parsePages('2-last', 4).pages).toEqual([2, 3, 4]);
    expect(parsePages('7', 4).error).toMatch(/page 7 is not in this 4-page PDF/);
  });

  it('remove, reorder, turn, number, watermark and logo in one go; stamps sit right on the turned page', async () => {
    const ws = createVirtualWorkspace('Class');
    ws.handle.saveVirtualFile('Module.pdf', await fourPages());
    ws.handle.saveVirtualFile('logo.png', PNG);
    ws.files = ws.handle.getFiles();
    const res = await run(ws, { path: 'Module.pdf', remove: '2', order: '4,1,3', rotate: { pages: '3', degrees: 90 }, pageNumbers: {}, watermark: 'DRAFT', logoPath: 'logo.png' });
    expect(res.content).toMatch(/Made Module \(KaTuro edit\)\.pdf \(3 pages\): removed page 2; pages now in the order 4, 1, 3; turned page 3 by 90°; page numbers \(Page 1 of 3 …\) at the bottom center; "DRAFT" watermark on every page; logo at the top left of every page\. Warning: the logo covers some text on pages 1, 2; ask me to put it at the top right/);
    const bytes = await readFileBytes(ws.handle, res.createdFiles[0].path);
    if (process.env.KT_PAGES_OUT) fs.writeFileSync(process.env.KT_PAGES_OUT, bytes);
    const pages = await inspect(bytes);
    expect(pages.map((p) => p.items.find((i) => /Lesson page/.test(i.str)).str)).toEqual(['Lesson page D', 'Lesson page A', 'Lesson page C']);
    expect(pages.map((p) => p.rotate)).toEqual([0, 0, 90]);
    expect(pages[2]).toMatchObject({ W: 936, H: 612 });                       // seen as landscape
    pages.forEach((p, i) => {
      const num = p.items.find((it) => it.str === `Page ${i + 1} of 3`);
      expect(num.Y).toBeGreaterThan(p.H - 40);                                 // at the bottom as seen
      expect(Math.abs(num.X - p.W / 2)).toBeLessThan(40);                      // centred as seen
      const mark = p.items.find((it) => it.str === 'DRAFT');
      expect(mark).toBeTruthy();
      expect(p.images).toBe(1);                                                // the logo
    });
  });

  it('a logo in a free corner gives no warning', async () => {
    const ws = createVirtualWorkspace('Class');
    ws.handle.saveVirtualFile('Module.pdf', await fourPages());
    ws.handle.saveVirtualFile('logo.png', PNG);
    ws.files = ws.handle.getFiles();
    const res = await run(ws, { path: 'Module.pdf', logoPath: 'logo.png', logoPosition: 'top-right' });
    expect(res.content).toMatch(/logo at the top right of every page\. The original/);
  });

  it('asks for unclear pages or turns; refuses to remove every page', async () => {
    const ws = createVirtualWorkspace('Class');
    ws.handle.saveVirtualFile('Module.pdf', await fourPages());
    ws.files = ws.handle.getFiles();
    const a = await run(ws, { path: 'Module.pdf', remove: '9' });
    expect(a.content).toMatch(/Needs your input.*For removing pages: page 9 is not in this 4-page PDF/);
    clearAnswerMemory();
    const b = await run(ws, { path: 'Module.pdf', rotate: { pages: 'all', degrees: 45 } });
    expect(b.content).toMatch(/Needs your input.*How far should I turn the pages/);
    clearAnswerMemory();
    const c = await run(ws, { path: 'Module.pdf', remove: 'all' });
    expect(c.content).toMatch(/would remove every page/);
  });
});
