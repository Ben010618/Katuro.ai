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
  return { default: app, db, auth, firebaseConfig: {}, USE_EMULATORS: false };
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

  // ── Phase 2 ────────────────────────────────────────────────────────────────
  const PDF = new TextEncoder().encode('%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF\n');
  const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, 0, 1, 0, 0, 0, 1, 8, 2, 0, 0, 0]);

  it('files: members send and open; types checked by content; outsiders refused; delete removes the file', async () => {
    svc.setChatFunctionsBase('http://127.0.0.1:5001/demo-katuro/us-central1');
    await signIn('ana');
    const ana = await svc.syncDirectory();
    const cid = await svc.openDirectChat(ana, users.ben.uid);

    const sent = await svc.uploadChatFile(cid, { name: 'TOS Quarter 1.pdf', bytes: PDF }).promise;
    expect(sent.attachment).toMatchObject({ kind: 'file', name: 'TOS Quarter 1.pdf', size: PDF.byteLength, contentType: 'application/pdf' });
    const photo = await svc.uploadChatFile(cid, { name: 'board.png', bytes: PNG }).promise;
    expect(photo.attachment.kind).toBe('image');

    await expect(svc.uploadChatFile(cid, { name: 'fake.pdf', bytes: new TextEncoder().encode('not really a pdf') }).promise).rejects.toThrow(/does not look like a real PDF/);
    await expect(svc.uploadChatFile(cid, { name: 'setup.exe', bytes: PDF }).promise).rejects.toThrow(/Only Word, Excel, PowerPoint, PDF and images/);
    expect(svc.fileProblem('big.pdf', 26 * 1024 * 1024)).toMatch(/25 MB/);
    // The server refuses wrong types even when the app's check is skipped.
    const token = await fb.auth.currentUser.getIdToken();
    const raw = await fetch('http://127.0.0.1:5001/demo-katuro/us-central1/uploadChatFile', {
      method: 'POST', headers: { Authorization: `Bearer ${token}`, 'X-Chat-Id': cid, 'X-File-Name': 'setup.exe', 'Content-Type': 'application/octet-stream' }, body: PDF,
    });
    expect(raw.status).toBe(415);

    await signIn('ben');
    const ben = await svc.syncDirectory();
    const blob = await svc.fetchChatFile(cid, sent.attachment, { download: true });
    expect(new Uint8Array(await blob.arrayBuffer())).toEqual(PDF);
    const files = await new Promise((resolve, reject) => { const off = svc.subscribeAssets(cid, 'files', 30, (l) => { if (l.length) { off(); resolve(l); } }, reject); });
    expect(files[0]).toMatchObject({ name: 'TOS Quarter 1.pdf', senderName: 'Ana Reyes' });
    const media = await new Promise((resolve, reject) => { const off = svc.subscribeAssets(cid, 'media', 30, (l) => { if (l.length) { off(); resolve(l); } }, reject); });
    expect(media[0].name).toBe('board.png');

    await svc.sendMessage(cid, ben, 'Here: https://www.deped.gov.ph/2024/orders/ and https://example.org/test.');
    const links = await new Promise((resolve, reject) => { const off = svc.subscribeAssets(cid, 'links', 30, (l) => { if (l.length >= 2) { off(); resolve(l); } }, reject); });
    expect(links.map((l) => l.domain).sort()).toEqual(['deped.gov.ph', 'example.org']);
    expect(links.find((l) => l.domain === 'example.org').url).toBe('https://example.org/test'); // trailing "." not part of the link

    await signIn('carl');
    await expect(svc.fetchChatFile(cid, sent.attachment, { download: true })).rejects.toThrow(/not a member/);
    await signIn('adm');
    const adminCopy = await svc.fetchChatFile(cid, photo.attachment, { download: true });
    expect(adminCopy.size).toBe(PNG.byteLength); // the admin can open every shared file

    await signIn('ana');
    await expect(svc.deleteMyMessage(cid, (await adminDb.collection(`conversations/${cid}/messages`).where('senderUid', '==', users.ben.uid).get()).docs[0].id)).rejects.toBeTruthy(); // not mine
    await svc.deleteMyMessage(cid, sent.messageId);
    expect((await adminDb.doc(`conversations/${cid}/files/${sent.attachment.assetId}`).get()).exists).toBe(false);
    expect((await adminDb.doc(`conversations/${cid}/messages/${sent.messageId}`).get()).data()).toMatchObject({ deleted: true, text: '' });
    await signIn('ben');
    await expect(svc.fetchChatFile(cid, sent.attachment, { download: true })).rejects.toThrow(/deleted/);
  }, 120000);

  it('block stops a one-to-one chat (texts and files) both ways; mute is saved; unblock restores', async () => {
    await signIn('ana');
    const ana = await svc.syncDirectory();
    const cid = svc.directChatId(ana.uid, users.ben.uid);
    await svc.blockTeacher(ana.uid, users.ben.uid);
    await expect(svc.sendMessage(cid, ana, 'still there?')).rejects.toBeTruthy();
    await svc.setChatMuted(ana.uid, cid, true);
    expect((await adminDb.doc(`chatInbox/${ana.uid}/chats/${cid}`).get()).data().muted).toBe(true);

    await signIn('ben');
    const ben = await svc.syncDirectory();
    await expect(svc.sendMessage(cid, ben, 'hello?')).rejects.toBeTruthy();
    await expect(svc.uploadChatFile(cid, { name: 'notes.pdf', bytes: PDF }).promise).rejects.toThrow(/cannot send messages/);

    await signIn('ana');
    await svc.unblockTeacher(ana.uid, users.ben.uid);
    await svc.sendMessage(cid, ana, 'Unblocked, sorry!');
  }, 90000);

  it('division suggestions come from what teachers actually entered', async () => {
    await signIn('ben');
    const divisions = await svc.listDivisions();
    const laguna = divisions.find((d) => /laguna/i.test(d.name));
    expect(laguna.count).toBe(2); // "Schools Division of Laguna" and "SDO Laguna" are one division
    expect(divisions.some((d) => /cebu/i.test(d.name))).toBe(true);
  }, 60000);
});
