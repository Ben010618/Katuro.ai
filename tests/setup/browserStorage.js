import { vi } from 'vitest';
/**
 * Tests run in Node, which has no localStorage/sessionStorage. Stores that persist
 * (zustand persist) then log "storage is currently unavailable" asynchronously, and a
 * log arriving after a test file has finished fails the whole run on fast CI machines
 * ("Closing rpc while onUserConsoleLog was pending"). An in-memory storage keeps
 * those stores quiet and behaving like they do in the browser.
 */
class MemoryStorage {
  constructor() { this.map = new Map(); }
  get length() { return this.map.size; }
  key(i) { return [...this.map.keys()][i] ?? null; }
  getItem(k) { return this.map.has(String(k)) ? this.map.get(String(k)) : null; }
  setItem(k, v) { this.map.set(String(k), String(v)); }
  removeItem(k) { this.map.delete(String(k)); }
  clear() { this.map.clear(); }
}

for (const name of ['localStorage', 'sessionStorage']) {
  if (typeof globalThis[name] === 'undefined') {
    Object.defineProperty(globalThis, name, { value: new MemoryStorage(), configurable: true, writable: true });
  }
}

// zustand persist reads `window.localStorage` by default, and Node has no `window`
// (defining one would change every `typeof window` check in the code under test).
// Stores without their own storage option use the in-memory storage above instead.
vi.mock('zustand/middleware', async (importOriginal) => {
  const mod = await importOriginal();
  return {
    ...mod,
    persist: (initializer, options) => mod.persist(initializer, { storage: mod.createJSONStorage(() => globalThis.localStorage), ...options }),
  };
});
