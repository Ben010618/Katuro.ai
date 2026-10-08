import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Buffer } from 'node:buffer';
import fs from 'node:fs';
import process from 'node:process';
import PptxGenJS from 'pptxgenjs';
import { callGeminiProxy } from '../../geminiConfig';
import { runDeskAgentTurn, clearAnswerMemory } from './deskAgent';
import { resetTaskActionSupport } from './llm';
import { createVirtualWorkspace, readFileBytes } from '../../localFileSystem';
import { readDeck } from '../generators/slideHandout';

vi.mock('../../geminiConfig', () => ({ callGeminiProxy: vi.fn() }));

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64').toString('base64');

async function lessonDeck() {
  const p = new PptxGenJS();
  const s1 = p.addSlide();
  s1.background = { color: '0B3D91' };
  s1.addText('The Water Cycle', { x: 0.5, y: 2, w: 9, h: 1.2, fontSize: 40, bold: true, color: 'FFFFFF', align: 'center' });
  s1.addNotes('Greet the class and ask what happens to rain.');
  const s2 = p.addSlide();
  s2.addText('Stages', { x: 0.5, y: 0.3, w: 9, h: 0.8, fontSize: 32, bold: true });
  s2.addText([{ text: 'Evaporation', options: { bullet: true } }, { text: 'Condensation', options: { bullet: true } }, { text: 'Precipitation', options: { bullet: true } }], { x: 0.5, y: 1.3, w: 9, h: 3, fontSize: 24 });
  s2.addNotes('Point to each stage on the diagram.');
  const s3 = p.addSlide();
  s3.addImage({ data: `image/png;base64,${PNG}`, x: 1, y: 1, w: 3, h: 3 });
  s3.addShape(p.ShapeType.rect, { x: 5, y: 1, w: 3, h: 1, fill: { color: 'FFD966' } });
  s3.addText('Quiz on 5 items', { x: 5, y: 1, w: 3, h: 1, fontSize: 18 });
  const s4 = p.addSlide();
  s4.addTable([['Stage', 'Example'], ['Evaporation', 'Puddles dry up'], ['Condensation', 'Clouds form']], { x: 0.5, y: 1, w: 9 });
  p.addSlide().addText('Salamat po! Ñ test', { x: 1, y: 2, w: 8, h: 1, fontSize: 28 });
  return new Uint8Array(await p.write({ outputType: 'uint8array' }));
}

async function pdfPages(bytes) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await pdfjs.getDocument({ data: bytes.slice(), isEvalSupported: false, verbosity: 0 }).promise;
  const out = [];
  for (let p = 1; p <= doc.numPages; p += 1) {
    const page = await doc.getPage(p);
    const ops = await page.getOperatorList();
    out.push({ text: (await page.getTextContent()).items.map((i) => i.str).join(' | '), images: ops.fnArray.filter((f) => f === pdfjs.OPS.paintImageXObject).length });
  }
  return out;
}

describe('slides to a printable handout', () => {
  beforeEach(() => { resetTaskActionSupport(); clearAnswerMemory(); callGeminiProxy.mockReset(); });

  const run = async (ws, args) => {
    callGeminiProxy.mockImplementation(async () => ({ text: JSON.stringify({ confidence: 'high', reply: 'Sige po.', tasks: [{ id: 't1', tool: 'slides_handout', args }] }) }));
    return runDeskAgentTurn({ prompt: 'handout of my slides', workspace: ws, user: { uid: 'u1' }, profile: { fullName: 'Ana Reyes' }, autoApprove: true });
  };

  it('reads the deck: order, background, text, bullets, picture, table, notes', async () => {
    const deck = await readDeck(await lessonDeck());
    expect(deck.slides.map((s) => s.n)).toEqual([1, 2, 3, 4, 5]);
    expect(deck.slides[0].bg).toEqual({ color: '0B3D91' });
    expect(deck.slides[0].notes).toBe('Greet the class and ask what happens to rain.');
    const s2 = deck.slides[1].shapes.find((sh) => sh.paras?.length === 3);
    expect(s2.paras.map((p) => p.runs.map((r) => r.text).join(''))).toEqual(['Evaporation', 'Condensation', 'Precipitation']);
    expect(deck.slides[2].shapes.map((sh) => sh.kind)).toEqual(['pic', 'sp', 'sp']);
    expect(deck.slides[2].shapes[1].fill).toBe('FFD966');
    expect(deck.slides[3].shapes[0]).toMatchObject({ kind: 'table' });
    expect(deck.slides[3].shapes[0].rows[1].cells).toEqual(['Evaporation', 'Puddles dry up']);
  });

  it('3 per page with note lines; every slide\'s words, pictures and the table are on it', async () => {
    const ws = createVirtualWorkspace('Class');
    ws.handle.saveVirtualFile('Water Cycle.pptx', await lessonDeck());
    ws.files = ws.handle.getFiles();
    const res = await run(ws, { path: 'Water Cycle.pptx' });
    expect(res.content).toMatch(/Made Water Cycle \(handout, 3 per page\)\.pdf: 5 slide\(s\) on 2 page\(s\), with lines beside each slide for notes\. The slides are drawn in a simplified way/);
    const bytes = await readFileBytes(ws.handle, res.createdFiles[0].path);
    if (process.env.KT_HANDOUT_OUT) fs.writeFileSync(process.env.KT_HANDOUT_OUT, bytes);
    const pages = await pdfPages(bytes);
    expect(pages).toHaveLength(2);
    expect(pages[0].text).toMatch(/Water Cycle.*The Water Cycle.*Slide 1/);
    expect(pages[0].text).toMatch(/• Evaporation.*• Condensation.*• Precipitation/);
    expect(pages[0].text).toMatch(/Quiz on 5 items/);
    expect(pages[0].images).toBe(1);
    expect(pages[1].text).toMatch(/Puddles dry up/);
    expect(pages[1].text).toMatch(/Salamat po! Ñ test/);
  });

  it('notes pages: one slide per page with its speaker notes', async () => {
    const ws = createVirtualWorkspace('Class');
    ws.handle.saveVirtualFile('Water Cycle.pptx', await lessonDeck());
    ws.files = ws.handle.getFiles();
    const res = await run(ws, { path: 'Water Cycle.pptx', notes: true });
    expect(res.content).toMatch(/5 slide\(s\) on 5 page\(s\), with speaker notes \(2 slide\(s\) have notes\)/);
    const pages = await pdfPages(await readFileBytes(ws.handle, res.createdFiles[0].path));
    expect(pages[0].text).toMatch(/Greet the class and ask what happens to rain\./);
    expect(pages[3].text).toMatch(/No speaker notes on this slide/);
  });

  it('asks for an odd number per page', async () => {
    const ws = createVirtualWorkspace('Class');
    ws.handle.saveVirtualFile('Water Cycle.pptx', await lessonDeck());
    ws.files = ws.handle.getFiles();
    const res = await run(ws, { path: 'Water Cycle.pptx', perPage: 5 });
    expect(res.content).toMatch(/Needs your input.*How many slides per page/);
  });
});
