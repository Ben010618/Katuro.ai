import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Buffer } from 'node:buffer';
import fs from 'node:fs';
import process from 'node:process';
import PizZip from 'pizzip';
import { Document, Packer, Paragraph, AlignmentType } from 'docx';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { callGeminiProxy } from '../../geminiConfig';
import { runDeskAgentTurn, clearAnswerMemory, decideAction } from './deskAgent';
import { resetTaskActionSupport } from './llm';
import { createVirtualWorkspace, readFileBytes } from '../../localFileSystem';
import { nameMatcher } from '../generators/placeSignature';
import { cleanSignaturePixels } from '../signature';

vi.mock('../../geminiConfig', () => ({ callGeminiProxy: vi.fn() }));

// A 4x2 PNG (any real PNG works as the "signature").
const PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAQAAAACCAYAAAB/qH1jAAAAEUlEQVR42mNkYPhfz4AGGIEAHnUCAcJGgKUAAAAASUVORK5CYII=';
const SIG = `data:image/png;base64,${PNG_B64}`;

async function report() {
  const p = (t, center = false) => new Paragraph({ text: t, alignment: center ? AlignmentType.CENTER : undefined });
  return new Uint8Array(await Packer.toArrayBuffer(new Document({ sections: [{ children: [
    p('Narrative Report'), p('Ana Reyes will lead the reading program this quarter.'),
    p('Prepared by:'), p('ANA M. REYES', true), p('Teacher III', true),
    p('Noted by:'), p('JUAN CRUZ', true), p('School Principal II', true),
  ] }] })));
}

async function reportPdf() {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const page = pdf.addPage([612, 936]);
  page.drawText('Ana Reyes will lead the program.', { x: 50, y: 800, size: 11, font });
  page.drawText('Prepared by:', { x: 50, y: 300, size: 11, font });
  page.drawText('ANA M. REYES', { x: 80, y: 250, size: 11, font });
  page.drawText('JUAN CRUZ', { x: 380, y: 250, size: 11, font });
  return pdf.save();
}

describe('place my e-signature', () => {
  beforeEach(() => { resetTaskActionSupport(); clearAnswerMemory(); callGeminiProxy.mockReset(); });

  const run = async (ws, args, { eSignature = SIG, fullName = 'Ana Reyes' } = {}) => {
    callGeminiProxy.mockImplementation(async () => ({ text: JSON.stringify({ confidence: 'high', reply: 'Sige po.', tasks: [{ id: 't1', tool: 'place_signature', args }] }) }));
    return runDeskAgentTurn({ prompt: 'sign this', workspace: ws, user: { uid: 'u1' }, profile: { fullName }, autoApprove: true, eSignature });
  };

  it('a photo of a signature: paper made transparent, the ink boxed', () => {
    const w = 60;
    const h = 30;
    const data = new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < w * h; i += 1) data.set([225, 222, 215, 255], i * 4);       // greyish paper
    for (let x = 10; x < 50; x += 1) data.set([20, 30, 90, 255], (15 * w + x) * 4); // a stroke
    const { data: out, box } = cleanSignaturePixels(data, w, h);
    expect(box).toEqual({ x: 10, y: 15, w: 40, h: 1 });
    expect(out[3]).toBe(0);                                                           // paper transparent
    expect(out[(15 * w + 20) * 4 + 3]).toBeGreaterThan(200);                          // ink solid
    expect(cleanSignaturePixels(new Uint8ClampedArray(w * h * 4).fill(255), w, h).box).toBe(null);
  });

  it('only the teacher\'s own name on a line of its own counts', () => {
    const m = nameMatcher('Ana Reyes');
    expect(['ANA M. REYES', 'Ana Reyes, Teacher III', 'Dr. Ana Reyes', 'ana reyes'].every((t) => m.line.test(t))).toBe(true);
    expect(m.line.test('Ana Reyes will lead the program.')).toBe(false);
    expect(m.line.test('JUAN CRUZ')).toBe(false);
  });

  it('Word: signature above the teacher\'s name only (not the principal\'s, not in sentences); original backed up', async () => {
    const ws = createVirtualWorkspace('Class');
    const original = await report();
    ws.handle.saveVirtualFile('Report.docx', original);
    ws.files = ws.handle.getFiles();
    const res = await run(ws, { path: 'Report.docx' });
    expect(res.content).toMatch(/Signed Report \(KaTuro edit\)\.docx: your e-signature is above your name in 1 place\. Please check it/);
    const bytes = await readFileBytes(ws.handle, res.createdFiles[0].path);
    if (process.env.KT_SIGN_OUT) fs.writeFileSync(process.env.KT_SIGN_OUT, bytes);
    const zip = new PizZip(bytes);
    const xml = zip.file('word/document.xml').asText();
    expect(xml.match(/<w:drawing>/g)).toHaveLength(1);
    expect(xml.indexOf('<w:drawing>')).toBeLessThan(xml.indexOf('ANA M. REYES'));
    expect(xml.indexOf('<w:drawing>')).toBeGreaterThan(xml.indexOf('Prepared by:'));
    expect(zip.file('word/media/kt_signature.png').asUint8Array().length).toBe(Buffer.from(PNG_B64, 'base64').length);
    expect(zip.file('word/_rels/document.xml.rels').asText()).toMatch(/Id="rIdKtSignature1"[^>]*Target="media\/kt_signature\.png"/);
    expect(zip.file('[Content_Types].xml').asText()).toMatch(/Extension="png"/);
    const mod = await import('mammoth');
    const html = (await (mod.default || mod).convertToHtml({ buffer: Buffer.from(bytes) })).value;
    expect(html).toMatch(/<img[^>]+>[\s\S]*ANA M\. REYES/);
    expect(Buffer.from(await readFileBytes(ws.handle, 'Report.docx')).equals(Buffer.from(original))).toBe(true);
  });

  it('PDF: drawn just above the teacher\'s name, centred on it', async () => {
    const ws = createVirtualWorkspace('Class');
    ws.handle.saveVirtualFile('Report.pdf', await reportPdf());
    ws.files = ws.handle.getFiles();
    const res = await run(ws, { path: 'Report.pdf' });
    expect(res.content).toMatch(/in 1 place \(page 1\)/);
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const doc = await pdfjs.getDocument({ data: (await readFileBytes(ws.handle, res.createdFiles[0].path)).slice(), isEvalSupported: false, verbosity: 0 }).promise;
    const ops = await (await doc.getPage(1)).getOperatorList();
    const i = ops.fnArray.indexOf(pdfjs.OPS.paintImageXObject);
    expect(i).toBeGreaterThan(-1);
    // The drawing position: every transform since the last save, combined.
    const mul = (m, n) => [m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1], m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3], m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]];
    let ctm = [1, 0, 0, 1, 0, 0];
    const stack = [];
    for (let k = 0; k < i; k += 1) {
      if (ops.fnArray[k] === pdfjs.OPS.save) stack.push(ctm);
      else if (ops.fnArray[k] === pdfjs.OPS.restore) ctm = stack.pop();
      else if (ops.fnArray[k] === pdfjs.OPS.transform) ctm = mul(ctm, ops.argsArray[k]);
    }
    const [width, , , height, x, y] = ctm;
    expect(width).toBeCloseTo(108, 0);                       // 1.5 inches
    expect(x + width / 2).toBeGreaterThan(100);              // centred on "ANA M. REYES" (x 80…~160), not JUAN CRUZ
    expect(x + width / 2).toBeLessThan(160);
    expect(y).toBeGreaterThan(250);                          // above the name
    expect(y).toBeLessThan(265);
    expect(height).toBeGreaterThan(0);
  });

  it('asks: no saved signature, or no signature line with the teacher\'s name; always confirms first', async () => {
    const ws = createVirtualWorkspace('Class');
    ws.handle.saveVirtualFile('Report.docx', await report());
    ws.files = ws.handle.getFiles();
    const a = await run(ws, { path: 'Report.docx' }, { eSignature: null });
    expect(a.content).toMatch(/Needs your input.*no saved e-signature yet.*Settings > E-signature/);
    clearAnswerMemory();
    const b = await run(ws, { path: 'Report.docx' }, { fullName: 'Liza Soberano' });
    expect(b.content).toMatch(/Needs your input.*could not find a signature line with your name \(Liza Soberano\).*I only sign above your own name/);
    const tasks = [{ id: 't1', tool: 'place_signature', args: { path: 'Report.docx' } }];
    expect(decideAction({ tasks, check: { confidence: 'high', missing: [] } }).action).toBe('confirm');
    expect(decideAction({ tasks, check: { confidence: 'high', missing: [] }, autoApprove: true }).action).toBe('run');
    expect(decideAction({ tasks, check: { confidence: 'high', missing: [] }, confirmed: true }).action).toBe('run');
  });
});
