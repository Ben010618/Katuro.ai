import { describe, it, expect, vi, afterEach } from 'vitest';
import { cleanOcrText, createOcr, ocrAvailable, OCR_IMAGE, OCR_LANGS, MAX_OCR_PAGES } from './ocr.js';

// A stand-in for Tesseract's worker (the tests run without a browser or WebAssembly).
function fakeTesseract({ text = 'Santos, Maria  28', delay = 0, failFirst = false } = {}) {
  const made = [];
  const createWorker = vi.fn(async (langs, oem, options) => {
    const w = {
      langs, oem, options, terminated: false, jobs: 0,
      recognize: vi.fn(async (image) => {
        w.jobs += 1;
        if (failFirst && made.length === 1 && w.jobs === 1) throw new Error('engine crashed');
        if (delay) await new Promise((r) => setTimeout(r, delay));
        return { data: { text: typeof text === 'function' ? text(image) : text, confidence: 87.6 } };
      }),
      terminate: vi.fn(async () => { w.terminated = true; }),
    };
    made.push(w);
    return w;
  });
  return { createWorker, made };
}

const assets = () => ({ workerPath: 'x/worker.min.js', corePath: 'x/', langPath: 'x/lang' });
const bytes = () => Promise.resolve(new Uint8Array([1, 2, 3]));

afterEach(() => { vi.useRealTimers(); delete globalThis.window; });

describe('ocr (reading scans on this computer)', () => {
  it('is only offered inside KaTuroDesk', () => {
    expect(ocrAvailable()).toBe(false);
    globalThis.window = { katuroDeskApi: { isElectron: true } };
    expect(ocrAvailable()).toBe(true);
  });

  it('tidies the text: single spaces, no symbol-only lines, at most one blank line', () => {
    expect(cleanOcrText('  Santos,   Maria\t 28 \r\n|||\n\n\n\n— ~\nGrade 7  ')).toBe('Santos, Maria 28\n\nGrade 7');
    expect(cleanOcrText(null)).toBe('');
  });

  it('starts one English + Tagalog engine from the shipped files, offline (no cache, no CDN)', async () => {
    const t = fakeTesseract();
    const ocr = createOcr({ createWorker: t.createWorker, assets });
    const r = await ocr.readFile({ key: 'a.jpg|1|1', kind: 'image', getBytes: bytes });
    expect(r).toEqual({ pages: [{ number: 1, text: 'Santos, Maria 28', confidence: 88 }], total: 1, read: 1 });
    await ocr.readFile({ key: 'b.jpg|1|1', kind: 'image', getBytes: bytes });
    expect(t.createWorker).toHaveBeenCalledTimes(1);
    const [langs, oem, options] = t.createWorker.mock.calls[0];
    expect(langs).toBe(OCR_LANGS);
    expect(oem).toBe(1);
    expect(options).toMatchObject({ workerPath: 'x/worker.min.js', corePath: 'x/', langPath: 'x/lang', workerBlobURL: false, cacheMethod: 'none' });
    await ocr.close();
    expect(t.made[0].terminated).toBe(true);
  });

  it('reads each file version once (cached), and again after it changes', async () => {
    const t = fakeTesseract();
    const ocr = createOcr({ createWorker: t.createWorker, assets });
    const getBytes = vi.fn(bytes);
    await ocr.readFile({ key: 'a.jpg|10|5', kind: 'image', getBytes });
    await ocr.readFile({ key: 'a.jpg|10|5', kind: 'image', getBytes });
    expect(getBytes).toHaveBeenCalledTimes(1);
    await ocr.readFile({ key: 'a.jpg|11|6', kind: 'image', getBytes });
    expect(getBytes).toHaveBeenCalledTimes(2);
    await ocr.close();
  });

  it('a scanned PDF: its first pages are read one by one, numbered', async () => {
    const t = fakeTesseract({ text: (img) => `Page text ${img}` });
    const pdfPages = vi.fn(async (_b, max) => ({ pages: ['p1', 'p2', 'p3'].slice(0, max), total: 12 }));
    const ocr = createOcr({ createWorker: t.createWorker, assets, pdfPages });
    const r = await ocr.readFile({ key: 's.pdf|1|1', kind: 'pdf', getBytes: bytes });
    expect(pdfPages).toHaveBeenCalledWith(expect.any(Uint8Array), MAX_OCR_PAGES);
    expect(r.pages.map((p) => [p.number, p.text])).toEqual([[1, 'Page text p1'], [2, 'Page text p2'], [3, 'Page text p3']]);
    expect(r).toMatchObject({ total: 12, read: 3 });
    await ocr.close();
  });

  it('a crash restarts the engine; the failed file is not cached and reads fine the next time', async () => {
    const t = fakeTesseract({ failFirst: true });
    const ocr = createOcr({ createWorker: t.createWorker, assets });
    await expect(ocr.readFile({ key: 'a.jpg|1|1', kind: 'image', getBytes: bytes })).rejects.toThrow('engine crashed');
    expect(t.made[0].terminated).toBe(true);
    const r = await ocr.readFile({ key: 'a.jpg|1|1', kind: 'image', getBytes: bytes });
    expect(r.pages[0].text).toBe('Santos, Maria 28');
    expect(t.createWorker).toHaveBeenCalledTimes(2);
    await ocr.close();
  });

  it('a page that takes too long is stopped, so a search never hangs', async () => {
    const t = fakeTesseract({ delay: 200 });
    const ocr = createOcr({ createWorker: t.createWorker, assets, jobMs: 20 });
    await expect(ocr.readFile({ key: 'slow.jpg|1|1', kind: 'image', getBytes: bytes })).rejects.toThrow(/too long/);
    expect(t.made[0].terminated).toBe(true);
    await ocr.close();
  });

  it('pages queue up (one at a time) and the engine closes itself when idle', async () => {
    vi.useFakeTimers();
    const t = fakeTesseract();
    const ocr = createOcr({ createWorker: t.createWorker, assets, idleMs: 1000 });
    const all = Promise.all([1, 2, 3].map((n) => ocr.readFile({ key: `${n}.png|1|1`, kind: 'image', getBytes: bytes })));
    await vi.advanceTimersByTimeAsync(10);
    const res = await all;
    expect(res).toHaveLength(3);
    expect(t.made).toHaveLength(1);
    expect(t.made[0].jobs).toBe(3);
    expect(t.made[0].terminated).toBe(false);
    await vi.advanceTimersByTimeAsync(1001);
    expect(t.made[0].terminated).toBe(true);
  });

  it('photo types it can read (HEIC cannot be read here)', () => {
    expect(['a.jpg', 'b.JPEG', 'c.png', 'd.webp'].every((n) => OCR_IMAGE.test(n))).toBe(true);
    expect(OCR_IMAGE.test('e.heic')).toBe(false);
  });
});
