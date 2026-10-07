/**
 * Email codes end to end: the real website services + the real sendEmailCode /
 * verifyEmailCode / registerUser / adminTestEmail functions + the real rules, on
 * the Firebase emulators. Resend is replaced by a local fake mail server
 * (functions/.env.demo-katuro points the functions at it).
 *   npm run test:e2e:email
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import http from 'http';
import path from 'path';
import { createRequire } from 'module';

const ON = Boolean(process.env.FIRESTORE_EMULATOR_HOST && process.env.FIREBASE_EMULATOR_HUB);
if (ON && !process.env.FIREBASE_AUTH_EMULATOR_HOST) process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099';
const PROJECT = 'demo-katuro';

vi.mock('../src/firebase.js', async () => {
  const { initializeApp } = await import('firebase/app');
  const { getFirestore, connectFirestoreEmulator } = await import('firebase/firestore');
  const { getAuth, connectAuthEmulator } = await import('firebase/auth');
  const { getFunctions, connectFunctionsEmulator } = await import('firebase/functions');
  const app = initializeApp({ projectId: 'demo-katuro', apiKey: 'demo-key', authDomain: 'demo-katuro.firebaseapp.com' }, 'e2e-email');
  const [fsHost, fsPort] = (process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080').split(':');
  const db = getFirestore(app);
  connectFirestoreEmulator(db, fsHost, Number(fsPort));
  const auth = getAuth(app);
  connectAuthEmulator(auth, `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST || '127.0.0.1:9099'}`, { disableWarnings: true });
  connectFunctionsEmulator(getFunctions(app, 'us-central1'), '127.0.0.1', 5001);
  return { default: app, db, auth, firebaseConfig: {}, USE_EMULATORS: false };
});

// Fake Resend: records each email; `mailStatus` makes it fail.
const inbox = [];
let mailStatus = 200;
let server;
const codeFor = (to) => {
  const m = [...inbox].reverse().find((x) => x.to === to);
  return m && m.text.match(/\b(\d{6})\b/)[1];
};

const form = (email) => ({ email, password: 'secret123', surname: 'Reyes', givenName: 'Ana', mi: '', school: 'Dayap NHS' });

let svc; let db; let fb; let adminDb; let adminAuth;

describe.skipIf(!ON)('Email codes end to end (emulators)', () => {
  beforeAll(async () => {
    server = http.createServer((req, res) => {
      let body = '';
      req.on('data', (c) => { body += c; });
      req.on('end', () => {
        const j = JSON.parse(body || '{}');
        if (mailStatus === 200) inbox.push({ to: j.to?.[0], text: j.text, from: j.from, auth: req.headers.authorization });
        res.writeHead(mailStatus, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(mailStatus === 200 ? { id: 'fake' } : { message: 'fake failure' }));
      });
    });
    await new Promise((r) => server.listen(9911, '127.0.0.1', r));

    const requireFromFunctions = createRequire(path.resolve(__dirname, '../functions/index.js'));
    const admin = requireFromFunctions('firebase-admin');
    const seedApp = admin.initializeApp({ projectId: PROJECT }, 'seed-email');
    adminDb = seedApp.firestore();
    adminAuth = seedApp.auth();
    await adminDb.doc('adminConfig/emailCode').set({ enabled: true });
    await adminDb.doc('adminConfig/resend').set({ apiKey: 're_testkey123' });

    svc = await import('../src/services/emailCode.js');
    db = await import('../src/services/db.js');
    fb = await import('../src/firebase.js');
  }, 60000);

  afterAll(async () => {
    await fb?.auth.signOut().catch(() => {});
    await new Promise((r) => server?.close(r));
  });

  it('sign-up: a code is emailed; no account without it; a wrong code is refused; the right one makes the account', async () => {
    const email = 'ana@e2e.test';
    const sent = await svc.sendSignupCode(email);
    expect(sent).toMatchObject({ required: true, sentTo: 'a**@e2e.test' });
    const code = codeFor(email);
    expect(code).toMatch(/^\d{6}$/);
    expect(inbox.at(-1).auth).toBe('Bearer re_testkey123');

    // KaTuroDesk / old apps (no code): sent to the website.
    await expect(db.selfSignUp(form(email))).rejects.toThrow(/katuro\.website/);
    await expect(db.selfSignUp({ ...form(email), code: code === '000000' ? '111111' : '000000' })).rejects.toThrow(/not right/);

    await db.selfSignUp({ ...form(email), code });
    const user = await adminAuth.getUserByEmail(email);
    const check = await adminDb.doc(`emailChecks/${user.uid}`).get();
    expect(check.exists).toBe(true);
    expect(fb.auth.currentUser?.email).toBe(email); // signed in right after
    // The same code cannot be used twice.
    await expect(svc.sendSignupCode(email)).rejects.toThrow(/already exists/);
  }, 60000);

  it('sign-in: a code is emailed to the signed-in teacher and the check is recorded', async () => {
    const { doc, getDoc } = await import('firebase/firestore');
    const uid = fb.auth.currentUser.uid;
    await adminDb.doc(`emailChecks/${uid}`).set({ verifiedAt: 1 }); // pretend the last check was long ago
    const before = inbox.length;
    const sent = await svc.sendSignInCode();
    expect(sent.required).toBe(true);
    expect(inbox.length).toBe(before + 1);
    // Asking again within a minute sends nothing new.
    expect((await svc.sendSignInCode()).waitSec).toBeGreaterThan(0);
    expect(inbox.length).toBe(before + 1);

    await expect(svc.verifySignInCode('000001')).rejects.toThrow(/not right|tries/);
    await svc.verifySignInCode(codeFor('ana@e2e.test'));
    const mine = await getDoc(doc(fb.db, 'emailChecks', uid));
    expect(mine.data().verifiedAt).toBeGreaterThan(Date.now() - 60000);
    expect(svc.needsEmailCode({ enabled: true }, mine.data())).toBe(false);
  }, 60000);

  it('if the email service fails, sign-up still works (and the next website sign-in asks)', async () => {
    await fb.auth.signOut();
    mailStatus = 500;
    try {
      const email = 'ben@e2e.test';
      expect(await svc.sendSignupCode(email)).toEqual({ required: false, providerDown: true });
      await db.selfSignUp(form(email));
      const user = await adminAuth.getUserByEmail(email);
      expect((await adminDb.doc(`emailChecks/${user.uid}`).get()).exists).toBe(false);
    } finally {
      mailStatus = 200;
    }
  }, 60000);

  it('switched off: sign-up works exactly as before', async () => {
    await fb.auth.signOut();
    await adminDb.doc('adminConfig/emailCode').set({ enabled: false });
    try {
      const before = inbox.length;
      expect(await svc.sendSignupCode('carl@e2e.test')).toEqual({ required: false });
      await db.selfSignUp(form('carl@e2e.test'));
      expect(inbox.length).toBe(before);
    } finally {
      await adminDb.doc('adminConfig/emailCode').set({ enabled: true });
    }
  }, 60000);

  it('no account without a name and school; a real sign-up is complete and its admin notice names the teacher', async () => {
    await fb.auth.signOut();
    await adminDb.doc('adminConfig/emailCode').set({ enabled: false });
    try {
      // Every required detail is checked on the server (an old or modified app cannot skip it).
      for (const [field, msg] of [['givenName', /First name/], ['surname', /Last name/], ['school', /School name/]]) {
        await expect(db.selfSignUp({ ...form(`miss-${field}@e2e.test`), [field]: '   ' })).rejects.toThrow(msg);
        expect((await adminAuth.getUserByEmail(`miss-${field}@e2e.test`).catch(() => null))).toBeNull();
      }
      await db.selfSignUp({ ...form('dana@e2e.test'), givenName: 'Dana', surname: 'Cruz', school: 'Calauan NHS' });
      const user = await adminAuth.getUserByEmail('dana@e2e.test');
      const teacher = (await adminDb.doc(`teachers/${user.uid}`).get()).data();
      expect(teacher).toMatchObject({ givenName: 'Dana', surname: 'Cruz', school: 'Calauan NHS', email: 'dana@e2e.test' });
      const notice = (await adminDb.collection('adminNotifications').where('uid', '==', user.uid).get()).docs.map((d) => d.data());
      expect(notice).toEqual([expect.objectContaining({ type: 'new_user', givenName: 'Dana', surname: 'Cruz', school: 'Calauan NHS', email: 'dana@e2e.test' })]);
    } finally {
      await adminDb.doc('adminConfig/emailCode').set({ enabled: true });
    }
  }, 60000);

  it('admin test email goes to the admin only', async () => {
    const { signInWithEmailAndPassword } = await import('firebase/auth');
    const carl = await adminAuth.getUserByEmail('carl@e2e.test');
    // Not an admin yet → refused.
    await signInWithEmailAndPassword(fb.auth, 'carl@e2e.test', 'secret123');
    await expect(svc.sendTestEmail()).rejects.toThrow(/Admin/);
    await adminDb.doc(`teachers/${carl.uid}`).set({ isAdmin: true }, { merge: true });
    const r = await svc.sendTestEmail();
    expect(r).toMatchObject({ ok: true, to: 'carl@e2e.test' });
    expect(codeFor('carl@e2e.test')).toBe('123456');
  }, 60000);
});
