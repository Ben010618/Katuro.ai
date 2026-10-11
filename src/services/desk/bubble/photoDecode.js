/**
 * photoDecode.js — a photo file's bytes → gray pixels for reader.js (in the app window).
 * iPhone photos (HEIC) are converted first. Large photos are scaled down to 2000 pixels
 * on the long side: plenty for the bubbles and the code, and quick to read.
 */
import { toGray } from './reader.js';
import { convertHeicToJpeg } from '../../localFileSystem.js';

export const MAX_SIDE = 2000;

export async function photoToGray(bytes, name = '') {
  let data = bytes;
  if (/\.(heic|heif)$/i.test(name)) {
    data = await convertHeicToJpeg(bytes, 0.92);
    if (!data) throw new Error('iPhone photos (HEIC) can be read in the KaTuroDesk app only.');
  }
  const bitmap = await createImageBitmap(new Blob([data]), { imageOrientation: 'from-image' });
  try {
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(width, height) : Object.assign(document.createElement('canvas'), { width, height });
    const g = canvas.getContext('2d', { willReadFrequently: true });
    g.imageSmoothingQuality = 'high';
    g.drawImage(bitmap, 0, 0, width, height);
    const { data: rgba } = g.getImageData(0, 0, width, height);
    return { gray: toGray(rgba, width, height), width, height };
  } finally {
    bitmap.close?.();
  }
}
