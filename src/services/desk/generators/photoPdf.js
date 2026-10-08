/**
 * photoPdf.js — photos (JPEG / PNG / iPhone HEIC) prepared for one clean PDF, by code only:
 * HEIC → JPEG, EXIF rotation, size reduction, and a natural file-name order
 * (IMG_2 before IMG_10). Also the image shrinker used by PDF compression.
 */

export const PHOTO_FILE = /\.(jpe?g|png|heic|heif)$/i;

/** Size presets: longest side in pixels and JPEG quality. */
export const PHOTO_QUALITY = {
  small: { maxPx: 1400, quality: 0.7 },
  standard: { maxPx: 2000, quality: 0.82 },
  high: { maxPx: 3000, quality: 0.9 },
};

const collator = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });
/** File-name order the way people count: "Page 2" before "Page 10". */
export function naturalSort(paths) {
  return [...paths].sort((a, b) => collator.compare(String(a), String(b)));
}

export const isPng = (u8) => u8[0] === 0x89 && u8[1] === 0x50 && u8[2] === 0x4e && u8[3] === 0x47;
export const isJpg = (u8) => u8[0] === 0xff && u8[1] === 0xd8;
/** HEIC/HEIF files start with an "ftyp" box naming a HEIF brand. */
export function isHeic(u8) {
  if (u8.length < 12) return false;
  const box = String.fromCharCode(...u8.slice(4, 8));
  const brand = String.fromCharCode(...u8.slice(8, 12));
  return box === 'ftyp' && /^(heic|heix|hevc|hevx|heim|heis|mif1|msf1)$/.test(brand);
}

/** EXIF orientation of a JPEG (1 = upright; 3 = upside down; 6 / 8 = turned). */
export function jpegOrientation(u8) {
  if (!isJpg(u8)) return 1;
  let i = 2;
  while (i + 4 < u8.length) {
    if (u8[i] !== 0xff) return 1;
    const marker = u8[i + 1];
    const len = (u8[i + 2] << 8) | u8[i + 3];
    if (marker === 0xda || marker === 0xd9) return 1; // image data starts: no EXIF
    if (marker === 0xe1 && String.fromCharCode(...u8.slice(i + 4, i + 8)) === 'Exif') {
      const t = i + 10; // TIFF header
      const le = u8[t] === 0x49;
      const r16 = (o) => (le ? u8[o] | (u8[o + 1] << 8) : (u8[o] << 8) | u8[o + 1]);
      const r32 = (o) => (le ? (u8[o] | (u8[o + 1] << 8) | (u8[o + 2] << 16) | (u8[o + 3] << 24)) >>> 0 : ((u8[o] << 24) | (u8[o + 1] << 16) | (u8[o + 2] << 8) | u8[o + 3]) >>> 0);
      const ifd = t + r32(t + 4);
      const count = r16(ifd);
      for (let e = 0; e < count; e += 1) {
        const at = ifd + 2 + e * 12;
        if (at + 10 > u8.length) break;
        if (r16(at) === 0x0112) {
          const v = r16(at + 8);
          return v >= 1 && v <= 8 ? v : 1;
        }
      }
      return 1;
    }
    i += 2 + len;
  }
  return 1;
}

/** The same JPEG without its EXIF block (so nothing re-rotates the stored pixels). */
export function stripJpegExif(u8) {
  if (!isJpg(u8)) return u8;
  const parts = [u8.slice(0, 2)];
  let i = 2;
  while (i + 4 <= u8.length && u8[i] === 0xff) {
    const marker = u8[i + 1];
    if (marker === 0xda) break; // image data follows; keep the rest as is
    const len = (u8[i + 2] << 8) | u8[i + 3];
    if (marker !== 0xe1) parts.push(u8.slice(i, i + 2 + len));
    i += 2 + len;
  }
  parts.push(u8.slice(i));
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) { out.set(p, at); at += p.length; }
  return out;
}

/**
 * Browser re-encode (desktop app): applies the EXIF rotation, scales the longest side
 * down to maxPx, white background (for transparent PNGs), JPEG out.
 * asStored: keep the pixels as stored (images inside a PDF: viewers ignore EXIF rotation).
 * → { bytes, width, height } or null where no canvas exists (tests, Node).
 */
export async function browserShrink(bytes, mime, { maxPx, quality, asStored = false }) {
  if (typeof createImageBitmap !== 'function' || typeof OffscreenCanvas === 'undefined') return null;
  const src = asStored ? stripJpegExif(bytes) : bytes;
  const bitmap = await createImageBitmap(new Blob([src], { type: mime }), { imageOrientation: 'from-image' });
  try {
    const scale = Math.min(1, maxPx / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = new OffscreenCanvas(width, height);
    const g = canvas.getContext('2d');
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, width, height);
    g.drawImage(bitmap, 0, 0, width, height);
    const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality });
    return { bytes: new Uint8Array(await blob.arrayBuffer()), width, height };
  } finally {
    bitmap.close?.();
  }
}

/**
 * One photo ready for the PDF.
 *   photo: { bytes, name }
 *   opts: { heicToJpeg(bytes) → bytes|null, shrink(bytes, mime, {maxPx, quality}) → {bytes}|null, level }
 * → { bytes, mimeType, name, converted: 'heic'|null, shrunk: boolean }
 */
export async function preparePhoto(photo, { heicToJpeg, shrink = browserShrink, level = 'standard' } = {}) {
  let u8 = photo.bytes instanceof Uint8Array ? photo.bytes : new Uint8Array(photo.bytes);
  const name = String(photo.name || 'photo');
  let converted = null;
  if (isHeic(u8) || /\.(heic|heif)$/i.test(name)) {
    const jpeg = heicToJpeg ? await heicToJpeg(u8) : null;
    if (!jpeg) throw new Error(`${name.split('/').pop()} is an iPhone photo (HEIC). Converting it needs the KaTuroDesk desktop app.`);
    u8 = jpeg instanceof Uint8Array ? jpeg : new Uint8Array(jpeg);
    converted = 'heic';
  }
  let mimeType = isPng(u8) ? 'image/png' : isJpg(u8) ? 'image/jpeg' : null;
  if (!mimeType) throw new Error(`${name.split('/').pop()} is not a JPEG, PNG or HEIC photo.`);
  const preset = PHOTO_QUALITY[level] || PHOTO_QUALITY.standard;
  let shrunk = false;
  const small = await (shrink ? shrink(u8, mimeType, preset) : null);
  // Keep the re-encoded copy when it is smaller, or when it fixes a sideways photo.
  if (small?.bytes?.length && (small.bytes.length < u8.length || jpegOrientation(u8) !== 1)) {
    u8 = small.bytes;
    mimeType = 'image/jpeg';
    shrunk = true;
  }
  return { bytes: u8, mimeType, name, converted, shrunk };
}
