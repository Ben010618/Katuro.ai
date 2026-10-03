import { describe, it, expect, vi } from 'vitest';
import { visionPartsFor, pdfToImageParts, SMALL_ENOUGH_BYTES } from './visionPrep';

const b64 = (n) => 'A'.repeat(Math.ceil((n * 4) / 3));

describe('visionPartsFor', () => {
  it('sends small scans unchanged without reading bytes', async () => {
    const getBytes = vi.fn();
    const parts = await visionPartsFor({ needsVision: true, vision: { mimeType: 'application/pdf', base64: b64(1000) } }, getBytes);
    expect(parts).toHaveLength(1);
    expect(parts[0].inlineData.mimeType).toBe('application/pdf');
    expect(getBytes).not.toHaveBeenCalled();
  });

  it('keeps a large PDF intact when pages cannot be rendered (no canvas) — never drops pages', async () => {
    const parsed = { needsVision: true, vision: { mimeType: 'application/pdf', base64: b64(SMALL_ENOUGH_BYTES + 10) } };
    const parts = await visionPartsFor(parsed, async () => new Uint8Array([1, 2, 3]));
    expect(parts).toEqual([{ inlineData: { mimeType: 'application/pdf', data: parsed.vision.base64 } }]);
  });

  it('returns nothing for files that do not need vision', async () => {
    expect(await visionPartsFor({ needsVision: false }, vi.fn())).toEqual([]);
  });

  it('pdfToImageParts declines in environments without a canvas', async () => {
    expect(await pdfToImageParts(new Uint8Array([1]))).toBeNull();
  });
});
