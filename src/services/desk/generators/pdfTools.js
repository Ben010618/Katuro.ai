/**
 * pdfTools.js — merge, split, images→PDF and page count with pdf-lib.
 */

import { toUint8 } from './shared.js';
import { jpegOrientation } from './photoPdf.js';

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

/** EXIF orientation → clockwise turn needed to stand the photo upright. */
const TURN_CW = { 3: 180, 4: 180, 5: 90, 6: 90, 7: 270, 8: 270 };

/**
 * One image per page, scaled to fit inside 0.5" margins and centered. Photos taken
 * sideways (EXIF orientation) are turned upright; the page follows the photo's shape.
 */
export async function imagesToPdf(images = [], { paper = 'long', margin = 36 } = {}) {
  const { PDFDocument, degrees } = await lib();
  const [pw, ph] = PAPER_PT[paper] || PAPER_PT.long;
  const out = await PDFDocument.create();
  for (const img of images) {
    const u8 = toUint8(img.bytes);
    const type = String(img.mimeType || '').toLowerCase();
    let embedded;
    if (isPng(u8) || (!isJpg(u8) && type.includes('png'))) embedded = await out.embedPng(u8);
    else if (isJpg(u8) || type.includes('jp')) embedded = await out.embedJpg(u8);
    else throw new Error(`Unsupported image type: ${img.mimeType || 'unknown'} (use PNG or JPG).`);
    const turn = isJpg(u8) ? TURN_CW[jpegOrientation(u8)] || 0 : 0;
    const sideways = turn === 90 || turn === 270;
    // Upright size of the photo (as the teacher sees it).
    const uw = sideways ? embedded.height : embedded.width;
    const uh = sideways ? embedded.width : embedded.height;
    const landscape = uw > uh;
    const [w, h] = landscape ? [ph, pw] : [pw, ph];
    const scale = Math.min((w - 2 * margin) / uw, (h - 2 * margin) / uh);
    const bw = uw * scale; // box on the page
    const bh = uh * scale;
    const bx = (w - bw) / 2;
    const by = (h - bh) / 2;
    const iw = embedded.width * scale; // drawn image size before turning
    const ih = embedded.height * scale;
    const page = out.addPage([w, h]);
    // pdf-lib turns counter-clockwise around (x, y); place the corner so the turned image fills the box.
    if (turn === 90) page.drawImage(embedded, { x: bx, y: by + iw, width: iw, height: ih, rotate: degrees(-90) });
    else if (turn === 270) page.drawImage(embedded, { x: bx + ih, y: by, width: iw, height: ih, rotate: degrees(90) });
    else if (turn === 180) page.drawImage(embedded, { x: bx + iw, y: by + ih, width: iw, height: ih, rotate: degrees(180) });
    else page.drawImage(embedded, { x: bx, y: by, width: iw, height: ih });
  }
  return out.save();
}

/**
 * Smaller copy of a PDF: photos and scans inside it (JPEG images) are scaled down and
 * re-saved; text, tables and page layout stay as they are.
 *   shrinkJpeg(bytes, { maxPx, quality }) → { bytes, width, height } | null
 * → { bytes, before, after, images, shrunk, skipped }
 */
export async function compressPdf(bytes, { shrinkJpeg, maxPx = 2000, quality = 0.75 } = {}) {
  const { PDFDocument, PDFName, PDFRawStream, PDFNumber, PDFArray } = await lib();
  const input = toUint8(bytes);
  const doc = await PDFDocument.load(input, { ignoreEncryption: true });
  if (doc.isEncrypted) throw new Error('This PDF is password-protected, so I cannot make a smaller copy. Remove the password first.');
  const name = (v) => (v instanceof PDFName ? v.asString() : null);
  let images = 0;
  let shrunk = 0;
  let skipped = 0;
  for (const [ref, obj] of doc.context.enumerateIndirectObjects()) {
    if (!(obj instanceof PDFRawStream)) continue;
    const dict = obj.dict;
    if (name(dict.get(PDFName.of('Subtype'))) !== '/Image') continue;
    images += 1;
    let filter = dict.get(PDFName.of('Filter'));
    if (filter instanceof PDFArray) filter = filter.size() === 1 ? filter.get(0) : null;
    const cs = dict.lookup(PDFName.of('ColorSpace'));
    let csName = name(cs);
    if (cs instanceof PDFArray && name(cs.get(0)) === '/ICCBased') {
      const n = cs.lookup(1)?.dict?.get(PDFName.of('N'));
      csName = n instanceof PDFNumber && n.asNumber() === 3 ? '/DeviceRGB' : n instanceof PDFNumber && n.asNumber() === 1 ? '/DeviceGray' : null;
    }
    const bpc = dict.get(PDFName.of('BitsPerComponent'));
    const plain = name(filter) === '/DCTDecode'
      && ['/DeviceRGB', '/DeviceGray'].includes(csName)
      && (!bpc || (bpc instanceof PDFNumber && bpc.asNumber() === 8))
      && !dict.get(PDFName.of('Decode'))
      && !dict.get(PDFName.of('ImageMask'));
    if (!plain || !shrinkJpeg) { skipped += 1; continue; }
    let small;
    try {
      small = await shrinkJpeg(obj.contents, { maxPx, quality });
    } catch {
      small = null;
    }
    if (!small?.bytes?.length || small.bytes.length >= obj.contents.length * 0.9) continue;
    const next = dict.clone(doc.context);
    next.set(PDFName.of('Width'), PDFNumber.of(small.width));
    next.set(PDFName.of('Height'), PDFNumber.of(small.height));
    next.set(PDFName.of('ColorSpace'), PDFName.of('DeviceRGB'));
    next.set(PDFName.of('BitsPerComponent'), PDFNumber.of(8));
    next.set(PDFName.of('Filter'), PDFName.of('DCTDecode'));
    next.delete(PDFName.of('DecodeParms'));
    next.delete(PDFName.of('Length'));
    doc.context.assign(ref, PDFRawStream.of(next, toUint8(small.bytes)));
    shrunk += 1;
  }
  const out = toUint8(await doc.save({ useObjectStreams: true }));
  return { bytes: out, before: input.length, after: out.length, images, shrunk, skipped };
}
