/**
 * adminDeleteInactiveNow and the nightly cleanupInactiveUsers (functions/index.js),
 * run against a fake Firestore and a fake Auth.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';

const FUNCTIONS_DIR = path.resolve(__dirname, '../functions');
const requireFromFunctions = createRequire(path.join(FUNCTIONS_DIR, 'index.js'));

class HttpsError extends Error {
  constructor(code, message, details) { super(message); this.code = code; this.details = details; }
}

const ts = (ms) => ({ ms, toMillis: () => ms });
const val = (v) => (v && typeof v.toMillis === 'function' ? v.toMillis() : v);
const DAY = 86400000;

function fakeFirestore() {
  const docs = new Map(); // path → data
  let auto = 0;
  const ref = (p) => ({
    path: p,
    id: p.split('/').pop(),
    async get() { const d = docs.get(p); return { exists: Boolean(d), id: p.split('/').pop(), ref: ref(p), data: () => d }; },
    async set(data) { docs.set(p, { ...data }); },
    async update(data) { docs.set(p, { ...(docs.get(p) || {}), ...data }); },
    async delete() { docs.delete(p); },
  });
  const query = (name, filters = []) => ({
    where(field, op, v) { return query(name, [...filters, [field, op, v]]); },
    orderBy() { return this; },
    limit() { return this; },
    async get() {
      const out = [...docs.entries()]
        .filter(([p]) => p.split('/').length === 2 && p.startsWith(`${name}/`))
        .filter(([, d]) => filters.every(([f, op, v]) => {
          const a = val(d[f]);
          const b = val(v);
          if (a === undefined) return false;
          return op === '==' ? a === b : op === '>' ? a > b : op === '<' ? a < b : false;
        }))
        .map(([p, d]) => ({ id: p.split('/')[1], ref: ref(p), data: () => d }));
      return { docs: out, empty: !out.length };
    },
    async add(data) { auto += 1; docs.set(`${name}/auto${auto}`, { ...data }); return ref(`${name}/auto${auto}`); },
  });
  const db = {
    doc: ref,
    collection: (name) => query(name),
    async recursiveDelete(r) { for (const p of [...docs.keys()]) if (p === r.path || p.startsWith(`${r.path}/`)) docs.delete(p); },
    batch() { const ops = []; return { update: (r, d) => ops.push(() => docs.set(r.path, { ...(docs.get(r.path) || {}), ...d })), async commit() { ops.forEach((o) => o()); } }; },
  };
  return { db, docs };
}

function loadServer(store, authUsers) {
  const firestore = () => store.db;
  firestore.FieldValue = { increment: (n) => ({ __inc: n }), serverTimestamp: () => ts(Date.now()), delete: () => undefined };
  firestore.Timestamp = { fromMillis: ts };
  const chain = new Proxy(function chainFn() {}, { get: () => chain, apply: () => chain });
  const stubs = {
    'firebase-functions/v2/https': { onCall: (opts, fn) => fn || opts, onRequest: (opts, fn) => fn || opts, HttpsError },
    'firebase-functions/v2/scheduler': { onSchedule: (opts, fn) => fn || opts },
    'firebase-functions/v2/firestore': { onDocumentCreated: () => () => {} },
    'firebase-functions/v1': chain,
    'firebase-admin/firestore': { FieldValue: firestore.FieldValue },
    'firebase-admin': { initializeApp() {}, firestore, auth: () => ({ async deleteUser(uid) { authUsers.delete(uid); } }) },
  };
  const req = (id) => (id in stubs ? stubs[id] : requireFromFunctions(id));
  const src = fs.readFileSync(path.join(FUNCTIONS_DIR, 'index.js'), 'utf8');
  const mod = { exports: {} };
  new Function('require', 'module', 'exports', '__dirname', '__filename', src)(req, mod, mod.exports, FUNCTIONS_DIR, path.join(FUNCTIONS_DIR, 'index.js'));
  return mod.exports;
}

describe('Inactivity Cleanup: "Delete all now"', () => {
  let store;
  let auth;
  let server;
  const now = Date.now();

  beforeEach(() => {
    store = fakeFirestore();
    auth = new Set(['admin1', 'a', 'b', 'c', 'active', 'admin2']);
    const t = (id, data) => store.docs.set(`teachers/${id}`, { email: `${id}@deped.gov.ph`, displayName: id.toUpperCase(), ...data });
    t('admin1', { isAdmin: true, disabled: false });
    t('a', { isAdmin: false, disabled: true, deactivatedForInactivityAt: ts(now - 5 * DAY) });
    t('b', { isAdmin: false, disabled: true, deactivatedForInactivityAt: ts(now - 40 * DAY) });
    t('c', { isAdmin: false, disabled: true, deactivatedForInactivityAt: ts(now - 2 * DAY) });
    t('active', { isAdmin: false, disabled: false, lastActiveAt: ts(now - DAY) });
    t('admin2', { isAdmin: true, disabled: true, deactivatedForInactivityAt: ts(now - 3 * DAY) });
    store.docs.set('teachers/a/lessons/l1', { title: 'x' });
    store.docs.set('sections/s1', { adviserUid: 'a' });
    store.docs.set('sections/s1/students/st1', { name: 'x' });
    store.docs.set('sections/s2', { adviserUid: 'active' });
    server = loadServer(store, auth);
  });

  const call = (uid, uids) => server.adminDeleteInactiveNow({ auth: uid ? { uid } : null, data: { uids } });

  it('admins only', async () => {
    await expect(call(null, ['a'])).rejects.toMatchObject({ code: 'unauthenticated' });
    await expect(call('active', ['a'])).rejects.toMatchObject({ code: 'permission-denied' });
    await expect(call('admin1', [])).rejects.toMatchObject({ code: 'invalid-argument' });
    expect(store.docs.has('teachers/a')).toBe(true);
  });

  it('deletes the listed pending accounts with all their data and sections; logs each; never an admin, an active teacher, or one not listed', async () => {
    const res = await call('admin1', ['a', 'b', 'admin2', 'active', 'ghost']);
    expect(res).toEqual({ deleted: 2, failed: 0, skipped: 3 });
    for (const p of ['teachers/a', 'teachers/a/lessons/l1', 'teachers/b', 'sections/s1', 'sections/s1/students/st1']) expect(store.docs.has(p)).toBe(false);
    expect([...auth].sort()).toEqual(['active', 'admin1', 'admin2', 'c']);
    for (const p of ['teachers/c', 'teachers/admin2', 'teachers/active', 'teachers/admin1', 'sections/s2']) expect(store.docs.has(p)).toBe(true); // c was not in the list
    const logs = [...store.docs.entries()].filter(([p]) => p.startsWith('deletionLogs/')).map(([, d]) => d);
    expect(logs.map((l) => [l.uid, l.reason, l.deletedBy])).toEqual([['a', 'inactivity_deleted_by_admin', 'admin1'], ['b', 'inactivity_deleted_by_admin', 'admin1']]);
    const notes = [...store.docs.entries()].filter(([p]) => p.startsWith('adminNotifications/')).map(([, d]) => d.message);
    expect(notes).toEqual(['Inactivity cleanup (by an admin): 2 deactivated account(s) permanently deleted.']);
  });

  it('someone who logged back in after the admin opened the list is kept', async () => {
    store.docs.set('teachers/a', { ...store.docs.get('teachers/a'), disabled: false, deactivatedForInactivityAt: undefined });
    const res = await call('admin1', ['a', 'b']);
    expect(res).toEqual({ deleted: 1, failed: 0, skipped: 1 });
    expect(store.docs.has('teachers/a')).toBe(true);
  });

  it('the nightly job (now sharing the same delete step) still deletes only accounts past the 30-day grace', async () => {
    await server.cleanupInactiveUsers();
    expect(store.docs.has('teachers/b')).toBe(false);                       // 40 days
    expect(store.docs.has('teachers/a')).toBe(true);                        // 5 days
    const logs = [...store.docs.entries()].filter(([p]) => p.startsWith('deletionLogs/')).map(([, d]) => [d.uid, d.reason]);
    expect(logs).toEqual([['b', 'inactivity_90d_plus_30d_grace']]);
  });
});
