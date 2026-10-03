/**
 * fileIndex.js — background, once-per-change parsing of every supported file in
 * an open classroom folder, cached on this PC (IndexedDB, memory fallback).
 *
 * No AI calls. Parsing goes through readDocument; descriptions are built locally.
 *
 * Storage layout (one object store, keyPath 'key'):
 *   `${workspaceId}::${path}`       meta  { key, workspaceId, path, size, lastModified, fingerprint, summary, trimmed, needsVision, hasDoc, failed }
 *   `doc::${workspaceId}::${path}`  body  { key, fingerprint, parsed }   (trimmed ParsedDocument, no vision)
 * Split so start() can load every summary without pulling multi-MB parsed bodies.
 */

import { readDocument, SUPPORTED_EXTENSIONS } from '../readers/index.js';
import { detectInSheets } from '../readers/scoreSheet.js';
import { flattenFileTree, readFileBytes, readerNameFor, BACKUPS_ROOT } from '../../localFileSystem.js';
import { createIdbStorage } from './storage.js';

export { createMemoryStorage, createIdbStorage } from './storage.js';

export const LIMITS = {
  maxFileBytes: 25 * 1024 * 1024,
  maxTextChars: 300 * 1024,
  maxHtmlChars: 300 * 1024,
  maxSheetRows: 3000,
  maxStoredChars: 3 * 1024 * 1024,
  concurrency: 2,
  memoryEntries: 16,
  memoryEntryMaxChars: 5 * 1024 * 1024,
};

const SUPPORTED = new Set(SUPPORTED_EXTENSIONS);

const KIND_LABEL = {
  docx: 'Word',
  xlsx: 'Excel',
  csv: 'CSV',
  pptx: 'PowerPoint',
  pdf: 'PDF',
  image: 'Image',
  text: 'Text',
};

// ---------------------------------------------------------------- helpers

export function normPath(p) {
  return String(p || '').replace(/\\/g, '/').split('/').filter((s) => s && s !== '.').join('/');
}

function extOf(name) {
  const m = /\.([a-z0-9]+)$/i.exec(String(name || '').trim());
  return m ? m[1].toLowerCase() : '';
}

const isVirtualText = (e) => typeof e?.content === 'string' && !e.bytes && !e.fullPath && !e.handle;

function byteLen(b) {
  if (!b) return 0;
  return b.byteLength ?? b.length ?? 0;
}

// FNV-1a over a string or byte array.
function fnv(input) {
  let h = 0x811c9dc5;
  if (typeof input === 'string') {
    for (let i = 0; i < input.length; i++) {
      h ^= input.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
  } else {
    const u8 = input instanceof Uint8Array ? input : new Uint8Array(input.buffer || input, input.byteOffset || 0, byteLen(input));
    for (let i = 0; i < u8.length; i++) {
      h ^= u8[i];
      h = Math.imul(h, 0x01000193);
    }
  }
  return (h >>> 0).toString(16);
}

/**
 * Identity of a file version. Real files: size + lastModified. Demo/virtual
 * text files (whose lastModified is regenerated per session): content hash.
 * Returns null when the version can't be identified (never cached on disk).
 */
export function fingerprintOf(entry) {
  if (!entry) return null;
  if (isVirtualText(entry)) return `t:${entry.content.length}:${fnv(entry.content)}`;
  const lm = Number(entry.lastModified);
  if (entry.lastModified !== undefined && entry.lastModified !== null && Number.isFinite(lm)) {
    const size = entry.size ?? byteLen(entry.bytes);
    return `m:${size ?? ''}:${lm}`;
  }
  if (entry.bytes) return `b:${byteLen(entry.bytes)}:${fnv(entry.bytes)}`;
  return null;
}

function sizeOf(entry) {
  if (typeof entry?.size === 'number') return entry.size;
  if (entry?.bytes) return byteLen(entry.bytes);
  if (typeof entry?.content === 'string') return entry.content.length;
  return 0;
}

function readerName(entry) {
  return readerNameFor(entry, entry?.name || normPath(entry?.path).split('/').pop() || '');
}

function skipReason(path, entry) {
  const first = path.split('/')[0];
  if (first === BACKUPS_ROOT) return 'backup';
  if (!SUPPORTED.has(extOf(readerName(entry)))) return 'unsupported';
  if (sizeOf(entry) > LIMITS.maxFileBytes) return 'too large';
  return null;
}

function yieldToUi() {
  return new Promise((resolve) => {
    setTimeout(() => {
      if (typeof requestIdleCallback === 'function') {
        try {
          requestIdleCallback(() => resolve(), { timeout: 250 });
          return;
        } catch {
          // fall through
        }
      }
      resolve();
    }, 0);
  });
}

function withoutVision(parsed) {
  if (!parsed || !parsed.vision) return parsed;
  const rest = { ...parsed };
  delete rest.vision;
  return rest;
}

/** Storage copy: no vision, capped html/text/sheet rows. doc=null when still too big. */
export function trimForStorage(parsed) {
  const out = { ...parsed };
  delete out.vision;
  let trimmed = false;
  if (typeof out.html === 'string' && out.html.length > LIMITS.maxHtmlChars) {
    delete out.html;
    trimmed = true;
  }
  if (typeof out.text === 'string' && out.text.length > LIMITS.maxTextChars) {
    out.text = out.text.slice(0, LIMITS.maxTextChars);
    trimmed = true;
  }
  if (Array.isArray(out.sheets)) {
    out.sheets = out.sheets.map((s) => {
      if (!Array.isArray(s.rows) || s.rows.length <= LIMITS.maxSheetRows) return s;
      trimmed = true;
      return { ...s, rows: s.rows.slice(0, LIMITS.maxSheetRows) };
    });
  }
  let size = Infinity;
  try {
    size = JSON.stringify(out).length;
  } catch {
    // unserializable → summary only
  }
  if (size > LIMITS.maxStoredChars) return { doc: null, trimmed: true };
  return { doc: out, trimmed };
}

// ---------------------------------------------------------------- descriptions

const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;

function firstLine(text) {
  const line = String(text || '').split('\n').map((l) => l.replace(/\s+/g, ' ').trim()).find(Boolean) || '';
  return line.length > 80 ? `${line.slice(0, 77)}…` : line;
}

function titleOf(parsed) {
  switch (parsed.kind) {
    case 'docx':
    case 'text':
      return firstLine(parsed.text);
    case 'pptx':
      return firstLine(parsed.slides?.[0]?.title || '');
    case 'pdf':
      return parsed.needsVision ? '' : firstLine(parsed.pages?.[0]?.text || parsed.text);
    default:
      return '';
  }
}

/** "score sheet: 45 learners × 30 items" etc. for the first detected sheet. */
export function dataHint(sheets) {
  let found;
  try {
    found = detectInSheets(sheets || []);
  } catch {
    return '';
  }
  if (!found.length) return '';
  const multi = (sheets || []).length > 1;
  const f = found[0];
  const where = multi ? ` (${f.sheetName})` : '';
  let hint = '';
  const t = f.scoreTable;
  if (t) {
    const n = t.learners?.length || 0;
    if (t.mode === 'components') {
      const c = t.components || {};
      const parts = ['ww', 'pt', 'qa'].filter((k) => c[k]?.cols?.length).map((k) => `${k.toUpperCase()} ${c[k].cols.length}`);
      hint = `class record${where}: ${plural(n, 'learner')} (${parts.join(', ')})`;
    } else if (t.mode === 'items') {
      hint = `score sheet${where}: ${plural(n, 'learner')} × ${plural(t.itemCols?.length || 0, 'item')}${t.needsAnswerKey ? ', no answer key' : ''}`;
    } else {
      hint = `score sheet${where}: ${plural(n, 'learner')}${t.totalItems ? ` · ${t.totalItems}-item total` : ''}`;
    }
  } else if (f.attendance) {
    const a = f.attendance;
    hint = `attendance${where}: ${plural(a.learners?.length || 0, 'learner')} × ${plural(a.dayCols?.length || 0, 'day')}`;
  }
  if (hint && found.length > 1) hint += ` (+${plural(found.length - 1, 'more sheet')})`;
  return hint;
}

export function buildSummary(parsed) {
  const m = parsed.meta || {};
  const parts = [KIND_LABEL[parsed.kind] || 'File'];
  switch (parsed.kind) {
    case 'docx':
      if (m.pageCount) parts.push(plural(m.pageCount, 'page'));
      else if (m.wordCount) parts.push(plural(m.wordCount, 'word'));
      if (parsed.tables?.length) parts.push(plural(parsed.tables.length, 'table'));
      break;
    case 'xlsx':
    case 'csv': {
      const sheets = parsed.sheets || [];
      const hint = dataHint(sheets);
      if (parsed.kind === 'xlsx' && sheets.length > 1) parts.push(plural(sheets.length, 'sheet'));
      if (hint) parts.push(hint);
      else {
        const rows = sheets.reduce((n, s) => n + (s.rowCount || 0), 0);
        parts.push(plural(rows, 'row'));
      }
      break;
    }
    case 'pptx':
      parts.push(plural(m.slideCount || parsed.slides?.length || 0, 'slide'));
      break;
    case 'pdf':
      parts.push(plural(m.pageCount || 0, 'page'));
      if (parsed.needsVision) parts.push('scanned, needs AI vision');
      break;
    case 'image':
      parts.push('needs AI vision');
      break;
    case 'text':
      parts.push(plural(m.wordCount || 0, 'word'));
      break;
    default:
      break;
  }
  const title = titleOf(parsed);
  if (title) parts.push(`"${title}"`);
  const summary = { description: parts.join(' · '), kind: parsed.kind, updatedAt: Date.now() };
  if (title) summary.title = title;
  return summary;
}

function failureSummary(reason) {
  return { description: `could not read: ${reason}`, kind: 'unsupported', failed: true, updatedAt: Date.now() };
}

function failureReason(parsed) {
  if (parsed && parsed.kind === 'unsupported') return parsed.warnings?.[0] || 'unsupported file';
  return null;
}

// ---------------------------------------------------------------- index

/**
 * @param {object} [opts]
 * @param {object} [opts.storage]  KV from ./storage.js (default: IndexedDB with memory fallback)
 * @param {Function} [opts.read]    ({bytes,name}) => ParsedDocument (default readDocument)
 * @param {Function} [opts.readBytes] (handle, entry) => Uint8Array (default readFileBytes)
 */
export function createFileIndex({ storage, read = readDocument, readBytes = readFileBytes } = {}) {
  const store = storage || createIdbStorage();
  const summaries = new Map(); // path → summary (current workspace)
  const memory = new Map(); // key → { fingerprint, parsed } untrimmed, no vision (LRU)
  const inflight = new Map(); // key → { fingerprint, promise, owner }
  const parsedNow = new Map(); // key → fingerprint persisted this session (lets the queue skip files ensure() already did)
  let entries = new Map(); // path → entry (current tree)
  let lowerPaths = new Map();
  let workspaceId = null;
  let handle = null;
  let run = null;
  let state = { running: false, done: 0, total: 0, failed: 0 };

  const metaKey = (ws, path) => `${ws}::${path}`;
  const docKey = (ws, path) => `doc::${ws}::${path}`;

  async function safe(fn, fallback) {
    try {
      return await fn();
    } catch {
      return fallback;
    }
  }

  function remember(key, fingerprint, parsed) {
    if (!fingerprint || !parsed) return;
    const size = (parsed.text?.length || 0) + (parsed.html?.length || 0);
    if (size > LIMITS.memoryEntryMaxChars) return;
    memory.delete(key);
    memory.set(key, { fingerprint, parsed: withoutVision(parsed) });
    while (memory.size > LIMITS.memoryEntries) memory.delete(memory.keys().next().value);
  }

  function fromMemory(key, fingerprint) {
    const hit = memory.get(key);
    if (!hit || !fingerprint || hit.fingerprint !== fingerprint) return null;
    memory.delete(key);
    memory.set(key, hit);
    return hit.parsed;
  }

  function lookupEntry(path) {
    return entries.get(path) || entries.get(lowerPaths.get(path.toLowerCase())) || null;
  }

  function setTree(files) {
    entries = new Map();
    lowerPaths = new Map();
    for (const e of flattenFileTree(Array.isArray(files) ? files : [])) {
      const p = normPath(e.path || e.name);
      if (!p) continue;
      entries.set(p, e);
      lowerPaths.set(p.toLowerCase(), p);
    }
  }

  async function loadMeta(ws, path) {
    const m = await safe(() => store.get(metaKey(ws, path)), null);
    return m && typeof m === 'object' ? m : null;
  }

  async function loadDoc(ws, path, fingerprint) {
    const d = await safe(() => store.get(docKey(ws, path)), null);
    return d && d.fingerprint === fingerprint ? d.parsed || null : null;
  }

  /** Writes meta (+ body) for a fresh parse. `guard()` false → skip (cancelled run). */
  async function persist(ws, path, entry, fingerprint, parsed, error, guard = () => true) {
    const reason = error ? (error.message || String(error)) : failureReason(parsed);
    const summary = reason ? failureSummary(reason) : buildSummary(parsed);
    if (!guard()) return summary;
    if (ws === workspaceId && entries.get(path) === entry) summaries.set(path, summary);
    if (fingerprint) parsedNow.set(metaKey(ws, path), fingerprint);
    if (!reason) remember(metaKey(ws, path), fingerprint, parsed);
    if (!fingerprint) return summary;
    let trimmed = false;
    let doc = null;
    if (!reason) ({ doc, trimmed } = trimForStorage(parsed));
    const meta = {
      key: metaKey(ws, path),
      workspaceId: ws,
      path,
      size: sizeOf(entry),
      lastModified: entry.lastModified ?? null,
      fingerprint,
      summary,
      trimmed,
      needsVision: !!parsed?.needsVision,
      hasDoc: !!doc,
      failed: !!reason,
    };
    if (!guard()) return summary;
    if (doc) await safe(() => store.set({ key: docKey(ws, path), fingerprint, parsed: doc }), false);
    else await safe(() => store.delete(docKey(ws, path)), false);
    if (!guard()) return summary;
    await safe(() => store.set(meta), false);
    return summary;
  }

  /**
   * Reads + parses one file, sharing the in-flight promise per key/fingerprint.
   * Resolves { parsed, error } (never rejects); parsed includes vision.
   */
  function parseShared(ws, path, entry, fingerprint, h, owner) {
    const key = metaKey(ws, path);
    const existing = inflight.get(key);
    if (existing && existing.fingerprint === fingerprint && fingerprint) return { job: existing, shared: true };
    const job = { fingerprint, owner, persisted: null };
    job.promise = (async () => {
      try {
        const bytes = await readBytes(h, entry);
        const parsed = await read({ bytes, name: readerName(entry) });
        return { parsed, error: null };
      } catch (error) {
        return { parsed: null, error };
      }
    })();
    inflight.set(key, job);
    job.promise.then(() => {
      if (inflight.get(key) === job) inflight.delete(key);
    });
    return { job, shared: false };
  }

  /** Run shared parse and make sure exactly one live party persists the result. */
  async function parseAndPersist(ws, path, entry, fingerprint, h, owner, guard) {
    const { job } = parseShared(ws, path, entry, fingerprint, h, owner);
    const result = await job.promise;
    const ownerLive = job.owner && !job.owner.cancelled;
    const iAmOwner = job.owner === owner;
    if (!job.persisted && (iAmOwner || !ownerLive) && guard()) {
      job.persisted = persist(ws, path, entry, fingerprint, result.parsed, result.error, guard);
    }
    const summary = job.persisted ? await job.persisted : null;
    return { ...result, summary };
  }

  // ---------------------------------------------------------------- start

  async function start({ workspaceId: ws, files, handle: h, onProgress } = {}) {
    cancel();
    const myRun = { cancelled: false };
    run = myRun;
    const live = () => !myRun.cancelled;
    if (ws !== workspaceId) {
      summaries.clear();
      memory.clear();
      parsedNow.clear();
    }
    workspaceId = ws ?? null;
    handle = h ?? null;
    setTree(files);
    state = { running: true, done: 0, total: 0, failed: 0 };
    const report = (current) => {
      if (!live() || typeof onProgress !== 'function') return;
      try {
        onProgress({ done: state.done, total: state.total, current });
      } catch {
        // UI callback errors must not stop indexing
      }
    };

    try {
      if (workspaceId === null || workspaceId === undefined) return;
      const prefix = `${workspaceId}::`;
      const metas = await safe(() => store.values(prefix), []);
      if (!live()) return;

      // Drop summaries for paths no longer in the tree; load valid cached ones.
      for (const p of [...summaries.keys()]) if (!entries.has(p)) summaries.delete(p);
      const valid = new Set();
      const stalePaths = [];
      for (const m of metas || []) {
        if (!m || typeof m.path !== 'string' || !String(m.key).startsWith(prefix)) continue;
        const entry = entries.get(m.path);
        if (!entry) {
          stalePaths.push(m.path);
          continue;
        }
        const fp = fingerprintOf(entry);
        if (fp && m.fingerprint === fp) {
          valid.add(m.path);
          if (m.failed) state.failed += 1;
          if (m.summary) summaries.set(m.path, m.summary);
        } else {
          summaries.delete(m.path);
        }
      }

      // Pruning (best-effort): metas and orphan bodies for deleted paths.
      const docKeys = await safe(() => store.keys(`doc::${prefix}`), []);
      for (const k of docKeys || []) {
        const p = k.slice(`doc::${prefix}`.length);
        if (!entries.has(p) && !stalePaths.includes(p)) stalePaths.push(p);
      }
      for (const p of stalePaths) {
        if (!live()) return;
        await safe(() => store.delete(metaKey(workspaceId, p)), false);
        await safe(() => store.delete(docKey(workspaceId, p)), false);
      }

      const eligible = [];
      for (const [p, e] of entries) if (!skipReason(p, e)) eligible.push([p, e]);
      state.total = eligible.length;
      const queue = eligible.filter(([p]) => !valid.has(p));
      state.done = eligible.length - queue.length;
      queue.sort((a, b) => (Number(b[1].lastModified) || 0) - (Number(a[1].lastModified) || 0));
      report(null);

      let next = 0;
      const worker = async () => {
        while (live() && next < queue.length) {
          const [p, e] = queue[next++];
          await yieldToUi();
          if (!live()) return;
          try {
            const fp = fingerprintOf(e);
            if (fp && parsedNow.get(metaKey(workspaceId, p)) === fp) {
              state.done += 1;
              report(p);
              continue;
            }
            const res = await parseAndPersist(workspaceId, p, e, fp, handle, myRun, live);
            if (!live()) return;
            if (res.error || res.summary?.failed) state.failed += 1;
          } catch {
            if (live()) state.failed += 1;
          }
          if (!live()) return;
          state.done += 1;
          report(p);
        }
      };
      await Promise.all(Array.from({ length: LIMITS.concurrency }, worker));
    } catch {
      // background indexing never throws
    } finally {
      if (run === myRun) state.running = false;
    }
  }

  function cancel() {
    if (run) run.cancelled = true;
    run = null;
    state = { ...state, running: false };
  }

  // ---------------------------------------------------------------- lookups

  async function get(path) {
    const p = normPath(path);
    const entry = lookupEntry(p);
    if (!entry || workspaceId === null) return null;
    const realPath = entries.has(p) ? p : lowerPaths.get(p.toLowerCase());
    const fp = fingerprintOf(entry);
    if (!fp) return null;
    const mem = fromMemory(metaKey(workspaceId, realPath), fp);
    if (mem) return mem;
    const meta = await loadMeta(workspaceId, realPath);
    if (!meta || meta.fingerprint !== fp || !meta.hasDoc) return null;
    return loadDoc(workspaceId, realPath, fp);
  }

  /**
   * Cached-or-parse. With { full: true } a trimmed cache copy or a needsVision
   * doc is re-parsed so the caller gets the complete document (incl. vision).
   * Throws only when the file itself can't be read.
   */
  async function ensure(path, entry, h, { full = false } = {}) {
    let p = normPath(path || entry?.path);
    let e = entry || lookupEntry(p);
    if (!entry && e && !entries.has(p)) p = lowerPaths.get(p.toLowerCase()) || p;
    if (!e) throw new Error(`File not found: ${p}`);
    if (entry && workspaceId !== null) {
      // Caller knows a newer version of the entry — adopt it as current.
      if (!entries.has(p)) lowerPaths.set(p.toLowerCase(), p);
      entries.set(p, e);
    }
    const ws = workspaceId ?? '__none__';
    const guard = () => workspaceId !== null && workspaceId === ws;
    const fp = fingerprintOf(e);
    const key = metaKey(ws, p);
    const hdl = h ?? handle;

    const mem = fromMemory(key, fp);
    if (mem && !(full && mem.needsVision)) return mem;

    const flying = inflight.get(key);
    if (flying && fp && flying.fingerprint === fp) {
      const res = await parseAndPersist(ws, p, e, fp, hdl, null, guard);
      if (res.error) throw res.error;
      if (!full || !res.parsed.needsVision || res.parsed.vision) return res.parsed;
    }

    if (fp && workspaceId !== null) {
      const meta = await loadMeta(ws, p);
      if (meta && meta.fingerprint === fp && meta.hasDoc && !(full && (meta.trimmed || meta.needsVision))) {
        const doc = await loadDoc(ws, p, fp);
        if (doc) {
          if (!meta.trimmed) remember(key, fp, doc);
          return doc;
        }
      }
    }

    const res = await parseAndPersist(ws, p, e, fp, hdl, null, guard);
    if (res.error) throw res.error;
    return res.parsed;
  }

  function describe(path) {
    const p = normPath(path);
    const s = summaries.get(p) || summaries.get(lowerPaths.get(p.toLowerCase()));
    return s ? s.description : null;
  }

  /** Forget a path (e.g. after the agent rewrote it) so the next ensure re-parses. */
  async function invalidate(path) {
    const p = normPath(path);
    summaries.delete(p);
    if (workspaceId === null) return;
    memory.delete(metaKey(workspaceId, p));
    parsedNow.delete(metaKey(workspaceId, p));
    await safe(() => store.delete(metaKey(workspaceId, p)), false);
    await safe(() => store.delete(docKey(workspaceId, p)), false);
  }

  return {
    start,
    cancel,
    get,
    ensure,
    describe,
    invalidate,
    summaries: () => new Map(summaries),
    status: () => ({ running: state.running, done: state.done, total: state.total, failed: state.failed }),
  };
}
