import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Buffer } from 'node:buffer';
import fs from 'node:fs';
import process from 'node:process';
import PizZip from 'pizzip';
import PptxGenJS from 'pptxgenjs';
import { callGeminiProxy } from '../../geminiConfig';
import { runDeskAgentTurn, clearAnswerMemory } from './deskAgent';
import { resetTaskActionSupport } from './llm';
import { createVirtualWorkspace, readFileBytes } from '../../localFileSystem';
import { closeness } from '../generators/slideEdit';

vi.mock('../../geminiConfig', () => ({ callGeminiProxy: vi.fn() }));

const PNG = Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64'));

async function deck() {
  const p = new PptxGenJS();
  const s1 = p.addSlide();
  s1.addText('Parts of a Plnat', { x: 1, y: 0.5, w: 8, h: 1, fontFace: 'Calibri', fontSize: 32, bold: true });
  s1.addText([{ text: 'The roots ', options: {} }, { text: 'absorbs', options: { bold: true } }, { text: ' water. Quarter 1, SY 2025-2026', options: {} }], { x: 1, y: 2, w: 8, h: 1, fontFace: 'Calibri' });
  const s2 = p.addSlide();
  s2.addText('Quiz on 10 items', { x: 1, y: 1, w: 8, h: 1, fontFace: 'Times New Roman' });
  s2.addImage({ data: `image/png;base64,${Buffer.from(PNG).toString('base64')}`, x: 1, y: 2, w: 1, h: 1 });
  return new Uint8Array(await p.write({ outputType: 'uint8array' }));
}

/** A school template deck: its own theme (colours, fonts) and a picture background on the master. */
async function template() {
  const p = new PptxGenJS();
  p.theme = { headFontFace: 'Arial Black', bodyFontFace: 'Verdana' };
  p.defineSlideMaster({ title: 'SCHOOL', background: { data: `image/png;base64,${Buffer.from(PNG).toString('base64')}` } });
  p.addSlide({ masterName: 'SCHOOL' }).addText('Template', { x: 1, y: 1, w: 4, h: 1 });
  const bytes = new Uint8Array(await p.write({ outputType: 'uint8array' }));
  // pptxgenjs puts the custom background on a layout; make it the master's for this test.
  const zip = new PizZip(bytes);
  const master = zip.file('ppt/slideMasters/slideMaster1.xml').asText();
  zip.file('ppt/slideMasters/slideMaster1.xml', master.replace(/<p:bg>[\s\S]*?<\/p:bg>/, '').replace(/(<p:cSld\b[^>]*>)/, '$1<p:bg><p:bgPr><a:solidFill><a:srgbClr val="0B3D91"/></a:solidFill><a:effectLst/></p:bgPr></p:bg>'));
  return zip.generate({ type: 'uint8array' });
}

const slideXml = (bytes, n) => new PizZip(bytes).file(`ppt/slides/slide${n}.xml`).asText();

describe('edit an existing PowerPoint deck', () => {
  beforeEach(() => { resetTaskActionSupport(); clearAnswerMemory(); callGeminiProxy.mockReset(); });

  const run = async (ws, args, changes = []) => {
    const prompts = [];
    callGeminiProxy.mockImplementation(async (req) => {
      const text = JSON.stringify(req.contents);
      if (text.includes('You are the planner')) return { text: JSON.stringify({ confidence: 'high', reply: 'Sige po.', tasks: [{ id: 't1', tool: 'edit_slides', args }] }) };
      prompts.push(text);
      const list = JSON.parse(JSON.parse(text)[0].parts.map((p) => p.text).join('').split('\n').slice(-1)[0]);
      return { text: JSON.stringify({ changes: changes(list) }) };
    });
    const res = await runDeskAgentTurn({ prompt: 'fix my slides', workspace: ws, user: { uid: 'u1' }, profile: { fullName: 'Ana Reyes' }, autoApprove: true });
    return { res, prompts };
  };
  const fix = (from, to) => (list) => list.filter((x) => x.text.includes(from)).map((x) => ({ i: x.i, text: x.text.replace(from, to) }));

  it('typo fixes in place: the bold word stays bold, pictures stay, every change listed', async () => {
    const ws = createVirtualWorkspace('Class');
    const original = await deck();
    ws.handle.saveVirtualFile('Plants.pptx', original);
    ws.files = ws.handle.getFiles();
    const changes = (list) => [...fix('Plnat', 'Plant')(list), ...fix('absorbs', 'absorb')(list)];
    const { res } = await run(ws, { path: 'Plants.pptx', fixTypos: true }, changes);
    expect(res.content).toMatch(/Edited Plants \(KaTuro edit\)\.pptx: 2 text\(s\) changed\. Layout, pictures and formatting were kept/);
    const bytes = await readFileBytes(ws.handle, res.createdFiles[0].path);
    const s1 = slideXml(bytes, 1);
    expect(s1).toContain('>Parts of a Plant<');
    expect(s1).toMatch(/<a:rPr[^>]*b="1"[^>]*>[\s\S]*?<a:t>absorb<\/a:t>/);          // still bold
    expect(s1).toContain('>The roots <');
    expect(new PizZip(bytes).file(/ppt\/media\//).length).toBe(1);                 // the picture
    expect(Buffer.from(await readFileBytes(ws.handle, 'Plants.pptx')).equals(Buffer.from(original))).toBe(true);
  });

  it('a "typo fix" that changes numbers or rewrites the text is not used', async () => {
    const ws = createVirtualWorkspace('Class');
    ws.handle.saveVirtualFile('Plants.pptx', await deck());
    ws.files = ws.handle.getFiles();
    const changes = (list) => [...fix('10 items', '20 items')(list), ...fix('Parts of a Plnat', 'An entirely different heading about animals')(list)];
    const { res } = await run(ws, { path: 'Plants.pptx', fixTypos: true }, changes);
    expect(res.content).toMatch(/I found nothing to change in Plants\.pptx \(2 suggested change\(s\) were not used/);
    expect(res.createdFiles).toHaveLength(0);
  });

  it('content change by instruction (numbers may change), then restyle to the school template', async () => {
    const ws = createVirtualWorkspace('Class');
    ws.handle.saveVirtualFile('Plants.pptx', await deck());
    ws.handle.saveVirtualFile('School Template.pptx', await template());
    ws.files = ws.handle.getFiles();
    const changes = (list) => fix('Quarter 1, SY 2025-2026', 'Term 1, SY 2026-2027')(list);
    const { res } = await run(ws, { path: 'Plants.pptx', instructions: 'update to Term 1 of SY 2026-2027', templatePath: 'School Template.pptx' }, changes);
    expect(res.content).toMatch(/1 text\(s\) changed; restyled to School Template\.pptx: colours from the template \([^)]*\); fonts: headings Arial Black, text Verdana; background from the template; \d+ text run\(s\) switched to the template fonts/);
    const bytes = await readFileBytes(ws.handle, res.createdFiles[0].path);
    if (process.env.KT_SLIDES_OUT) fs.writeFileSync(process.env.KT_SLIDES_OUT, bytes);
    const zip = new PizZip(bytes);
    expect(slideXml(bytes, 1)).toContain(' water. Term 1, SY 2026-2027<');
    expect(zip.file('ppt/theme/theme1.xml').asText()).toMatch(/<a:majorFont><a:latin typeface="Arial Black"/);
    expect(zip.file('ppt/slideMasters/slideMaster1.xml').asText()).toContain('<a:srgbClr val="0B3D91"/>');
    expect(slideXml(bytes, 2)).toContain('typeface="Verdana"');
    expect(slideXml(bytes, 2)).not.toContain('Times New Roman');
  });

  it('closeness; asks what to change', async () => {
    expect(closeness('Parts of a Plnat', 'Parts of a Plant')).toBeGreaterThan(0.7);
    expect(closeness('Parts of a Plnat', 'An entirely different heading about animals')).toBeLessThan(0.3);
    const ws = createVirtualWorkspace('Class');
    ws.handle.saveVirtualFile('Plants.pptx', await deck());
    ws.files = ws.handle.getFiles();
    const { res } = await run(ws, { path: 'Plants.pptx' }, () => []);
    expect(res.content).toMatch(/Needs your input.*What should I change in the slides/);
  });
});
