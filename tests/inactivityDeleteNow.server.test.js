/**
 * adminDeleteInactiveNow, adminDeleteUser, adminPurgeLeftovers and the nightly
 * cleanupInactiveUsers (functions/index.js) against a fake Firestore / Auth / Storage.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import { fakeFirebase, ts } from './helpers/fakeFirebase';

const FUNCTIONS_DIR = path.resolve(__dirname, '../functions');
const requireFromFunctions = createRequire(path.join(FUNCTIONS_DIR, 'index.js'));

class HttpsError extends Error {
  constructor(code, message, details) { super(message); this.code = code; this.details = details; }
}
const DAY = 86400000;

function loadServer(f) {
  const chain = new Proxy(function chainFn() {}, { get: () => chain, apply: () => chain });
  const stubs = {
    'firebase-functions/v2/https': { onCall: (opts, fn) => fn || opts, onRequest: (opts, fn) => fn || opts, HttpsError },
    'firebase-functions/v2/scheduler': { onSchedule: (opts, fn) => fn || opts },
    'firebase-functions/v2/firestore': { onDocumentCreated: () => () => {} },
    'firebase-functions/v1': chain,
    'firebase-admin/firestore': { FieldValue: f.FieldValue },
    'firebase-admin': { initializeApp() {}, ...f.admin },
  };
  const req = (id) => (id in stubs ? stubs[id] : id === './accountPurge' ? requireFromFunctions('./accountPurge.js') : requireFromFunctions(id));
  const src = fs.readFileSync(path.join(FUNCTIONS_DIR, 'index.js'), 'utf8');
  const mod = { exports: {} };
  new Function('require', 'module', 'exports', '__dirname', '__filename', src)(req, mod, mod.exports, FUNCTIONS_DIR, path.join(FUNCTIONS_DIR, 'index.js'));
  return mod.exports;
}

describe('Inactivity Cleanup and account deletion (server)', () => {
  let f;
  let server;
  const now = Date.now();

  beforeEach(() => {
    f = fakeFirebase();
    ['admin1', 'a', 'b', 'c', 'active', 'admin2'].forEach((u) => f.authUsers.add(u));
    const t = (id, data) => f.docs.set(`teachers/${id}`, { email: `${id}@deped.gov.ph`, displayName: id.toUpperCase(), ...data });
    t('admin1', { isAdmin: true, disabled: false });
    t('a', { isAdmin: false, disabled: true, deactivatedForInactivityAt: ts(now - 5 * DAY) });
    t('b', { isAdmin: false, disabled: true, deactivatedForInactivityAt: ts(now - 40 * DAY) });
    t('c', { isAdmin: false, disabled: true, deactivatedForInactivityAt: ts(now - 2 * DAY) });
    t('active', { isAdmin: false, disabled: false, lastActiveAt: ts(now - DAY) });
    t('admin2', { isAdmin: true, disabled: true, deactivatedForInactivityAt: ts(now - 3 * DAY) });
    f.docs.set('teachers/a/lessons/l1', { title: 'x' });
    f.docs.set('sections/s1', { adviserUid: 'a' });
    f.docs.set('sections/s1/students/st1', { name: 'x' });
    f.docs.set('sections/s2', { adviserUid: 'active' });
    f.docs.set('usageEvents/e1', { uid: 'a' });
    f.docs.set('directory/a', { uid: 'a' });
    f.docs.set('usernames/aname', { uid: 'a' });
    f.files.add('profilePhotos/a/avatar.jpg');
    server = loadServer(f);
  });

  const call = (uid, uids) => server.adminDeleteInactiveNow({ auth: uid ? { uid } : null, data: { uids } });
  const logs = () => [...f.docs.entries()].filter(([p]) => p.startsWith('deletionLogs/')).map(([, d]) => d);

  it('admins only', async () => {
    await expect(call(null, ['a'])).rejects.toMatchObject({ code: 'unauthenticated' });
    await expect(call('active', ['a'])).rejects.toMatchObject({ code: 'permission-denied' });
    await expect(call('admin1', [])).rejects.toMatchObject({ code: 'invalid-argument' });
    expect(f.docs.has('teachers/a')).toBe(true);
  });

  it('"Delete all now" removes the listed pending accounts completely; never an admin, an active teacher, or one not listed', async () => {
    const res = await call('admin1', ['a', 'b', 'admin2', 'active', 'ghost']);
    expect(res).toEqual({ deleted: 2, failed: 0, skipped: 3, remaining: 0 });
    for (const p of ['teachers/a', 'teachers/a/lessons/l1', 'teachers/b', 'sections/s1', 'sections/s1/students/st1', 'usageEvents/e1', 'directory/a', 'usernames/aname']) expect(f.docs.has(p), p).toBe(false);
    expect(f.files.has('profilePhotos/a/avatar.jpg')).toBe(false);
    expect([...f.authUsers].sort()).toEqual(['active', 'admin1', 'admin2', 'c']);
    for (const p of ['teachers/c', 'teachers/admin2', 'teachers/active', 'teachers/admin1', 'sections/s2']) expect(f.docs.has(p)).toBe(true);
    expect(logs().map((l) => [l.uid, l.reason, l.deletedBy, l.email])).toEqual([['a', 'inactivity_deleted_by_admin', 'admin1', 'a***@deped.gov.ph'], ['b', 'inactivity_deleted_by_admin', 'admin1', 'b***@deped.gov.ph']]);
    expect(logs().every((l) => l.displayName === undefined)).toBe(true);
  });

  it('someone who logged back in after the admin opened the list is kept', async () => {
    f.docs.set('teachers/a', { ...f.docs.get('teachers/a'), disabled: false, deactivatedForInactivityAt: undefined });
    expect(await call('admin1', ['a', 'b'])).toEqual({ deleted: 1, failed: 0, skipped: 1, remaining: 0 });
    expect(f.docs.has('teachers/a')).toBe(true);
  });

  it('the single "Delete account" also removes everything', async () => {
    await server.adminDeleteUser({ auth: { uid: 'admin1' }, data: { uid: 'a' } });
    for (const p of ['teachers/a', 'usageEvents/e1', 'directory/a', 'usernames/aname', 'sections/s1']) expect(f.docs.has(p), p).toBe(false);
    expect(f.authUsers.has('a')).toBe(false);
    await expect(server.adminDeleteUser({ auth: { uid: 'admin1' }, data: { uid: 'admin2' } })).rejects.toMatchObject({ code: 'permission-denied' });
  });

  it('leftovers of accounts deleted earlier: counted first, then removed', async () => {
    f.docs.set('directory/old', { uid: 'old' });
    f.docs.set('usageEvents/e9', { uid: 'old' });
    expect(await server.adminPurgeLeftovers({ auth: { uid: 'admin1' }, data: { dryRun: true } })).toEqual({ found: 1 });
    expect(f.docs.has('directory/old')).toBe(true);
    expect(await server.adminPurgeLeftovers({ auth: { uid: 'admin1' }, data: {} })).toEqual({ found: 1, deleted: 1, failed: 0, remaining: 0 });
    expect(f.docs.has('directory/old')).toBe(false);
    expect(f.docs.has('usageEvents/e9')).toBe(false);
    await expect(server.adminPurgeLeftovers({ auth: { uid: 'active' }, data: {} })).rejects.toMatchObject({ code: 'permission-denied' });
  });

  it('the nightly job deletes only accounts past the 30-day grace, completely', async () => {
    f.docs.set('directory/b', { uid: 'b' });
    await server.cleanupInactiveUsers();
    expect(f.docs.has('teachers/b')).toBe(false);
    expect(f.docs.has('directory/b')).toBe(false);
    expect(f.docs.has('teachers/a')).toBe(true);
    expect(logs().map((l) => [l.uid, l.reason])).toEqual([['b', 'inactivity_90d_plus_30d_grace']]);
  });
});
