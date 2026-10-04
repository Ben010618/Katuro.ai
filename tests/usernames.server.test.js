/**
 * claimUsername / syncDirectory from functions/index.js, run against a fake Firestore.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';

const FUNCTIONS_DIR = path.resolve(__dirname, '../functions');
const requireFromFunctions = createRequire(path.join(FUNCTIONS_DIR, 'index.js'));

class HttpsError extends Error {
  constructor(code, message, details) { super(message); this.code = code; this.details = details; }
}

function fakeFirestore() {
  const docs = new Map();
  const ref = (p) => ({
    path: p,
    async get() { const d = docs.get(p); return { exists: Boolean(d), data: () => d }; },
    async set(data) { docs.set(p, { ...data }); },
    async update(data) { docs.set(p, { ...(docs.get(p) || {}), ...data }); },
    async delete() { docs.delete(p); },
  });
  const db = {
    doc: ref,
    async runTransaction(fn) {
      const writes = [];
      const tx = {
        get: (r) => r.get(),
        set: (r, data) => writes.push(() => docs.set(r.path, { ...data })),
        delete: (r) => writes.push(() => docs.delete(r.path)),
        update: (r, data) => writes.push(() => docs.set(r.path, { ...(docs.get(r.path) || {}), ...data })),
      };
      const out = await fn(tx);
      writes.forEach((w) => w());
      return out;
    },
  };
  return { db, docs };
}

function loadServer(store) {
  const firestore = () => store.db;
  firestore.FieldValue = { increment: (n) => ({ __inc: n }), serverTimestamp: () => 'ts', delete: () => undefined };
  const chain = new Proxy(function chainFn() {}, { get: () => chain, apply: () => chain });
  const stubs = {
    'firebase-functions/v2/https': { onCall: (opts, fn) => fn || opts, onRequest: (opts, fn) => fn || opts, HttpsError },
    'firebase-functions/v2/scheduler': { onSchedule: () => () => {} },
    'firebase-functions/v2/firestore': { onDocumentCreated: () => () => {} },
    'firebase-functions/v1': chain,
    'firebase-admin/firestore': { FieldValue: firestore.FieldValue },
    'firebase-admin': { initializeApp() {}, firestore, auth: () => ({}) },
  };
  const req = (id) => (id in stubs ? stubs[id] : requireFromFunctions(id));
  const src = fs.readFileSync(path.join(FUNCTIONS_DIR, 'index.js'), 'utf8') + '\nmodule.exports.__test = { orgKey, directoryEntry };';
  const mod = { exports: {} };
  new Function('require', 'module', 'exports', '__dirname', '__filename', src)(req, mod, mod.exports, FUNCTIONS_DIR, path.join(FUNCTIONS_DIR, 'index.js'));
  return mod.exports;
}

let store;
let server;
const claim = (uid, username) => server.claimUsername({ auth: { uid }, data: { username } });

beforeEach(() => {
  vi.spyOn(console, 'info').mockImplementation(() => {});
  store = fakeFirestore();
  store.docs.set('teachers/t1', { name: 'Ben Mark Joy A. Cuvinar', school: 'Dayap NHS', schoolId: '301238', division: 'Schools Division of Laguna' });
  store.docs.set('teachers/t2', { name: 'Ana Reyes', school: 'Dayap National High School', division: 'SDO Laguna' });
  server = loadServer(store);
});

describe('unique usernames', () => {
  it('the second teacher to ask for a name is told it is taken', async () => {
    await claim('t1', 'Ben');
    expect(store.docs.get('usernames/ben')).toMatchObject({ uid: 't1' });
    await expect(claim('t2', 'ben')).rejects.toMatchObject({ code: 'already-exists', message: 'That username is taken.' });
    await expect(claim('t2', '@BEN')).rejects.toMatchObject({ code: 'already-exists' });
  });

  it('claiming again keeps it; changing frees the old name for others', async () => {
    await claim('t1', 'ben');
    await expect(claim('t1', 'ben')).resolves.toMatchObject({ username: 'ben' });
    await claim('t1', 'ben.cuvinar');
    expect(store.docs.has('usernames/ben')).toBe(false);
    await expect(claim('t2', 'ben')).resolves.toMatchObject({ username: 'ben', uid: 't2' });
  });

  it('rejects bad or reserved names', async () => {
    for (const bad of ['b', 'a b', '.ben', 'ben.', 'ben..m', 'x'.repeat(21), 'bén']) {
      await expect(claim('t1', bad)).rejects.toMatchObject({ code: 'invalid-argument' });
    }
    await expect(claim('t1', 'admin')).rejects.toMatchObject({ code: 'already-exists' });
    await expect(claim('t1', 'katuro')).rejects.toMatchObject({ code: 'already-exists' });
  });

  it('builds the directory card from the profile (same division despite different wording)', async () => {
    const a = await claim('t1', 'ben');
    const b = await claim('t2', 'ana');
    expect(a).toMatchObject({ displayName: 'Ben Mark Joy A. Cuvinar', schoolKey: 'id:301238', divisionKey: 'laguna' });
    expect(b.divisionKey).toBe(a.divisionKey);
    expect(b.schoolKey).toBe('name:dayapnationalhighschool');
  });

  it('syncDirectory refreshes the card after a profile change, and does nothing without a username', async () => {
    expect(await server.syncDirectory({ auth: { uid: 't2' } })).toEqual({ entry: null });
    await claim('t1', 'ben');
    store.docs.set('teachers/t1', { ...store.docs.get('teachers/t1'), division: 'Schools Division of Batangas' });
    const { entry } = await server.syncDirectory({ auth: { uid: 't1' } });
    expect(entry.divisionKey).toBe('batangas');
    expect(store.docs.get('directory/t1').divisionKey).toBe('batangas');
  });

  it('orgKey ignores case, punctuation and filler words', () => {
    const { orgKey } = server.__test;
    expect(orgKey('Schools Division of Laguna')).toBe('laguna');
    expect(orgKey('SDO - LAGUNA')).toBe('laguna');
    expect(orgKey('DepEd Division of San Pablo City')).toBe('sanpablocity');
    expect(orgKey('')).toBe('');
    expect(orgKey('Province of Laguna')).toBe('laguna');
    expect(orgKey('City of San Pablo')).toBe(orgKey('San Pablo City'));
    expect(orgKey('Cebu City')).not.toBe(orgKey('Cebu Province'));
  });
});
