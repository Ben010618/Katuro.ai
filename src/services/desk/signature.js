/**
 * signature.js — the teacher's e-signature for KaTuroDesk: a photo or a drawing turned into
 * a clean PNG (paper made transparent, cropped to the ink). Saved only on this computer.
 */

/**
 * Paper → transparent, ink kept (its own colour, alpha by darkness); the box around the ink.
 *   data: RGBA pixels (Uint8ClampedArray), w × h
 * → { data, box: { x, y, w, h } | null }
 */
export function cleanSignaturePixels(data, w, h) {
  // The paper is the light majority: take the 90th-percentile brightness as "paper".
  const lum = new Uint8Array(w * h);
  const hist = new Uint32Array(256);
  for (let i = 0; i < w * h; i += 1) {
    const a = data[i * 4 + 3];
    const l = a < 10 ? 255 : Math.round(0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2]);
    lum[i] = l;
    hist[l] += 1;
  }
  let seen = 0;
  let paper = 255;
  for (let l = 0; l < 256; l += 1) { seen += hist[l]; if (seen >= w * h * 0.9) { paper = l; break; } }
  const threshold = Math.max(90, paper - 45);
  const out = new Uint8ClampedArray(data.length);
  let minX = w;
  let minY = h;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const i = y * w + x;
      if (lum[i] >= threshold) continue; // paper: stays transparent
      out[i * 4] = data[i * 4];
      out[i * 4 + 1] = data[i * 4 + 1];
      out[i * 4 + 2] = data[i * 4 + 2];
      out[i * 4 + 3] = Math.min(255, Math.round(((threshold - lum[i]) / threshold) * 255 * 2));
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }
  // A few specks are not a signature.
  const box = maxX < 0 || (maxX - minX < 8 && maxY - minY < 8) ? null : { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
  return { data: out, box };
}

/**
 * A photo/scan (or a drawing on a canvas) → a clean, cropped PNG data URL (desktop app).
 *   source: Blob/File, or an HTMLCanvasElement
 */
export async function prepareSignatureImage(source, { maxWidth = 600 } = {}) {
  let bitmap = source;
  if (!(typeof HTMLCanvasElement !== 'undefined' && source instanceof HTMLCanvasElement)) bitmap = await createImageBitmap(source, { imageOrientation: 'from-image' });
  const scale = Math.min(1, 1400 / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const work = document.createElement('canvas');
  work.width = w;
  work.height = h;
  const g = work.getContext('2d', { willReadFrequently: true });
  g.drawImage(bitmap, 0, 0, w, h);
  const px = g.getImageData(0, 0, w, h);
  const { data, box } = cleanSignaturePixels(px.data, w, h);
  if (!box) throw new Error('I could not find a signature in that picture. Use dark ink on white paper, or draw it here.');
  g.putImageData(new ImageData(data, w, h), 0, 0);
  const pad = 6;
  const cx = Math.max(0, box.x - pad);
  const cy = Math.max(0, box.y - pad);
  const cw = Math.min(w - cx, box.w + pad * 2);
  const ch = Math.min(h - cy, box.h + pad * 2);
  const k = Math.min(1, maxWidth / cw);
  const out = document.createElement('canvas');
  out.width = Math.round(cw * k);
  out.height = Math.round(ch * k);
  out.getContext('2d').drawImage(work, cx, cy, cw, ch, 0, 0, out.width, out.height);
  return out.toDataURL('image/png');
}

/** data:image/png;base64,… → bytes */
export function dataUrlBytes(dataUrl) {
  const b64 = String(dataUrl || '').split(',')[1] || '';
  const bin = typeof atob === 'function' ? atob(b64) : globalThis.Buffer.from(b64, 'base64').toString('binary');
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
}
