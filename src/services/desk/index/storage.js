/**
 * storage.js — tiny async KV used by the file index.
 * Records are plain objects that carry their own `key` (IndexedDB keyPath).
 *
 * Interface: get(key), set(record), delete(key), keys(prefix), values(prefix).
 * Every method resolves (never rejects).
 */

export function createMemoryStorage() {
  const map = new Map();
  return {
    kind: 'memory',
    async get(key) {
      return map.has(key) ? map.get(key) : null;
    },
    async set(record) {
      map.set(record.key, record);
      return true;
    },
    async delete(key) {
      map.delete(key);
      return true;
    },
    async keys(prefix = '') {
      return [...map.keys()].filter((k) => k.startsWith(prefix));
    },
    async values(prefix = '') {
      return [...map.entries()].filter(([k]) => k.startsWith(prefix)).map(([, v]) => v);
    },
    _map: map,
  };
}

/**
 * IndexedDB-backed storage. If IndexedDB is missing or cannot be opened, all
 * calls go to an in-memory map instead. Individual failed operations (quota,
 * aborted transaction) resolve with a neutral value rather than throwing.
 */
export function createIdbStorage({ dbName = 'katuro-desk-index', storeName = 'files' } = {}) {
  const mem = createMemoryStorage();
  let dbPromise = null;

  function open() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve) => {
      try {
        if (typeof indexedDB === 'undefined' || !indexedDB) return resolve(null);
        const req = indexedDB.open(dbName, 1);
        req.onupgradeneeded = () => {
          try {
            const db = req.result;
            if (!db.objectStoreNames.contains(storeName)) db.createObjectStore(storeName, { keyPath: 'key' });
          } catch {
            // resolved as failure by onerror
          }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
        req.onblocked = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
    return dbPromise;
  }

  async function run(mode, makeRequest, fallback) {
    const db = await open();
    if (!db) return null;
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(storeName, mode);
        const req = makeRequest(tx.objectStore(storeName));
        let result = fallback;
        req.onsuccess = () => {
          result = req.result;
        };
        tx.oncomplete = () => resolve({ value: result });
        tx.onerror = () => resolve({ value: fallback });
        tx.onabort = () => resolve({ value: fallback });
      } catch {
        resolve({ value: fallback });
      }
    });
  }

  const range = (prefix) => {
    try {
      return prefix ? IDBKeyRange.bound(prefix, `${prefix}￿`) : undefined;
    } catch {
      return undefined;
    }
  };

  return {
    kind: 'indexeddb',
    async get(key) {
      const r = await run('readonly', (s) => s.get(key), null);
      return r ? (r.value ?? null) : mem.get(key);
    },
    async set(record) {
      const r = await run('readwrite', (s) => s.put(record), false);
      if (!r) return mem.set(record);
      return r.value !== false;
    },
    async delete(key) {
      const r = await run('readwrite', (s) => s.delete(key), false);
      return r ? true : mem.delete(key);
    },
    async keys(prefix = '') {
      const r = await run('readonly', (s) => s.getAllKeys(range(prefix)), []);
      if (!r) return mem.keys(prefix);
      return (r.value || []).map(String).filter((k) => k.startsWith(prefix));
    },
    async values(prefix = '') {
      const r = await run('readonly', (s) => s.getAll(range(prefix)), []);
      if (!r) return mem.values(prefix);
      return (r.value || []).filter((v) => v && String(v.key).startsWith(prefix));
    },
  };
}
