/**
 * visionPrep.js — sends scans and photos to the AI in the smallest form that keeps every page.
 *
 * Phone photos and scanned PDFs are often several MB; uploading them as-is is slow.
 * Photos are downscaled to JPEG; scanned PDFs of up to MAX_PDF_PAGES pages are rendered
 * to one compact JPEG per page. Longer PDFs (and environments without a canvas, e.g.
 * tests) are sent unchanged so no page is ever dropped.
 */

import { loadPdfjs } from '../readers/index.js';
import { bytesToBase64, prepareImageForVision } from './llm.js';

export const SMALL_ENOUGH_BYTES = 1_500_000;
export const MAX_PDF_PAGES = 10;

function makeCanvas(w, h) {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  if (typeof document !== 'undefined') {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    return c;
  }
  return null;
}

async function canvasToJpegBase64(canvas, quality) {
  if (typeof canvas.convertToBlob === 'function') {
    const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality });
    return bytesToBase64(new Uint8Array(await blob.arrayBuffer()));
  }
  const dataUrl = canvas.toDataURL('image/jpeg', quality);
  return dataUrl.slice(dataUrl.indexOf(',') + 1);
}

/** Renders every page of a short PDF to JPEG parts, or returns null to mean "send the PDF as is". */
export async function pdfToImageParts(bytes, { maxPages = MAX_PDF_PAGES, maxDim = 1600, quality = 0.8 } = {}) {
  if (!makeCanvas(1, 1)) return null;
  let doc;
  try {
    const pdfjs = await loadPdfjs();
    doc = await pdfjs.getDocument({ data: bytes.slice(), isEvalSupported: false, verbosity: 0 }).promise;
    if (doc.numPages > maxPages) return null; // keep every page: send the original PDF instead
    const parts = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const base = page.getViewport({ scale: 1 });
      const scale = Math.min(2, maxDim / Math.max(base.width, base.height));
      const viewport = page.getViewport({ scale });
      const canvas = makeCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
      const context = canvas.getContext('2d');
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: context, viewport }).promise;
      parts.push({ inlineData: { mimeType: 'image/jpeg', data: await canvasToJpegBase64(canvas, quality) } });
      page.cleanup?.();
    }
    return parts;
  } catch {
    return null;
  } finally {
    try {
      await doc?.destroy?.();
    } catch {
      // ignore
    }
  }
}

/**
 * Vision parts for one parsed file (that needsVision). `getBytes` is only called when
 * the original bytes are needed for downscaling.
 */
export async function visionPartsFor(parsed, getBytes) {
  if (!parsed?.needsVision || !parsed.vision) return [];
  const { mimeType, base64 } = parsed.vision;
  const approxBytes = Math.floor((base64.length * 3) / 4);
  if (approxBytes <= SMALL_ENOUGH_BYTES) return [{ inlineData: { mimeType, data: base64 } }];
  try {
    const bytes = await getBytes();
    if (mimeType === 'application/pdf') {
      const pages = await pdfToImageParts(bytes);
      if (pages?.length) return pages;
    } else if (mimeType.startsWith('image/')) {
      const small = await prepareImageForVision(bytes, mimeType);
      return [{ inlineData: { mimeType: small.mimeType, data: small.data } }];
    }
  } catch {
    // fall through to the original
  }
  return [{ inlineData: { mimeType, data: base64 } }];
}
