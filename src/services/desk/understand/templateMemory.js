/**
 * templateMemory.js — remembers each school's file layouts on this PC.
 * Stored in localStorage (renderer) with an in-memory fallback (tests, private mode).
 * Only layouts and label words are stored — never learner data.
 */

import { similarity } from './fingerprint.js';

const STORAGE_KEY = 'katuro-desk-template-memory-v1';
const MAX_ENTRIES = 200;
export const MATCH_THRESHOLD = 0.7;

function load() {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function persist(entries) {
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(entries.slice(0, MAX_ENTRIES)));
  } catch {
    // storage full or blocked — memory still works for this session
  }
}

export function createTemplateMemory({ initial } = {}) {
  let entries = initial ? [...initial] : load();
  const usePersistence = !initial;

  return {
    /** Best stored layout for this kind + label set, or null. */
    find(kind, labels) {
      let best = null;
      for (const e of entries) {
        if (e.kind !== kind) continue;
        const score = similarity(labels, new Set(e.labels));
        if (score >= MATCH_THRESHOLD && (!best || score > best.score)) best = { entry: e, score };
      }
      return best;
    },
    save({ kind, labels, layout, sourceName }) {
      const labelArr = [...labels];
      const existing = entries.findIndex((e) => e.kind === kind && similarity(labels, new Set(e.labels)) >= 0.95);
      const entry = { kind, labels: labelArr, layout, sourceName, savedAt: Date.now(), uses: 0 };
      if (existing >= 0) entries.splice(existing, 1);
      entries.unshift(entry);
      if (usePersistence) persist(entries);
      return entry;
    },
    touch(entry) {
      entry.uses = (entry.uses || 0) + 1;
      entry.lastUsed = Date.now();
      if (usePersistence) persist(entries);
    },
    forget(sourceName) {
      entries = entries.filter((e) => e.sourceName !== sourceName);
      if (usePersistence) persist(entries);
    },
    list: () => entries.map(({ kind, sourceName, savedAt, uses, layout }) => ({ kind, sourceName, savedAt, uses, docType: layout?.docType })),
  };
}

let shared = null;
/** The app-wide memory (one per renderer). */
export function sharedTemplateMemory() {
  if (!shared) shared = createTemplateMemory();
  return shared;
}
