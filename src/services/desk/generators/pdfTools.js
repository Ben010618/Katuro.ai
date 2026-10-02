/**
 * pdfTools.js — merge, split, images→PDF and page count with pdf-lib.
 */

import { toUint8 } from './shared.js';

const PAPER_PT = {
  long: [612, 936],
  a4: [595.28, 841.89],
  letter: [612, 792],
  legal: [612, 1008],
};

const lib = () => import('pdf-lib');

export async function getPdfPageCount(bytes) {
  const { PDFDocument } = await lib();
  const doc = await PDFDocument.load(toUint8(bytes), { ignoreEncryption: true });
  return doc.getPageCount();
}

export async function mergePdfs(list = []) {
  const { PDFDocument } = await lib();
  const out = await PDFDocument.create();
  for (const bytes of list) {
    const src = await PDFDocument.load(toUint8(bytes), { ignoreEncryption: true });
    const pages = await out.copyPages(src, src.getPageIndices());
    pages.forEach((p) => out.addPage(p));
  }
  return out.save();
}

/** ranges: [[from, to], ...] 1-based inclusive; out-of-range pages are clamped. */
export async function splitPdf(bytes, ranges = []) {
  const { PDFDocument } = await lib();
  const src = await PDFDocument.load(toUint8(bytes), { ignoreEncryption: true });
  const n = src.getPageCount();
  const results = [];
  for (const range of ranges) {
    const [a, b = a] = Array.isArray(range) ? range : [range, range];
    const from = Math.max(1, Math.min(n, Number(a) || 1));
    const to = Math.max(from, Math.min(n, Number(b) || from));
    const out = await PDFDocument.create();
    const idx = Array.from({ length: to - from + 1 }, (_, i) => from - 1 + i);
    (await out.copyPages(src, idx)).forEach((p) => out.addPage(p));
    results.push(await out.save());
  }
  return results;
}

const isPng = (u8) => u8[0] === 0x89 && u8[1] === 0x50 && u8[2] === 0x4e && u8[3] === 0x47;
const isJpg = (u8) => u8[0] === 0xff && u8[1] === 0xd8;

/** One image per page, scaled to fit inside 0.5" margins and centered. */
export async function imagesToPdf(images = [], { paper = 'long', margin = 36 } = {}) {
  const { PDFDocument } = await lib();
  const [pw, ph] = PAPER_PT[paper] || PAPER_PT.long;
  const out = await PDFDocument.create();
  for (const img of images) {
    const u8 = toUint8(img.bytes);
    const type = String(img.mimeType || '').toLowerCase();
    let embedded;
    if (isPng(u8) || (!isJpg(u8) && type.includes('png'))) embedded = await out.embedPng(u8);
    else if (isJpg(u8) || type.includes('jp')) embedded = await out.embedJpg(u8);
    else throw new Error(`Unsupported image type: ${img.mimeType || 'unknown'} (use PNG or JPG).`);
    const landscape = embedded.width > embedded.height;
    const [w, h] = landscape ? [ph, pw] : [pw, ph];
    const scale = Math.min((w - 2 * margin) / embedded.width, (h - 2 * margin) / embedded.height);
    const dw = embedded.width * scale;
    const dh = embedded.height * scale;
    const page = out.addPage([w, h]);
    page.drawImage(embedded, { x: (w - dw) / 2, y: (h - dh) / 2, width: dw, height: dh });
  }
  return out.save();
}
