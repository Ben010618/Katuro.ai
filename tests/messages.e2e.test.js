/**
 * Messages end to end: the real chatService + the real claimUsername/syncDirectory
 * functions + the real firestore.rules, on the Firebase emulators.
 *   npm run test:e2e:messages
 * Ana (Laguna, Dayap NHS) and Ben (Laguna, other school) may talk; Carl (Cebu) may not.
 */
import { describe, it, expect, beforeAll, vi } from 'vitest';
import path from 'path';
import { createRequire } from 'module';

// Only inside `firebase emulators:exec` (the hub variable is set there); the auth emulator
// address is not exported by the CLI, so the default port is used.
const ON = Boolean(process.env.FIRESTORE_EMULATOR_HOST && process.env.FIREBASE_EMULATOR_HUB);
if (ON && !process.env.FIREBASE_AUTH_EMULATOR_HOST) process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099';
const PROJECT = 'demo-katuro';

vi.mock('../src/firebase.js', async () => {
  const { initializeApp } = await import('firebase/app');
  const { getFirestore, connectFirestoreEmulator } = await import('firebase/firestore');
  const { getAuth, connectAuthEmulator } = await import('firebase/auth');
  const { getFunctions, connectFunctionsEmulator } = await import('firebase/functions');
  const app = initializeApp({ projectId: 'demo-katuro', apiKey: 'demo-key', authDomain: 'demo-katuro.firebaseapp.com' }, 'e2e');
  const [fsHost, fsPort] = (process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080').split(':');
  const db = getFirestore(app);
  connectFirestoreEmulator(db, fsHost, Number(fsPort));
  const auth = getAuth(app);
  connectAuthEmulator(auth, `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST || '127.0.0.1:9099'}`, { disableWarnings: true });
  connectFunctionsEmulator(getFunctions(app, 'us-central1'), '127.0.0.1', 5001);
  return { default: app, db, auth, firebaseConfig: {} };
});

const users = {
  ana:  { email: 'ana@e2e.test',  profile: { name: 'Ana Reyes',  school: 'Dayap National High School', schoolId: '301238', division: 'Schools Division of Laguna' } },
  ben:  { email: 'ben@e2e.test',  profile: { name: 'Ben Cruz',   school: 'Calauan NHS',                division: 'SDO Laguna' } },
  carl: { email: 'carl@e2e.test', profile: { name: 'Carl Santos', school: 'Cebu City NHS',             division: 'Cebu City' } },
  adm:  { email: 'adm@e2e.test',  profile: { name: 'KaTuro Admin', isAdmin: true } },
};
const PASSWORD = 'secret123';

let svc;
let fb;
let signIn;
let adminDb;

const waitFor = async (fn, ms = 15000) => {
  const end = Date.now() + ms;
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() > end) throw new Error('timed out waiting');
    await new Promise((r) => setTimeout(r, 200));
  }
};

describe.skipIf(!ON)('Messages end to end (emulators)', () => {
  beforeAll(async () => {
    const requireFromFunctions = createRequire(path.resolve(__dirname, '../functions/index.js'));
    const admin = requireFromFunctions('firebase-admin');
    const seedApp = admin.initializeApp({ projectId: PROJECT }, 'seed');
    adminDb = seedApp.firestore();
    // Teacher record first, shaped like a real registration, so the sign-up security
    // trigger (enforceRegistrationSecurity) keeps the account.
    for (const [key, u] of Object.entries(users)) {
      u.uid = `e2e-${key}`;
      const [givenName, surname] = u.profile.name.split(' ');
      await adminDb.doc(`teachers/${u.uid}`).set({
        isAdmin: false, ...u.profile, givenName, surname, school: u.profile.school || 'KaTuro HQ', email: u.email, _registeredViaFunction: true,
      });
      await seedApp.auth().createUser({ uid: u.uid, email: u.email, password: PASSWORD });
    }
    await new Promise((r) => setTimeout(r, 1500)); // let the trigger run, then make sure it kept everyone
    for (const u of Object.values(users)) expect((await adminDb.doc(`teachers/${u.uid}`).get()).exists).toBe(true);
    svc = await import('../src/services/messages/chatService.js');
    fb = await import('../src/firebase.js');
    const { signInWithEmailAndPassword, signOut } = await import('firebase/auth');
    signIn = async (key) => {
      if (fb.auth.currentUser) await signOut(fb.auth);
      await signInWithEmailAndPassword(fb.auth, users[key].email, PASSWORD);
      return users[key];
    };
  }, 60000);

  it('usernames are unique; directory cards come from the profile', async () => {
    await signIn('ana');
    expect(await svc.syncDirectory()).toBeNull(); // no username yet
    const ana = await svc.claimUsername('Ana');
    expect(ana).toMatchObject({ username: 'ana', displayName: 'Ana Reyes', schoolKey: 'id:301238', divisionKey: 'laguna' });

    await signIn('ben');
    await expect(svc.claimUsername('ana')).rejects.toThrow('That username is taken.');
    expect(await svc.isUsernameFree('ana', users.ben.uid)).toBe(false);
    expect((await svc.claimUsername('@Ben')).divisionKey).toBe('laguna');

    await signIn('carl');
    await svc.claimUsername('carl');
    await signIn('adm');
    await svc.claimUsername('kt.admin');
  }, 60000);

  it('the directory only shows the same school or division', async () => {
    const me = await (async () => { await signIn('ana'); return svc.syncDirectory(); })();
    const list = await svc.listColleagues(me);
    expect(list.map((c) => c.username)).toContain('ben');
    expect(list.map((c) => c.username)).not.toContain('carl');
    expect(await svc.findByUsername('carl', me)).toEqual({ reason: 'other_org' });
    expect(await svc.findByUsername('nobody.here', me)).toEqual({ reason: 'not_found' });
    expect((await svc.findByUsername('ben', me)).card.uid).toBe(users.ben.uid);
  }, 60000);

  it('one-to-one chat: send, unread, read, delete; never across divisions', async () => {
    await signIn('ana');
    const me = await svc.syncDirectory();
    const cid = await svc.openDirectChat(me, users.ben.uid);
    expect(await svc.openDirectChat(me, users.ben.uid)).toBe(cid); // reopening, no duplicate
    await svc.sendMessage(cid, me, 'Hello Ben, the TOS is ready.');
    await expect(svc.openDirectChat(me, users.carl.uid)).rejects.toBeTruthy();

    await signIn('ben');
    const ben = await svc.syncDirectory();
    const inbox = await new Promise((resolve, reject) => {
      const off = svc.subscribeInbox(ben.uid, (items) => { if (items.some((i) => i.id === cid)) { off(); resolve(items); } }, reject);
    });
    const conv = await new Promise((resolve, reject) => {
      const off = svc.subscribeConversation(cid, (c) => { if (c?.lastMessage) { off(); resolve(c); } }, reject);
    });
    expect(svc.isUnread(inbox.find((i) => i.id === cid), conv, ben.uid)).toBe(true);
    await svc.markRead(ben.uid, cid);
    const inbox2 = await waitFor(async () => {
      const snap = await adminDb.doc(`chatInbox/${ben.uid}/chats/${cid}`).get();
      return snap.data().lastReadAt ? snap.data() : null;
    });
    expect(svc.isUnread({ lastReadAt: { toMillis: () => inbox2.lastReadAt.toMillis() } }, conv, ben.uid)).toBe(false);

    await svc.sendMessage(cid, ben, 'Salamat po!');
    const msgs = await new Promise((resolve, reject) => {
      const off = svc.subscribeMessages(cid, 50, (list) => { if (list.length >= 2) { off(); resolve(list); } }, reject);
    });
    expect(msgs.map((m) => m.text)).toEqual(['Hello Ben, the TOS is ready.', 'Salamat po!']);
    await svc.deleteMyMessage(cid, msgs[1].id);
    await expect(svc.deleteMyMessage(cid, msgs[0].id)).rejects.toBeTruthy(); // not Ben's message

    // Ask the server directly (the client cache of this shared test session may still
    // hold Ben's copy; the real app only ever queries chats in the user's own inbox).
    await signIn('carl');
    const { getDocsFromServer, getDocFromServer, collection, doc } = await import('firebase/firestore');
    await expect(getDocsFromServer(collection(fb.db, 'conversations', cid, 'messages'))).rejects.toMatchObject({ code: 'permission-denied' });
    await expect(getDocFromServer(doc(fb.db, 'conversations', cid))).rejects.toMatchObject({ code: 'permission-denied' });
  }, 90000);

  it('teams: create, refuse other divisions, members leave, admin hands over, report reaches the admin', async () => {
    await signIn('ana');
    const ana = await svc.syncDirectory();
    const { cid, failed } = await svc.createTeam(ana, 'Grade 7 Science', [users.ben.uid, users.carl.uid]);
    expect(failed).toEqual([users.carl.uid]);
    await svc.sendMessage(cid, ana, 'Welcome to the team.');

    await signIn('ben');
    const ben = await svc.syncDirectory();
    const members = await new Promise((resolve, reject) => {
      const off = svc.subscribeMembers(cid, (list) => { if (list.length === 2) { off(); resolve(list); } }, reject);
    });
    expect(members.find((m) => m.uid === ana.uid).role).toBe('admin');
    await expect(svc.addTeamMember(ben, cid, users.carl.uid)).rejects.toBeTruthy(); // members cannot add
    const msgs = await new Promise((resolve, reject) => {
      const off = svc.subscribeMessages(cid, 50, (list) => { if (list.length) { off(); resolve(list); } }, reject);
    });
    await svc.reportMessage(cid, msgs[0], ben, 'Testing the report');
    const reports = await adminDb.collection('chatReports').where('cid', '==', cid).get();
    expect(reports.size).toBe(1);

    // Ana (only admin) leaves: Ben becomes admin first, so the team keeps an admin.
    await signIn('ana');
    const membersNow = (await adminDb.collection(`conversations/${cid}/chatMembers`).get()).docs.map((d) => d.data());
    await svc.leaveTeam(ana, cid, membersNow);
    const after = (await adminDb.collection(`conversations/${cid}/chatMembers`).get()).docs.map((d) => d.data());
    expect(after).toEqual([expect.objectContaining({ uid: users.ben.uid, role: 'admin' })]);
    expect((await adminDb.doc(`chatInbox/${ana.uid}/chats/${cid}`).get()).exists).toBe(false);

    await signIn('ben');
    await svc.renameTeam(cid, 'G7 Science Team');
    await signIn('adm');
    const { getDocs, collection, orderBy, query, limit } = await import('firebase/firestore');
    const all = await getDocs(query(collection(fb.db, 'conversations'), orderBy('lastMessageAt', 'desc'), limit(100)));
    expect(all.size).toBeGreaterThanOrEqual(2); // the admin can see every chat
  }, 90000);
});
