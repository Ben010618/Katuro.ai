/**
 * ocr.js — reads the words in photos and scanned PDFs ON THIS COMPUTER (KaTuroDesk desktop app).
 *
 * Tesseract (open source, Apache-2.0: github.com/naptha/tesseract.js) with the English and
 * Tagalog language data (tessdata, Apache-2.0; packaged by @tesseract.js-data, MIT). Nothing is
 * sent anywhere: no internet, no AI, no cost. The engine files ship with the desktop app
 * (dist/desk-ocr, see vite.config.js), so it works offline from the first start.
 *
 * Used where a scan or photo used to be skipped because "its text is a picture", e.g. Search my
 * files. It reads printed text well and neat handwriting only sometimes, so its words are used to
 * FIND files, never as a source of scores or names that are written into a record.
 */

export const OCR_LANGS = 'eng+tgl';
export const MAX_OCR_PAGES = 8; // scanned PDF pages read per file
export const OCR_IMAGE = /\.(jpe?g|png|webp|bmp|gif)$/i; // HEIC photos are not readable here
const IDLE_MS = 90_000; // the engine (about 40 MB of memory) is closed when not used for a while
const JOB_MS = 60_000; // one page never blocks a search for longer than this
const CACHE_MAX = 300;

const isDesktop = () => typeof window !== 'undefined' && Boolean(window.katuroDeskApi?.isElectron);

/** Can this computer read scans by itself? (KaTuroDesk only; not the website or the phone.) */
export const ocrAvailable = () => isDesktop();

/** Tidies Tesseract's text: no stray symbols-only lines, single spaces, at most one blank line. */
export function cleanOcrText(text) {
  return String(text || '')
    .replace(/\r/g, '')
    .split('\n')
    .map((l) => l.replace(/[ \t]+/g, ' ').trim())
    .filter((l) => !l || /[\p{L}\p{N}]/u.test(l))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function withTimeout(promise, ms, what) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`${what} took too long`)), ms); }),
  ]).finally(() => clearTimeout(timer));
}

function deskAssets() {
  const base = new URL('./desk-ocr/', document.baseURI).href;
  return { workerPath: `${base}worker.min.js`, corePath: base, langPath: `${base}lang` };
}

/**
 * The reader. `deps` are swapped in tests:
 *   createWorker(langs, oem, options) → { recognize(image) → { data: { text, confidence } }, terminate() }
 *   pdfPages(bytes, maxPages) → { pages: [image], total } (page images to read)
 */
export function createOcr(deps = {}) {
  const {
    createWorker = async (...a) => (await import('tesseract.js')).createWorker(...a),
    pdfPages = renderPdfPages,
    assets = deskAssets,
    idleMs = IDLE_MS,
    jobMs = JOB_MS,
  } = deps;
  let worker = null; // Promise<worker>
  let idleTimer = null;
  let queue = Promise.resolve();
  const cache = new Map(); // key → Promise<result>

  async function getWorker() {
    if (!worker) {
      worker = createWorker(OCR_LANGS, 1 /* LSTM only */, {
        ...assets(),
        workerBlobURL: false,
        cacheMethod: 'none', // the language files are already on this computer
        gzip: true,
      }).catch((err) => {
        worker = null;
        throw err;
      });
    }
    return worker;
  }

  function armIdle() {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => { close(); }, idleMs);
  }

  /** One image at a time (the engine is single-threaded); a stuck page restarts the engine. */
  function readOne(image) {
    const job = queue.then(async () => {
      clearTimeout(idleTimer);
      const w = await getWorker();
      try {
        const { data } = await withTimeout(w.recognize(image), jobMs, 'Reading the page');
        return { text: cleanOcrText(data?.text), confidence: Math.round(Number(data?.confidence) || 0) };
      } catch (err) {
        await close();
        throw err;
      } finally {
        armIdle();
      }
    });
    queue = job.catch(() => {});
    return job;
  }

  async function close() {
    clearTimeout(idleTimer);
    const w = worker;
    worker = null;
    if (w) {
      try {
        await (await w).terminate();
      } catch {
        // already gone
      }
    }
  }

  /**
   * The text of one scan or photo → { pages: [{ number, text, confidence }], total, read }
   * (`read` pages were read out of `total`). Cached per file version (`key`).
   */
  function readFile({ key, kind, getBytes, mimeType = '' }) {
    if (key && cache.has(key)) return cache.get(key);
    const run = (async () => {
      const bytes = await getBytes();
      if (kind === 'pdf') {
        const { pages, total } = await pdfPages(bytes, MAX_OCR_PAGES);
        const out = [];
        for (const [i, img] of pages.entries()) out.push({ number: i + 1, ...(await readOne(img)) });
        return { pages: out, total, read: out.length };
      }
      const blob = typeof Blob !== 'undefined' && !(bytes instanceof Blob) ? new Blob([bytes], { type: mimeType || 'image/png' }) : bytes;
      return { pages: [{ number: 1, ...(await readOne(blob)) }], total: 1, read: 1 };
    })();
    if (key) {
      cache.set(key, run);
      run.catch(() => cache.delete(key)); // a failed read is tried again next time
      while (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value);
    }
    return run;
  }

  return { readFile, readOne, close, get cacheSize() { return cache.size; } };
}

/** The first `maxPages` pages of a PDF as page images (white background, about 200 dpi). */
async function renderPdfPages(bytes, maxPages) {
  const { loadPdfjs } = await import('./index.js');
  const pdfjs = await loadPdfjs();
  const doc = await pdfjs.getDocument({ data: bytes.slice(), isEvalSupported: false, verbosity: 0 }).promise;
  try {
    const pages = [];
    const count = Math.min(doc.numPages, maxPages);
    for (let i = 1; i <= count; i++) {
      const page = await doc.getPage(i);
      const base = page.getViewport({ scale: 1 });
      const scale = Math.min(2.8, 2200 / Math.max(base.width, base.height));
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const context = canvas.getContext('2d');
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: context, viewport }).promise;
      pages.push(canvas);
      page.cleanup?.();
    }
    return { pages, total: doc.numPages };
  } finally {
    try {
      await doc.destroy();
    } catch {
      // ignore
    }
  }
}

let shared = null;
/** The one reader KaTuroDesk uses. */
export function deskOcr() {
  if (!shared) shared = createOcr();
  return shared;
}
