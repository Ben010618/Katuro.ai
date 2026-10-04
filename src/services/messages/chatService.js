/**
 * chatService.js — Messages (Phase 1): unique usernames, the school/division
 * directory, one-to-one chats and teams. Every write here matches a rule in
 * firestore.rules (see tests/messagesRules.test.js); usernames and directory cards
 * are written only by the claimUsername / syncDirectory Cloud Functions.
 *
 * Data:
 *   usernames/{name}                    { uid }                  (unique names)
 *   directory/{uid}                     public card: username, displayName, school, division, keys
 *   conversations/{cid}                 { type: 'dm'|'team', name?, members?, createdBy, lastMessage, lastMessageAt }
 *   conversations/{cid}/chatMembers/{uid} { uid, role: 'admin'|'member', addedBy, joinedAt }
 *   conversations/{cid}/messages/{id}   { senderUid, senderName, text, createdAt, deleted? }
 *   chatInbox/{uid}/chats/{cid}         { cid, type, addedAt, lastReadAt }
 *   chatReports/{id}                    reported messages (admin only)
 */
import {
  collection, doc, getDoc, getDocs, onSnapshot, query, where, orderBy, limit,
  writeBatch, serverTimestamp, updateDoc, addDoc,
} from 'firebase/firestore';
import app, { db } from '../../firebase';

export const MAX_MESSAGE_LENGTH = 4000;
export const MAX_TEAM_MEMBERS = 50;
const USERNAME_RE = /^[a-z0-9](?:[a-z0-9._]{1,18})[a-z0-9]$/;
const RESERVED = new Set(['admin', 'administrator', 'katuro', 'katuroai', 'support', 'help', 'deped', 'system', 'moderator', 'mod', 'root', 'official', 'staff', 'security', 'teacher', 'principal']);

export function normalizeUsername(value) {
  return String(value || '').trim().toLowerCase().replace(/^@+/, '');
}

/** A short reason the username can't be used, or '' (same rules as the server). */
export function usernameProblem(value) {
  const u = normalizeUsername(value);
  if (!u) return 'Choose a username.';
  if (u.length < 3) return 'At least 3 characters.';
  if (u.length > 20) return 'At most 20 characters.';
  if (!USERNAME_RE.test(u) || /[._]{2}/.test(u)) return 'Use letters, numbers, dots or underscores. Start and end with a letter or number.';
  if (RESERVED.has(u)) return 'That username is taken.';
  return '';
}

async function callFunction(name, data = {}) {
  const { getFunctions, httpsCallable } = await import('firebase/functions');
  const res = await httpsCallable(getFunctions(app, 'us-central1'), name)(data);
  return res.data;
}

/** true when nobody else holds the name (the server still makes the final, atomic check). */
export async function isUsernameFree(value, myUid) {
  const snap = await getDoc(doc(db, 'usernames', normalizeUsername(value)));
  return !snap.exists() || snap.data().uid === myUid;
}

/** Claims (or changes) the caller's username. Throws "That username is taken." when it is. */
export async function claimUsername(value) {
  return callFunction('claimUsername', { username: normalizeUsername(value) });
}

/** The caller's directory card, refreshed from their profile; null before a username is chosen. */
export async function syncDirectory() {
  const res = await callFunction('syncDirectory');
  return res?.entry || null;
}

/** A teacher can message others only once their profile has a school (ID or name) or division. */
export function canMessage(entry) {
  return Boolean(entry?.divisionKey || entry?.schoolKey);
}

export function sameOrg(a, b) {
  return Boolean(a && b && ((a.divisionKey && a.divisionKey === b.divisionKey) || (a.schoolKey && a.schoolKey === b.schoolKey)));
}

const dirCache = new Map();

/** A directory card by uid (cached); null when it is not visible to you or does not exist. */
export async function getDirectoryCard(uid) {
  if (dirCache.has(uid)) return dirCache.get(uid);
  try {
    const snap = await getDoc(doc(db, 'directory', uid));
    const card = snap.exists() ? { id: snap.id, ...snap.data() } : null;
    dirCache.set(uid, card);
    return card;
  } catch {
    dirCache.set(uid, null);
    return null;
  }
}

/** Teachers of my school and division (up to a few hundred each), sorted by name, without me. */
export async function listColleagues(me) {
  const found = new Map();
  const add = (snap) => snap.docs.forEach((d) => { if (d.id !== me.uid) found.set(d.id, { id: d.id, ...d.data() }); });
  const tasks = [];
  if (me.schoolKey) tasks.push(getDocs(query(collection(db, 'directory'), where('schoolKey', '==', me.schoolKey), limit(300))).then(add));
  if (me.divisionKey) tasks.push(getDocs(query(collection(db, 'directory'), where('divisionKey', '==', me.divisionKey), limit(300))).then(add));
  await Promise.all(tasks);
  const list = [...found.values()];
  list.forEach((c) => dirCache.set(c.id, c));
  // Same school first, then alphabetical.
  const rank = (c) => (me.schoolKey && c.schoolKey === me.schoolKey ? 0 : 1);
  return list.sort((a, b) => rank(a) - rank(b) || String(a.displayName || '').localeCompare(String(b.displayName || '')));
}

/** Exact username lookup. Returns { card } or { reason } ('not_found' | 'other_org' | 'self'). */
export async function findByUsername(value, me) {
  const name = normalizeUsername(value);
  if (!name) return { reason: 'not_found' };
  const snap = await getDoc(doc(db, 'usernames', name));
  if (!snap.exists()) return { reason: 'not_found' };
  const uid = snap.data().uid;
  if (uid === me.uid) return { reason: 'self' };
  const card = await getDirectoryCard(uid);
  return card ? { card } : { reason: 'other_org' };
}

export function directChatId(a, b) {
  const [x, y] = [a, b].sort();
  return `dm_${x}_${y}`;
}

/** Opens (or creates) the one-to-one chat with another teacher. Returns the chat id. */
export async function openDirectChat(me, otherUid) {
  const cid = directChatId(me.uid, otherUid);
  const mine = await getDoc(doc(db, 'chatInbox', me.uid, 'chats', cid));
  if (mine.exists()) return cid;
  const members = [me.uid, otherUid].sort();
  const batch = writeBatch(db);
  batch.set(doc(db, 'conversations', cid), { type: 'dm', members, createdBy: me.uid, createdAt: serverTimestamp(), lastMessage: null, lastMessageAt: null });
  for (const uid of members) {
    batch.set(doc(db, 'conversations', cid, 'chatMembers', uid), { uid, role: 'member', addedBy: me.uid, joinedAt: serverTimestamp() });
    batch.set(doc(db, 'chatInbox', uid, 'chats', cid), { cid, type: 'dm', addedAt: serverTimestamp(), lastReadAt: null });
  }
  await batch.commit();
  return cid;
}

/** Adds one teacher to a team (team admins only; same school or division). */
export async function addTeamMember(me, cid, uid) {
  const batch = writeBatch(db);
  batch.set(doc(db, 'conversations', cid, 'chatMembers', uid), { uid, role: 'member', addedBy: me.uid, joinedAt: serverTimestamp() });
  batch.set(doc(db, 'chatInbox', uid, 'chats', cid), { cid, type: 'team', addedAt: serverTimestamp(), lastReadAt: null });
  await batch.commit();
}

/**
 * Creates a team with me as its admin, then adds each member (one small write each,
 * so one refused member never blocks the others). Returns { cid, failed: [uid] }.
 */
export async function createTeam(me, name, memberUids = []) {
  const title = String(name || '').replace(/\s+/g, ' ').trim().slice(0, 60);
  if (!title) throw new Error('Give the team a name.');
  const ref = doc(collection(db, 'conversations'));
  const batch = writeBatch(db);
  batch.set(ref, { type: 'team', name: title, createdBy: me.uid, createdAt: serverTimestamp(), lastMessage: null, lastMessageAt: null });
  batch.set(doc(db, 'conversations', ref.id, 'chatMembers', me.uid), { uid: me.uid, role: 'admin', addedBy: me.uid, joinedAt: serverTimestamp() });
  batch.set(doc(db, 'chatInbox', me.uid, 'chats', ref.id), { cid: ref.id, type: 'team', addedAt: serverTimestamp(), lastReadAt: null });
  await batch.commit();
  const failed = [];
  for (const uid of [...new Set(memberUids)].filter((u) => u !== me.uid).slice(0, MAX_TEAM_MEMBERS - 1)) {
    try {
      await addTeamMember(me, ref.id, uid);
    } catch {
      failed.push(uid);
    }
  }
  return { cid: ref.id, failed };
}

export async function renameTeam(cid, name) {
  const title = String(name || '').replace(/\s+/g, ' ').trim().slice(0, 60);
  if (!title) throw new Error('Give the team a name.');
  await updateDoc(doc(db, 'conversations', cid), { name: title });
}

/** A team admin removes a member. */
export async function removeTeamMember(cid, uid) {
  const batch = writeBatch(db);
  batch.delete(doc(db, 'conversations', cid, 'chatMembers', uid));
  batch.delete(doc(db, 'chatInbox', uid, 'chats', cid));
  await batch.commit();
}

/**
 * Leave a team. If I am its only admin and others remain, the longest-standing member
 * becomes admin first, so the team can still add people.
 */
export async function leaveTeam(me, cid, members = []) {
  const others = members.filter((m) => m.uid !== me.uid);
  const iAmAdmin = members.some((m) => m.uid === me.uid && m.role === 'admin');
  if (iAmAdmin && others.length && !others.some((m) => m.role === 'admin')) {
    const ms = (t) => (t?.toMillis ? t.toMillis() : 0);
    const next = [...others].sort((a, b) => ms(a.joinedAt) - ms(b.joinedAt))[0];
    await updateDoc(doc(db, 'conversations', cid, 'chatMembers', next.uid), { role: 'admin' });
  }
  const batch = writeBatch(db);
  batch.delete(doc(db, 'conversations', cid, 'chatMembers', me.uid));
  batch.delete(doc(db, 'chatInbox', me.uid, 'chats', cid));
  await batch.commit();
}

export function subscribeInbox(uid, cb, onError) {
  return onSnapshot(query(collection(db, 'chatInbox', uid, 'chats'), limit(100)),
    (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...d.data({ serverTimestamps: 'estimate' }) }))),
    (err) => onError?.(err));
}

export function subscribeConversation(cid, cb, onError) {
  return onSnapshot(doc(db, 'conversations', cid),
    (snap) => cb(snap.exists() ? { id: snap.id, ...snap.data({ serverTimestamps: 'estimate' }) } : null),
    (err) => onError?.(err));
}

export function subscribeMembers(cid, cb, onError) {
  return onSnapshot(collection(db, 'conversations', cid, 'chatMembers'),
    (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    (err) => onError?.(err));
}

/** The latest `count` messages, oldest first. */
export function subscribeMessages(cid, count, cb, onError) {
  return onSnapshot(query(collection(db, 'conversations', cid, 'messages'), orderBy('createdAt', 'desc'), limit(count)),
    (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...d.data({ serverTimestamps: 'estimate' }) })).reverse(), snap.size >= count),
    (err) => onError?.(err));
}

export async function sendMessage(cid, me, rawText) {
  const text = String(rawText || '').replace(/\r\n/g, '\n').trim();
  if (!text) return;
  if (text.length > MAX_MESSAGE_LENGTH) throw new Error(`Messages can be at most ${MAX_MESSAGE_LENGTH} characters.`);
  const batch = writeBatch(db);
  batch.set(doc(collection(db, 'conversations', cid, 'messages')), { senderUid: me.uid, senderName: me.displayName, text, createdAt: serverTimestamp() });
  batch.update(doc(db, 'conversations', cid), {
    lastMessage: { text: text.slice(0, 140), senderUid: me.uid, senderName: me.displayName },
    lastMessageAt: serverTimestamp(),
  });
  await batch.commit();
}

export async function markRead(uid, cid) {
  await updateDoc(doc(db, 'chatInbox', uid, 'chats', cid), { lastReadAt: serverTimestamp() });
}

export async function deleteMyMessage(cid, messageId) {
  await updateDoc(doc(db, 'conversations', cid, 'messages', messageId), { text: '', deleted: true });
}

export async function reportMessage(cid, message, me, reason) {
  await addDoc(collection(db, 'chatReports'), {
    cid,
    messageId: message.id,
    reporterUid: me.uid,
    reason: String(reason || '').trim().slice(0, 500),
    messageText: String(message.text || '').slice(0, 1000),
    senderUid: message.senderUid,
    senderName: message.senderName || '',
    createdAt: serverTimestamp(),
    status: 'open',
  });
}

const ms = (t) => (t?.toMillis ? t.toMillis() : (t instanceof Date ? t.getTime() : 0));

/** Unread = someone else wrote after I last opened the chat. */
export function isUnread(inboxItem, conversation, myUid) {
  if (!conversation?.lastMessageAt || !conversation.lastMessage) return false;
  if (conversation.lastMessage.senderUid === myUid) return false;
  return ms(conversation.lastMessageAt) > ms(inboxItem?.lastReadAt);
}

