/**
 * Messages security rules — run against the local emulator:
 *   npm run test:rules
 * teacher1 + teacher2: same division (Laguna). teacher3: another division. admin1: admin.
 */
import { describe, it, beforeAll, afterAll, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import {
  doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, writeBatch, collection, query, where, serverTimestamp, orderBy, limit,
} from 'firebase/firestore';

const hasEmulator = Boolean(process.env.FIRESTORE_EMULATOR_HOST);

const dir = (uid, name, divisionKey, schoolKey = '') => ({
  uid, username: name.toLowerCase(), usernameKey: name.toLowerCase(), displayName: name,
  school: '', schoolId: '', division: divisionKey, schoolKey, divisionKey, photoURL: '',
});

describe.skipIf(!hasEmulator)('messages rules', () => {
  let env;
  const as = (uid) => env.authenticatedContext(uid).firestore();

  beforeAll(async () => {
    env = await initializeTestEnvironment({
      projectId: 'katuro-rules-test-messages',
      firestore: { rules: readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8') },
    });
  });
  afterAll(async () => { await env?.cleanup(); });

  beforeEach(async () => {
    await env.clearFirestore();
    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, 'teachers/teacher1'), { isAdmin: false });
      await setDoc(doc(db, 'teachers/teacher2'), { isAdmin: false });
      await setDoc(doc(db, 'teachers/teacher3'), { isAdmin: false });
      await setDoc(doc(db, 'teachers/admin1'), { isAdmin: true });
      await setDoc(doc(db, 'directory/teacher1'), dir('teacher1', 'Ana', 'laguna', 'id:301238'));
      await setDoc(doc(db, 'directory/teacher2'), dir('teacher2', 'Ben', 'laguna'));
      await setDoc(doc(db, 'directory/teacher3'), dir('teacher3', 'Carl', 'cebu'));
      await setDoc(doc(db, 'usernames/ana'), { uid: 'teacher1', username: 'ana' });
    });
  });

  // teacher1 starts a one-to-one chat with `other`.
  const startDm = (other, me = 'teacher1') => {
    const db = as(me);
    const members = [me, other].sort();
    const cid = `dm_${members[0]}_${members[1]}`;
    const b = writeBatch(db);
    b.set(doc(db, `conversations/${cid}`), { type: 'dm', members, createdBy: me, createdAt: serverTimestamp(), lastMessage: null, lastMessageAt: null });
    for (const uid of members) {
      b.set(doc(db, `conversations/${cid}/chatMembers/${uid}`), { uid, role: 'member', addedBy: me, joinedAt: serverTimestamp() });
      b.set(doc(db, `chatInbox/${uid}/chats/${cid}`), { cid, type: 'dm', addedAt: serverTimestamp(), lastReadAt: null });
    }
    return { cid, commit: () => b.commit() };
  };
  const send = (cid, uid, senderName, text = 'Hi po') => {
    const db = as(uid);
    const b = writeBatch(db);
    b.set(doc(collection(db, `conversations/${cid}/messages`)), { senderUid: uid, senderName, text, createdAt: serverTimestamp() });
    b.update(doc(db, `conversations/${cid}`), { lastMessage: { text, senderUid: uid, senderName }, lastMessageAt: serverTimestamp() });
    return b.commit();
  };

  it('usernames can be checked one at a time, never listed or written by clients', async () => {
    await assertSucceeds(getDoc(doc(as('teacher2'), 'usernames/ana')));
    await assertFails(getDocs(collection(as('teacher2'), 'usernames')));
    await assertFails(setDoc(doc(as('teacher2'), 'usernames/ben'), { uid: 'teacher2' }));
    await assertFails(setDoc(doc(as('teacher2'), 'usernames/ana'), { uid: 'teacher2' }));
  });

  it('the directory shows only teachers of the same school or division', async () => {
    await assertSucceeds(getDoc(doc(as('teacher1'), 'directory/teacher2')));
    await assertFails(getDoc(doc(as('teacher1'), 'directory/teacher3')));
    await assertSucceeds(getDocs(query(collection(as('teacher1'), 'directory'), where('divisionKey', '==', 'laguna'))));
    await assertFails(getDocs(query(collection(as('teacher1'), 'directory'), where('divisionKey', '==', 'cebu'))));
    await assertFails(setDoc(doc(as('teacher1'), 'directory/teacher1'), dir('teacher1', 'Ana', 'cebu')));
    await assertSucceeds(getDoc(doc(as('admin1'), 'directory/teacher3')));
  });

  it('one-to-one chats only within the same school or division', async () => {
    await assertSucceeds(startDm('teacher2').commit());
    await assertFails(startDm('teacher3').commit());
  });

  it('only members (and the admin) read a chat; senders cannot fake their name', async () => {
    const { cid, commit } = startDm('teacher2');
    await commit();
    await assertSucceeds(send(cid, 'teacher1', 'Ana'));
    await assertSucceeds(send(cid, 'teacher2', 'Ben', 'Salamat'));
    await assertFails(send(cid, 'teacher1', 'Principal Cruz'));          // impersonation
    await assertFails(send(cid, 'teacher3', 'Carl'));                    // not a member
    await assertFails(getDocs(collection(as('teacher3'), `conversations/${cid}/messages`)));
    await assertSucceeds(getDocs(collection(as('admin1'), `conversations/${cid}/messages`)));
  });

  it('teams: any teacher creates one; the admin adds same-school/division teachers; members can leave', async () => {
    const db = as('teacher1');
    const cid = 'team_test1';
    const b = writeBatch(db);
    b.set(doc(db, `conversations/${cid}`), { type: 'team', name: 'Grade 7 Science', createdBy: 'teacher1', createdAt: serverTimestamp(), lastMessage: null, lastMessageAt: null });
    b.set(doc(db, `conversations/${cid}/chatMembers/teacher1`), { uid: 'teacher1', role: 'admin', addedBy: 'teacher1', joinedAt: serverTimestamp() });
    b.set(doc(db, `chatInbox/teacher1/chats/${cid}`), { cid, type: 'team', addedAt: serverTimestamp(), lastReadAt: null });
    await assertSucceeds(b.commit());

    const add = (adder, uid) => {
      const d = as(adder);
      const bb = writeBatch(d);
      bb.set(doc(d, `conversations/${cid}/chatMembers/${uid}`), { uid, role: 'member', addedBy: adder, joinedAt: serverTimestamp() });
      bb.set(doc(d, `chatInbox/${uid}/chats/${cid}`), { cid, type: 'team', addedAt: serverTimestamp(), lastReadAt: null });
      return bb.commit();
    };
    await assertSucceeds(add('teacher1', 'teacher2'));
    await assertFails(add('teacher1', 'teacher3'));                      // other division
    await assertFails(add('teacher2', 'teacher3'));                      // members cannot add
    await assertFails(setDoc(doc(as('teacher3'), `conversations/${cid}/chatMembers/teacher3`), { uid: 'teacher3', role: 'admin', addedBy: 'teacher3', joinedAt: serverTimestamp() }));
    await assertSucceeds(send(cid, 'teacher2', 'Ben'));

    const db2 = as('teacher2');
    const leave = writeBatch(db2);
    leave.delete(doc(db2, `conversations/${cid}/chatMembers/teacher2`));
    leave.delete(doc(db2, `chatInbox/teacher2/chats/${cid}`));
    await assertSucceeds(leave.commit());
    await assertFails(send(cid, 'teacher2', 'Ben'));                     // gone
  });

  it('reports: members report a message; only the admin reads reports', async () => {
    const { cid, commit } = startDm('teacher2');
    await commit();
    await send(cid, 'teacher2', 'Ben', 'something bad');
    let msgs;
    await env.withSecurityRulesDisabled(async (ctx) => { msgs = await getDocs(collection(ctx.firestore(), `conversations/${cid}/messages`)); });
    const messageId = msgs.docs[0].id;
    const report = { cid, messageId, reporterUid: 'teacher1', reason: 'Not appropriate', messageText: 'something bad', senderUid: 'teacher2', senderName: 'Ben', createdAt: serverTimestamp(), status: 'open' };
    await assertSucceeds(setDoc(doc(as('teacher1'), 'chatReports/r1'), report));
    await assertFails(setDoc(doc(as('teacher3'), 'chatReports/r2'), { ...report, reporterUid: 'teacher3' }));
    await assertFails(getDoc(doc(as('teacher1'), 'chatReports/r1')));
    await assertSucceeds(getDoc(doc(as('admin1'), 'chatReports/r1')));
  });

  it('the admin can list every chat and every report (teachers cannot)', async () => {
    const { cid, commit } = startDm('teacher2');
    await commit();
    await send(cid, 'teacher1', 'Ana');
    await assertSucceeds(getDocs(query(collection(as('admin1'), 'conversations'), orderBy('lastMessageAt', 'desc'), limit(100))));
    await assertSucceeds(getDocs(query(collection(as('admin1'), 'chatReports'), orderBy('createdAt', 'desc'), limit(200))));
    await assertFails(getDocs(query(collection(as('teacher1'), 'conversations'), orderBy('lastMessageAt', 'desc'), limit(100))));
    await assertFails(getDocs(collection(as('teacher1'), 'chatReports')));
  });

  it('blocking stops one-to-one chats in both directions; only the owner sees their block list', async () => {
    const { cid, commit } = startDm('teacher2');
    await commit();
    await assertSucceeds(setDoc(doc(as('teacher2'), 'chatBlocks/teacher2/blocked/teacher1'), { at: 1 }));
    await assertFails(send(cid, 'teacher1', 'Ana'));                     // blocked by Ben
    await assertFails(send(cid, 'teacher2', 'Ben'));                     // Ben blocked Ana: no sending either
    await assertFails(getDoc(doc(as('teacher1'), 'chatBlocks/teacher2/blocked/teacher1')));
    await assertFails(setDoc(doc(as('teacher1'), 'chatBlocks/teacher2/blocked/teacher3'), { at: 1 }));
    await assertSucceeds(deleteDoc(doc(as('teacher2'), 'chatBlocks/teacher2/blocked/teacher1')));
    await assertSucceeds(send(cid, 'teacher1', 'Ana'));                  // unblocked
  });

  it('a new one-to-one chat cannot be started with someone who blocked you', async () => {
    await env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), 'chatBlocks/teacher2/blocked/teacher1'), { at: 1 }));
    await assertFails(startDm('teacher2').commit());
  });

  it('mute is a boolean on your own inbox only', async () => {
    const { cid, commit } = startDm('teacher2');
    await commit();
    await assertSucceeds(updateDoc(doc(as('teacher1'), `chatInbox/teacher1/chats/${cid}`), { muted: true }));
    await assertFails(updateDoc(doc(as('teacher1'), `chatInbox/teacher1/chats/${cid}`), { muted: 'yes' }));
    await assertFails(updateDoc(doc(as('teacher1'), `chatInbox/teacher2/chats/${cid}`), { muted: true }));
  });

  it('links are written by the sender with their own message; media/files are server-only', async () => {
    const { cid, commit } = startDm('teacher2');
    await commit();
    const db = as('teacher1');
    const msg = doc(collection(db, `conversations/${cid}/messages`));
    const link = (over = {}) => ({ url: 'https://www.deped.gov.ph/orders', domain: 'deped.gov.ph', messageId: msg.id, senderUid: 'teacher1', senderName: 'Ana', createdAt: serverTimestamp(), ...over });
    const b = writeBatch(db);
    b.set(msg, { senderUid: 'teacher1', senderName: 'Ana', text: 'See https://www.deped.gov.ph/orders', createdAt: serverTimestamp() });
    b.set(doc(collection(db, `conversations/${cid}/links`)), link());
    b.update(doc(db, `conversations/${cid}`), { lastMessage: { text: 'See', senderUid: 'teacher1', senderName: 'Ana' }, lastMessageAt: serverTimestamp() });
    await assertSucceeds(b.commit());
    await assertFails(setDoc(doc(collection(db, `conversations/${cid}/links`)), link({ url: 'javascript:alert(1)' })));
    await assertFails(setDoc(doc(collection(as('teacher2'), `conversations/${cid}/links`)), { ...link({ senderUid: 'teacher2', senderName: 'Ben' }) })); // not Ben's message
    await assertFails(setDoc(doc(db, `conversations/${cid}/files/f1`), { name: 'x.pdf' }));
    await assertFails(setDoc(doc(db, `conversations/${cid}/media/m1`), { name: 'x.png' }));
    await assertSucceeds(getDocs(collection(as('teacher2'), `conversations/${cid}/links`)));
    await assertFails(getDocs(collection(as('teacher3'), `conversations/${cid}/links`)));
    await assertSucceeds(getDocs(collection(as('admin1'), `conversations/${cid}/files`)));
  });

  it('links: no fake sender name, no reuse of an older message, none in a blocked chat', async () => {
    const { cid, commit } = startDm('teacher2');
    await commit();
    const db = as('teacher1');
    const withMessage = (linkOver = {}) => {
      const msg = doc(collection(db, `conversations/${cid}/messages`));
      const b = writeBatch(db);
      b.set(msg, { senderUid: 'teacher1', senderName: 'Ana', text: 'https://a.ph', createdAt: serverTimestamp() });
      b.set(doc(collection(db, `conversations/${cid}/links`)), { url: 'https://a.ph', domain: 'a.ph', messageId: msg.id, senderUid: 'teacher1', senderName: 'Ana', createdAt: serverTimestamp(), ...linkOver });
      b.update(doc(db, `conversations/${cid}`), { lastMessage: { text: 'x', senderUid: 'teacher1', senderName: 'Ana' }, lastMessageAt: serverTimestamp() });
      return { msg, commit: () => b.commit() };
    };
    await assertFails(withMessage({ senderName: 'DepEd Admin' }).commit());
    const first = withMessage();
    await assertSucceeds(first.commit());
    // A link pointing at an already existing message (even one's own) is refused.
    await assertFails(setDoc(doc(collection(db, `conversations/${cid}/links`)), { url: 'https://evil.ph', domain: 'deped.gov.ph', messageId: first.msg.id, senderUid: 'teacher1', senderName: 'Ana', createdAt: serverTimestamp() }));
    await env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), 'chatBlocks/teacher2/blocked/teacher1'), { at: 1 }));
    await assertFails(withMessage().commit());
  });

  it('a message with a file cannot be blanked by the client (the server deletes it with its file)', async () => {
    const { cid, commit } = startDm('teacher2');
    await commit();
    await env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), `conversations/${cid}/messages/m1`), {
      senderUid: 'teacher1', senderName: 'Ana', text: '', attachment: { assetId: 'a1', kind: 'file', name: 'TOS.pdf', size: 10 }, createdAt: 1,
    }));
    await assertFails(updateDoc(doc(as('teacher1'), `conversations/${cid}/messages/m1`), { text: '', deleted: true }));
  });

  it('a teacher can only mark their own inbox as read and only delete their own messages', async () => {
    const { cid, commit } = startDm('teacher2');
    await commit();
    await assertSucceeds(updateDoc(doc(as('teacher1'), `chatInbox/teacher1/chats/${cid}`), { lastReadAt: serverTimestamp() }));
    await assertFails(updateDoc(doc(as('teacher1'), `chatInbox/teacher2/chats/${cid}`), { lastReadAt: serverTimestamp() }));
    await send(cid, 'teacher2', 'Ben', 'oops');
    let msgs;
    await env.withSecurityRulesDisabled(async (ctx) => { msgs = await getDocs(collection(ctx.firestore(), `conversations/${cid}/messages`)); });
    const ref = (uid) => doc(as(uid), `conversations/${cid}/messages/${msgs.docs[0].id}`);
    await assertFails(updateDoc(ref('teacher1'), { text: '', deleted: true }));
    await assertSucceeds(updateDoc(ref('teacher2'), { text: '', deleted: true }));
    await assertFails(deleteDoc(ref('teacher2')));
  });
});
