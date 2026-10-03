import { describe, it, expect, beforeAll } from 'vitest';
import { Document, Packer, Paragraph, HeadingLevel, TextRun } from 'docx';
import * as XLSX from 'xlsx';
import { readDocument } from '../readers/index.js';
import { createFileIndex, createMemoryStorage, createIdbStorage, trimForStorage, fingerprintOf } from './fileIndex.js';

const enc = (s) => new TextEncoder().encode(s);
const T0 = Date.UTC(2026, 9, 1);

let DOCX;
let XLSX_BYTES;

async function makeDocx() {
  const doc = new Document({
    sections: [{
      children: [
        new Paragraph({ text: 'WEEK 1: INTRODUCTION TO CELL THEORY', heading: HeadingLevel.HEADING_1 }),
        new Paragraph({ children: [new TextRun('Learners describe the parts of a cell and their functions.')] }),
      ],
    }],
  });
  return new Uint8Array(await Packer.toArrayBuffer(doc));
}

function makeScoreXlsx() {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([
    ['No.', 'Name', 1, 2, 3, 4, 5],
    [1, 'Dela Cruz, Juan', 1, 0, 1, 1, 0],
    [2, 'Reyes, Mark', 1, 1, 1, 0, 1],
    [3, 'Santos, Maria', 0, 1, 1, 1, 1],
  ]);
  XLSX.utils.book_append_sheet(wb, ws, 'Quiz 1');
  return new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }));
}

beforeAll(async () => {
  DOCX = await makeDocx();
  XLSX_BYTES = makeScoreXlsx();
});

const file = (path, bytes, extra = {}) => ({
  kind: 'file',
  path,
  name: path.split('/').pop(),
  size: bytes.byteLength,
  lastModified: T0,
  bytes,
  ...extra,
});

const folder = (name, children) => ({ kind: 'directory', name, path: name, children });

function baseTree() {
  return [
    folder('Lessons', [file('Lessons/week1.docx', DOCX, { lastModified: T0 + 3000 })]),
    file('scores.xlsx', XLSX_BYTES, { lastModified: T0 + 2000 }),
    file('notes.txt', enc('Reminder: submit DLL on Friday.\nSecond line.'), { lastModified: T0 + 1000 }),
  ];
}

function countingReader() {
  const calls = [];
  const read = async (input) => {
    calls.push(input.name);
    return readDocument(input);
  };
  read.calls = calls;
  read.count = (name) => calls.filter((n) => n === name).length;
  return read;
}

function gate() {
  let open;
  const p = new Promise((r) => {
    open = r;
  });
  return { p, open };
}

describe('createFileIndex — background indexing', () => {
  it('indexes every supported file, reports progress, and describes them', async () => {
    const read = countingReader();
    const index = createFileIndex({ storage: createMemoryStorage(), read });
    const events = [];
    await index.start({ workspaceId: 'ws1', files: baseTree(), onProgress: (e) => events.push(e) });

    // most recently modified first
    expect(read.calls).toEqual(['week1.docx', 'scores.xlsx', 'notes.txt']);
    expect(index.status()).toEqual({ running: false, done: 3, total: 3, failed: 0 });
    expect(events[0]).toEqual({ done: 0, total: 3, current: null });
    expect(events.at(-1)).toMatchObject({ done: 3, total: 3 });
    expect(events.slice(1).map((e) => e.current).sort()).toEqual(['Lessons/week1.docx', 'notes.txt', 'scores.xlsx']);

    expect(index.describe('Lessons/week1.docx')).toMatch(/^Word · \d+ words · "WEEK 1: INTRODUCTION TO CELL THEORY"$/);
    expect(index.describe('scores.xlsx')).toBe('Excel · score sheet: 3 learners × 5 items');
    expect(index.describe('notes.txt')).toBe('Text · 7 words · "Reminder: submit DLL on Friday."');
    expect(index.describe('Lessons\\week1.docx')).toContain('Word');
    expect(index.describe('missing.docx')).toBeNull();

    const sums = index.summaries();
    expect(sums.size).toBe(3);
    expect(sums.get('Lessons/week1.docx')).toMatchObject({ kind: 'docx', title: 'WEEK 1: INTRODUCTION TO CELL THEORY' });
    expect(typeof sums.get('scores.xlsx').updatedAt).toBe('number');
  });

  it('get() returns the cached doc; a new session reuses the cache without re-reading', async () => {
    const storage = createMemoryStorage();
    const read1 = countingReader();
    const a = createFileIndex({ storage, read: read1 });
    await a.start({ workspaceId: 'ws1', files: baseTree() });
    const doc = await a.get('Lessons/week1.docx');
    expect(doc.kind).toBe('docx');
    expect(doc.text).toContain('INTRODUCTION TO CELL THEORY');

    const read2 = countingReader();
    const b = createFileIndex({ storage, read: read2 });
    await b.start({ workspaceId: 'ws1', files: baseTree() });
    expect(read2.calls).toEqual([]);
    expect(b.status()).toMatchObject({ done: 3, total: 3 });
    expect(b.describe('scores.xlsx')).toContain('score sheet');
    expect((await b.get('scores.xlsx')).sheets[0].rows).toHaveLength(4);
    const ensured = await b.ensure('notes.txt', baseTree()[2]);
    expect(ensured.text).toContain('Reminder');
    expect(read2.calls).toEqual([]);
  });

  it('a changed lastModified invalidates the cache entry', async () => {
    const storage = createMemoryStorage();
    const read = countingReader();
    const index = createFileIndex({ storage, read });
    await index.start({ workspaceId: 'ws1', files: baseTree() });

    const tree = baseTree();
    tree[2] = file('notes.txt', enc('Changed text now.'), { lastModified: T0 + 9999 });
    const running = index.start({ workspaceId: 'ws1', files: tree });
    expect(await index.get('notes.txt')).toBeNull();
    expect(await index.get('scores.xlsx')).not.toBeNull();
    await running;
    expect(read.count('notes.txt')).toBe(2);
    expect(read.count('scores.xlsx')).toBe(1);
    expect((await index.get('notes.txt')).text).toBe('Changed text now.');
    expect(index.describe('notes.txt')).toContain('"Changed text now."');
  });

  it('demo files without real bytes are fingerprinted by content', () => {
    const a = { path: 'a.docx', name: 'a.docx', content: 'hello', lastModified: 1 };
    const b = { ...a, lastModified: 2 };
    const c = { ...a, content: 'hellp' };
    expect(fingerprintOf(a)).toBe(fingerprintOf(b));
    expect(fingerprintOf(a)).not.toBe(fingerprintOf(c));
    expect(fingerprintOf({ path: 'x.pdf', bytes: new Uint8Array([1, 2]) })).toMatch(/^b:2:/);
    expect(fingerprintOf({ path: 'x.pdf' })).toBeNull();
  });

  it('ensure() on a file being indexed awaits the same parse', async () => {
    const g = gate();
    let docxReads = 0;
    const read = async (input) => {
      if (input.name === 'week1.docx') {
        docxReads += 1;
        await g.p;
      }
      return readDocument(input);
    };
    const index = createFileIndex({ storage: createMemoryStorage(), read });
    const tree = baseTree();
    const running = index.start({ workspaceId: 'ws1', files: tree });
    while (docxReads === 0) await new Promise((r) => setTimeout(r, 1));
    const ensured = index.ensure('Lessons/week1.docx', tree[0].children[0], null);
    g.open();
    const doc = await ensured;
    await running;
    expect(doc.kind).toBe('docx');
    expect(docxReads).toBe(1);
  });

  it('ensure() before the queue reaches a file is not parsed twice', async () => {
    const read = countingReader();
    const index = createFileIndex({ storage: createMemoryStorage(), read });
    const tree = baseTree();
    const running = index.start({ workspaceId: 'ws1', files: tree });
    await index.ensure('notes.txt', tree[2], null);
    await running;
    expect(read.count('notes.txt')).toBe(1);
    expect(index.status()).toMatchObject({ done: 3, total: 3 });
  });

  it('cancel() stops all writes from the cancelled run', async () => {
    const g = gate();
    let started = false;
    const read = async (input) => {
      started = true;
      await g.p;
      return readDocument(input);
    };
    const mem = createMemoryStorage();
    let cancelledAt = null;
    const lateWrites = [];
    const storage = {
      ...mem,
      async set(rec) {
        if (cancelledAt !== null) lateWrites.push(rec.key);
        return mem.set(rec);
      },
      async delete(key) {
        if (cancelledAt !== null) lateWrites.push(`delete:${key}`);
        return mem.delete(key);
      },
    };
    const index = createFileIndex({ storage, read });
    const events = [];
    const running = index.start({ workspaceId: 'ws1', files: baseTree(), onProgress: (e) => events.push(e) });
    while (!started) await new Promise((r) => setTimeout(r, 1));
    index.cancel();
    cancelledAt = events.length;
    g.open();
    await running;
    await new Promise((r) => setTimeout(r, 20));
    expect(lateWrites).toEqual([]);
    expect(events.length).toBe(cancelledAt);
    expect(index.status().running).toBe(false);
    expect(index.describe('Lessons/week1.docx')).toBeNull();
  });

  it('a new start() on another workspace cancels the old run cleanly', async () => {
    const g = gate();
    let started = false;
    const read = async (input) => {
      if (input.name === 'week1.docx') {
        started = true;
        await g.p;
      }
      return readDocument(input);
    };
    const storage = createMemoryStorage();
    const index = createFileIndex({ storage, read });
    const first = index.start({ workspaceId: 'old', files: baseTree() });
    while (!started) await new Promise((r) => setTimeout(r, 1));
    const second = index.start({ workspaceId: 'new', files: [file('other.txt', enc('Other class'))] });
    g.open();
    await Promise.all([first, second]);
    expect(await storage.keys('old::')).not.toContain('old::Lessons/week1.docx');
    expect(await storage.keys('new::')).toEqual(['new::other.txt']);
    expect(index.describe('other.txt')).toContain('Other class');
    expect(index.describe('notes.txt')).toBeNull();
  });

  it('prunes cached entries for paths that were deleted', async () => {
    const storage = createMemoryStorage();
    const index = createFileIndex({ storage, read: countingReader() });
    await index.start({ workspaceId: 'ws1', files: baseTree() });
    expect(await storage.keys('ws1::')).toHaveLength(3);
    expect(await storage.keys('doc::ws1::')).toHaveLength(3);

    const tree = baseTree().slice(1);
    await index.start({ workspaceId: 'ws1', files: tree });
    expect((await storage.keys('ws1::')).sort()).toEqual(['ws1::notes.txt', 'ws1::scores.xlsx']);
    expect(await storage.keys('doc::ws1::Lessons')).toEqual([]);
    expect(index.describe('Lessons/week1.docx')).toBeNull();
  });

  it('skips oversize, unsupported and backup files', async () => {
    const read = countingReader();
    const index = createFileIndex({ storage: createMemoryStorage(), read });
    const tree = [
      file('big.pdf', enc('x'), { size: 30 * 1024 * 1024 }),
      file('photo.heic', enc('x')),
      folder('KaTuro Backups', [file('KaTuro Backups/2026-10-01/plan.docx', DOCX)]),
      file('ok.txt', enc('fine')),
    ];
    await index.start({ workspaceId: 'ws1', files: tree });
    expect(read.calls).toEqual(['ok.txt']);
    expect(index.status()).toMatchObject({ done: 1, total: 1 });
    expect(index.describe('big.pdf')).toBeNull();
  });

  it('records a corrupt file as a failure without throwing', async () => {
    const throwingBytes = async (h, entry) => {
      if (entry.name === 'locked.txt') throw new Error('EBUSY: file is locked');
      return entry.bytes;
    };
    const index = createFileIndex({ storage: createMemoryStorage(), readBytes: throwingBytes });
    const tree = [
      file('broken.docx', new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8])),
      file('locked.txt', enc('x')),
      file('ok.txt', enc('fine')),
    ];
    await expect(index.start({ workspaceId: 'ws1', files: tree })).resolves.toBeUndefined();
    expect(index.status()).toEqual({ running: false, done: 3, total: 3, failed: 2 });
    expect(index.describe('broken.docx')).toMatch(/^could not read: /);
    expect(index.describe('locked.txt')).toBe('could not read: EBUSY: file is locked');
    expect(index.describe('ok.txt')).toContain('Text');
    await expect(index.ensure('locked.txt')).rejects.toThrow('EBUSY');
  });

  it('trimmed docs come back trimmed from cache but full from ensure({ full: true })', async () => {
    const storage = createMemoryStorage();
    const big = 'word '.repeat(80000); // 400 KB
    const tree = [file('big.txt', enc(big))];
    await createFileIndex({ storage }).start({ workspaceId: 'ws1', files: tree });

    const read = countingReader();
    const index = createFileIndex({ storage, read });
    await index.start({ workspaceId: 'ws1', files: tree });
    const cached = await index.ensure('big.txt', tree[0], null);
    expect(cached.text.length).toBe(300 * 1024);
    expect(read.calls).toEqual([]);
    const full = await index.ensure('big.txt', tree[0], null, { full: true });
    expect(full.text.length).toBe(big.length);
    expect(read.calls).toEqual(['big.txt']);
  });

  it('needsVision docs: cache keeps the text side, ensure({ full: true }) re-reads for vision', async () => {
    const storage = createMemoryStorage();
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4]);
    const tree = [file('chart.png', png)];
    await createFileIndex({ storage }).start({ workspaceId: 'ws1', files: tree });
    const stored = await storage.get('doc::ws1::chart.png');
    expect(stored.parsed.needsVision).toBe(true);
    expect(stored.parsed.vision).toBeUndefined();

    const read = countingReader();
    const index = createFileIndex({ storage, read });
    await index.start({ workspaceId: 'ws1', files: tree });
    expect(index.describe('chart.png')).toBe('Image · needs AI vision');
    const lite = await index.ensure('chart.png', tree[0], null);
    expect(lite.vision).toBeUndefined();
    expect(read.calls).toEqual([]);
    const full = await index.ensure('chart.png', tree[0], null, { full: true });
    expect(full.vision.mimeType).toBe('image/png');
    expect(full.vision.base64.length).toBeGreaterThan(0);
    expect(read.calls).toEqual(['chart.png']);
  });
});

describe('trimForStorage', () => {
  it('caps sheets, drops big html and vision, and refuses huge docs', () => {
    const rows = Array.from({ length: 4000 }, (_, i) => [i]);
    const { doc, trimmed } = trimForStorage({ kind: 'xlsx', text: 't', sheets: [{ name: 'S', rows, rowCount: 4000 }], vision: { base64: 'x' } });
    expect(trimmed).toBe(true);
    expect(doc.sheets[0].rows).toHaveLength(3000);
    expect(doc.sheets[0].rowCount).toBe(4000);
    expect(doc.vision).toBeUndefined();

    const html = trimForStorage({ kind: 'docx', text: 'a', html: 'x'.repeat(400 * 1024) });
    expect(html.doc.html).toBeUndefined();
    expect(html.trimmed).toBe(true);

    const small = trimForStorage({ kind: 'text', text: 'hi' });
    expect(small).toEqual({ doc: { kind: 'text', text: 'hi' }, trimmed: false });

    const huge = trimForStorage({ kind: 'pdf', text: 'a', pages: [{ number: 1, text: 'x'.repeat(4 * 1024 * 1024) }] });
    expect(huge).toEqual({ doc: null, trimmed: true });
  });
});

describe('createIdbStorage', () => {
  it('falls back to memory when IndexedDB is unavailable', async () => {
    const s = createIdbStorage();
    await s.set({ key: 'a::1', v: 1 });
    await s.set({ key: 'b::1', v: 2 });
    expect(await s.get('a::1')).toEqual({ key: 'a::1', v: 1 });
    expect(await s.keys('a::')).toEqual(['a::1']);
    expect(await s.values('b::')).toEqual([{ key: 'b::1', v: 2 }]);
    await s.delete('a::1');
    expect(await s.get('a::1')).toBeNull();
  });
});
