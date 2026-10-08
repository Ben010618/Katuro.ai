import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Buffer } from 'node:buffer';
import jpeg from 'jpeg-js';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { callGeminiProxy } from '../../geminiConfig';
import { runDeskAgentTurn, clearAnswerMemory } from './deskAgent';
import { resetTaskActionSupport } from './llm';
import { createVirtualWorkspace, readFileBytes } from '../../localFileSystem';
import { naturalSort, jpegOrientation, isHeic, preparePhoto, stripJpegExif } from '../generators/photoPdf';
import { imagesToPdf, compressPdf } from '../generators/pdfTools';

vi.mock('../../geminiConfig', () => ({ callGeminiProxy: vi.fn() }));

/** A real JPEG: left half red, right half blue (so a turn is visible). */
function makeJpeg(width, height, quality = 90, noisy = false) {
  const data = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 4;
      const n = noisy ? (x * 7 + y * 13) % 50 : 0;
      data[i] = x < width / 2 ? 220 - n : 20 + n;
      data[i + 1] = 30 + n;
      data[i + 2] = x < width / 2 ? 20 + n : 220 - n;
      data[i + 3] = 255;
    }
  }
  return new Uint8Array(jpeg.encode({ data, width, height }, quality).data);
}

/** Inserts an EXIF block with the given orientation right after the JPEG start marker. */
function withOrientation(u8, orientation) {
  const tiff = [0x4d, 0x4d, 0x00, 0x2a, 0, 0, 0, 8, 0, 1, 0x01, 0x12, 0, 3, 0, 0, 0, 1, 0, orientation, 0, 0, 0, 0, 0, 0];
  const body = [0x45, 0x78, 0x69, 0x66, 0, 0, ...tiff];
  const len = body.length + 2;
  return new Uint8Array([0xff, 0xd8, 0xff, 0xe1, len >> 8, len & 255, ...body, ...u8.slice(2)]);
}

/** Test shrinker (stands in for the desktop canvas): nearest-pixel scale-down with jpeg-js. */
function nodeShrink(bytes, { maxPx, quality }) {
  const img = jpeg.decode(Buffer.from(bytes), { useTArray: true });
  const scale = Math.min(1, maxPx / Math.max(img.width, img.height));
  const width = Math.max(1, Math.round(img.width * scale));
  const height = Math.max(1, Math.round(img.height * scale));
  const data = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const s = (Math.floor(y / scale) * img.width + Math.floor(x / scale)) * 4;
      data.set(img.data.subarray(s, s + 4), (y * width + x) * 4);
    }
  }
  return { bytes: new Uint8Array(jpeg.encode({ data, width, height }, Math.round(quality * 100)).data), width, height };
}

/** Where the image's own corners land on page 1: [x, y] of its top-left and bottom-left pixels. */
async function imageCorners(pdfBytes) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await pdfjs.getDocument({ data: pdfBytes.slice(), isEvalSupported: false, verbosity: 0 }).promise;
  const page = await doc.getPage(1);
  const list = await page.getOperatorList();
  const mul = (m, n) => [m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1], m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3], m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]];
  let ctm = [1, 0, 0, 1, 0, 0];
  const stack = [];
  for (let i = 0; i < list.fnArray.length; i += 1) {
    const fn = list.fnArray[i];
    if (fn === pdfjs.OPS.save) stack.push(ctm);
    else if (fn === pdfjs.OPS.restore) ctm = stack.pop();
    else if (fn === pdfjs.OPS.transform) ctm = mul(ctm, list.argsArray[i]);
    else if (fn === pdfjs.OPS.paintImageXObject) {
      const at = (x, y) => [ctm[0] * x + ctm[2] * y + ctm[4], ctm[1] * x + ctm[3] * y + ctm[5]].map((v) => Math.round(v));
      return { topLeft: at(0, 1), bottomLeft: at(0, 0), topRight: at(1, 1) };
    }
  }
  return null;
}

describe('photos into one clean PDF', () => {
  beforeEach(() => { resetTaskActionSupport(); clearAnswerMemory(); callGeminiProxy.mockReset(); });

  const run = async (ws, tool, args, prompt) => {
    callGeminiProxy.mockImplementation(async () => ({ text: JSON.stringify({ confidence: 'high', reply: 'Sige po.', tasks: [{ id: 't1', tool, args }] }) }));
    return runDeskAgentTurn({ prompt, workspace: ws, user: { uid: 'u1' }, profile: { fullName: 'Ana Reyes' }, autoApprove: true });
  };

  it('helpers: natural order, EXIF orientation, HEIC detection', () => {
    expect(naturalSort(['Scans/IMG_10.jpg', 'Scans/IMG_2.jpg', 'Scans/IMG_1.png'])).toEqual(['Scans/IMG_1.png', 'Scans/IMG_2.jpg', 'Scans/IMG_10.jpg']);
    const j = makeJpeg(40, 20);
    expect(jpegOrientation(j)).toBe(1);
    expect(jpegOrientation(withOrientation(j, 6))).toBe(6);
    expect(jpegOrientation(stripJpegExif(withOrientation(j, 6)))).toBe(1);
    expect(jpeg.decode(Buffer.from(stripJpegExif(withOrientation(j, 6)))).width).toBe(40); // still a valid JPEG
    const heic = new Uint8Array([0, 0, 0, 24, ...Buffer.from('ftypheic'), 0, 0, 0, 0]);
    expect(isHeic(heic)).toBe(true);
    expect(isHeic(j)).toBe(false);
  });

  it('a sideways phone photo is turned upright on a page of the right shape', async () => {
    // Stored 400x200 (wide) but EXIF 6 = taken in portrait: must show 200 wide x 400 tall.
    const pdf = await imagesToPdf([{ bytes: withOrientation(makeJpeg(400, 200), 6) }], { paper: 'long' });
    const page = (await PDFDocument.load(pdf)).getPage(0);
    expect(page.getSize()).toEqual({ width: 612, height: 936 });          // portrait long bond
    // Turned clockwise: the photo's top-left lands top-right, its left edge becomes the top edge.
    const c = await imageCorners(pdf);
    expect(c.topLeft[0]).toBeGreaterThan(306);
    expect(c.topLeft[1]).toBeGreaterThan(468);
    expect(c.bottomLeft[0]).toBeLessThan(306);
    expect(c.bottomLeft[1]).toBeGreaterThan(468);
    expect(c.topRight[0]).toBeGreaterThan(306);
    expect(c.topRight[1]).toBeLessThan(468);
    for (const pt of [c.topLeft, c.bottomLeft, c.topRight]) {
      expect(pt[0]).toBeGreaterThanOrEqual(35); expect(pt[0]).toBeLessThanOrEqual(577);
      expect(pt[1]).toBeGreaterThanOrEqual(35); expect(pt[1]).toBeLessThanOrEqual(901);
    }
    // Upside down (EXIF 3): top-left lands bottom-right.
    const flipped = await imageCorners(await imagesToPdf([{ bytes: withOrientation(makeJpeg(200, 400), 3) }]));
    expect(flipped.topLeft[0]).toBeGreaterThan(306);
    expect(flipped.topLeft[1]).toBeLessThan(468);
    // EXIF 8 (turned counter-clockwise): top-left lands bottom-left.
    const ccw = await imageCorners(await imagesToPdf([{ bytes: withOrientation(makeJpeg(400, 200), 8) }]));
    expect(ccw.topLeft[0]).toBeLessThan(306);
    expect(ccw.topLeft[1]).toBeLessThan(468);
    // An upright wide photo keeps a landscape page.
    const wide = (await PDFDocument.load(await imagesToPdf([{ bytes: makeJpeg(400, 200) }]))).getPage(0).getSize();
    expect(wide.width).toBeGreaterThan(wide.height);
  });

  it('HEIC goes through the converter; without the desktop app it says so', async () => {
    const heic = new Uint8Array([0, 0, 0, 24, ...Buffer.from('ftypheic'), 0, 0, 0, 0]);
    const jpg = makeJpeg(30, 30);
    const ok = await preparePhoto({ bytes: heic, name: 'IMG_3830.HEIC' }, { heicToJpeg: async () => jpg, shrink: null });
    expect(ok).toMatchObject({ mimeType: 'image/jpeg', converted: 'heic' });
    await expect(preparePhoto({ bytes: heic, name: 'IMG_3830.HEIC' }, { shrink: null })).rejects.toThrow(/iPhone photo \(HEIC\).*desktop app/);
    const big = makeJpeg(2600, 1300, 95, true);
    const small = await preparePhoto({ bytes: big, name: 'a.jpg' }, { shrink: (b, mime, o) => nodeShrink(b, o) });
    expect(small.shrunk).toBe(true);
    expect(small.bytes.length).toBeLessThan(big.length);
    expect(jpeg.decode(Buffer.from(small.bytes)).width).toBe(2000);
  });

  it('convert_to_pdf: every photo in a folder, one per page, in file-name order; originals untouched', async () => {
    const ws = createVirtualWorkspace('Class');
    const shapes = { 'IMG_10.jpg': [300, 200], 'IMG_2.jpg': [200, 300], 'IMG_1.jpg': [250, 250] };
    for (const [n, [w, h]] of Object.entries(shapes)) ws.handle.saveVirtualFile(`Scans/${n}`, makeJpeg(w, h));
    ws.handle.saveVirtualFile('Scans/notes.docx', new Uint8Array([1]));
    ws.files = ws.handle.getFiles();
    const res = await run(ws, 'convert_to_pdf', { folder: 'scans', outputName: 'Quiz pages' }, 'put the photos in Scans into one PDF');
    expect(res.content).toMatch(/Quiz pages\.pdf/);
    expect(res.content).toMatch(/3 photo\(s\), one per page, in file-name order: IMG_1\.jpg, IMG_2\.jpg, IMG_10\.jpg/);
    expect(res.content).toMatch(/Your photos were not changed/);
    const file = res.createdFiles.find((f) => f.name === 'Quiz pages.pdf');
    const doc = await PDFDocument.load(await readFileBytes(ws.handle, file.path));
    const sizes = doc.getPages().map((p) => p.getSize());
    expect(sizes.map((s) => (s.width > s.height ? 'wide' : 'tall'))).toEqual(['tall', 'tall', 'wide']); // square, 200x300, 300x200
    expect((await readFileBytes(ws.handle, 'Scans/IMG_2.jpg')).length).toBe(makeJpeg(200, 300).length);
  });

  it('asks when the folder has no photos', async () => {
    const ws = createVirtualWorkspace('Class');
    ws.handle.saveVirtualFile('Empty/notes.txt', new Uint8Array([65]));
    ws.files = ws.handle.getFiles();
    const res = await run(ws, 'convert_to_pdf', { folder: 'Empty' }, 'photos in Empty to pdf');
    expect(res.content).toMatch(/Needs your input.*no photos/);
    expect(res.createdFiles).toHaveLength(0);
  });

  it('compressPdf scales the photos inside a PDF down and keeps the text', async () => {
    const src = await PDFDocument.create();
    const page = src.addPage([612, 936]);
    const big = makeJpeg(2400, 1800, 95, true);
    const img = await src.embedJpg(big);
    page.drawImage(img, { x: 36, y: 200, width: 540, height: 405 });
    page.drawText('Quiz 1 - Grade 5 Rizal', { x: 36, y: 880, size: 14, font: await src.embedFont(StandardFonts.Helvetica) });
    const bytes = await src.save();
    const res = await compressPdf(bytes, { shrinkJpeg: nodeShrink, maxPx: 1400, quality: 0.6 });
    expect(res).toMatchObject({ images: 1, shrunk: 1, skipped: 0 });
    expect(res.after).toBeLessThan(res.before * 0.6);
    const out = await PDFDocument.load(res.bytes);
    expect(out.getPageCount()).toBe(1);
    // A text-only PDF has nothing to shrink.
    const text = await PDFDocument.create();
    text.addPage().drawText('Hello', { font: await text.embedFont(StandardFonts.Helvetica) });
    expect((await compressPdf(await text.save(), { shrinkJpeg: nodeShrink })).images).toBe(0);
  });

  it('compress_pdf does not save a copy that is not smaller', async () => {
    const ws = createVirtualWorkspace('Class');
    const text = await PDFDocument.create();
    text.addPage().drawText('Hello', { font: await text.embedFont(StandardFonts.Helvetica) });
    ws.handle.saveVirtualFile('Letter.pdf', await text.save());
    ws.files = ws.handle.getFiles();
    const res = await run(ws, 'compress_pdf', { path: 'Letter.pdf' }, 'make Letter.pdf smaller');
    expect(res.content).toMatch(/already about as small as I can make it: it has no photos or scans inside/);
    expect(res.createdFiles).toHaveLength(0);
  });
});
