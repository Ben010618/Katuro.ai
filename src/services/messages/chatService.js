/**
 * chatService.js — Messages: unique usernames, finding teachers by @username,
 * invites/contacts, one-to-one chats and teams. Every write here matches a rule in
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
 *   chatInvites/{from}_{to}             { from, to, status: pending|accepted|declined, from card } (server-written)
 *   chatContacts/{uid}/list/{otherUid}  accepted invites, both ways (server-written)
 * Phase 2:
 *   conversations/{cid}/media|files/{id} shared images / documents (written by uploadChatFile)
 *   conversations/{cid}/links/{id}      web links found in messages (written with the message)
 *   chatBlocks/{uid}/blocked/{otherUid} teachers I blocked (one-to-one chats)
 *   chatInbox/{uid}/chats/{cid}.muted   no notifications / badge for that chat
 * Phase 2b:
 *   chatInbox/{uid}/chats/{cid}.clearedAt "Delete chat" for me: older messages hidden for me only
 *   chatTeamInvites/{uid}/pending/{cid} { cid, teamName, from, fromUsername, createdAt } team invite waiting for me
 *   conversations/{cid}/invited/{uid}   { uid, invitedBy, createdAt } pending invites, seen by the team
 * Files are uploaded and downloaded through the uploadChatFile / downloadChatFile
 * functions (membership, block, type and size checked on the server; no public links).
 */
import {
  collection, doc, getDoc, getDocs, onSnapshot, query, where, orderBy, limit,
  writeBatch, serverTimestamp, updateDoc, addDoc,
} from 'firebase/firestore';
import app, { db, auth, firebaseConfig, USE_EMULATORS } from '../../firebase';

export const MAX_MESSAGE_LENGTH = 4000;
export const MAX_TEAM_MEMBERS = 50;
export const MAX_FILE_BYTES = 25 * 1024 * 1024;
const MAX_LINKS_PER_MESSAGE = 5;

/** Allowed attachments: extension -> kind (same list as the server). */
export const FILE_KINDS = {
  pdf: 'file', doc: 'file', docx: 'file', xls: 'file', xlsx: 'file', ppt: 'file', pptx: 'file',
  jpg: 'image', jpeg: 'image', png: 'image', webp: 'image',
};
export const FILE_ACCEPT = Object.keys(FILE_KINDS).map((e) => `.${e}`).join(',');
const MIME = {
  pdf: 'application/pdf', doc: 'application/msword', xls: 'application/vnd.ms-excel', ppt: 'application/vnd.ms-powerpoint',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp',
};

export function fileExtension(name) {
  const n = String(name || '');
  return n.includes('.') ? n.split('.').pop().toLowerCase() : '';
}

/** A reason this file can't be sent, or '' (the server checks again, including content). */
export function fileProblem(name, size) {
  if (!FILE_KINDS[fileExtension(name)]) return 'Only Word, Excel, PowerPoint, PDF and images (JPG, PNG, WEBP) can be sent.';
  if (!size) return 'The file is empty.';
  if (size > MAX_FILE_BYTES) return 'Files can be at most 25 MB.';
  return '';
}

export function formatBytes(n) {
  if (!n) return '0 KB';
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

let functionsBase = USE_EMULATORS
  ? 'http://127.0.0.1:5001/demo-katuro/us-central1'
  : `https://us-central1-${firebaseConfig?.projectId || 'katuro-ai'}.cloudfunctions.net`;
/** Tests point this at the functions emulator. */
export function setChatFunctionsBase(url) {
  functionsBase = url;
}

const URL_RE = /\bhttps?:\/\/[^\s<>"']+[^\s<>"'.,;:!?)\]]/gi;

/** http(s) links in a message (deduplicated, at most 5). */
export function extractLinks(text) {
  // Phones often capitalise "Https://"; links are saved with a lowercase scheme.
  const found = (String(text || '').match(URL_RE) || []).map((u) => u.replace(/^https?/i, (s) => s.toLowerCase()));
  return [...new Set(found)].slice(0, MAX_LINKS_PER_MESSAGE);
}

export function linkDomain(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}
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

/**
 * Teachers whose @username matches (most likely first, typos included: "ban" → @ben).
 * Each result: { uid, username, displayName, school, photoURL, score, state } where state is
 * 'none' | 'invited' (I asked) | 'invited_me' (they asked) | 'contact'.
 */
export async function searchTeachers(query) {
  const q = searchKey(query);
  if (q.length < SEARCH_MIN_CHARS) return { query: q, results: [], tooShort: true };
  return callFunction('searchTeachers', { q });
}

export const SEARCH_MIN_CHARS = 3;

/** What the server searches for (same cleaning as functions/chatSearch.js normalizeQuery). */
export function searchKey(value) {
  return String(value || '').trim().toLowerCase().replace(/^@+/, '').replace(/[^a-z0-9._]/g, '').slice(0, 30);
}

/** Invites a teacher to connect. Returns the new state ('invited', or the existing one). */
export async function sendInvite(uid) {
  const res = await callFunction('sendChatInvite', { uid });
  return res?.state || 'invited';
}

/** Accept (→ 'contact') or decline (→ 'declined') an invite from `fromUid`. */
export async function respondInvite(fromUid, accept) {
  const res = await callFunction('respondChatInvite', { from: fromUid, accept: accept === true });
  return res?.state || (accept ? 'contact' : 'declined');
}

/** Invites waiting for my answer, newest first. */
export function subscribeIncomingInvites(uid, cb, onError) {
  return onSnapshot(
    query(collection(db, 'chatInvites'), where('to', '==', uid), where('status', '==', 'pending'), limit(100)),
    (snap) => {
      const ms = (t) => (t?.toMillis ? t.toMillis() : 0);
      cb(snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => ms(b.createdAt) - ms(a.createdAt)));
    },
    onError,
  );
}

/** My contacts (teachers I can message and add to teams), as directory cards sorted by username. */
export async function listContacts(uid) {
  const snap = await getDocs(query(collection(db, 'chatContacts', uid, 'list'), limit(500)));
  const cards = await Promise.all(snap.docs.map((d) => getDirectoryCard(d.id)));
  return cards.filter(Boolean).sort((a, b) => String(a.username || '').localeCompare(String(b.username || '')));
}

export function directChatId(a, b) {
  const [x, y] = [a, b].sort();
  return `dm_${x}_${y}`;
}

/** Opens (or creates) the one-to-one chat with another teacher. Returns the chat id. */
export async function openDirectChat(me, otherUid) {
  const cid = directChatId(me.uid, otherUid);
  const inboxRef = doc(db, 'chatInbox', me.uid, 'chats', cid);
  const mine = await getDoc(inboxRef);
  if (mine.exists()) return cid;
  const members = [me.uid, otherUid].sort();
  const batch = writeBatch(db);
  batch.set(doc(db, 'conversations', cid), { type: 'dm', members, createdBy: me.uid, createdAt: serverTimestamp(), lastMessage: null, lastMessageAt: null });
  for (const uid of members) {
    batch.set(doc(db, 'conversations', cid, 'chatMembers', uid), { uid, role: 'member', addedBy: me.uid, joinedAt: serverTimestamp() });
    batch.set(doc(db, 'chatInbox', uid, 'chats', cid), { cid, type: 'dm', addedAt: serverTimestamp(), lastReadAt: null });
  }
  try {
    await batch.commit();
  } catch (err) {
    // The other teacher opened the same new chat a moment earlier: just open it.
    if (err?.code === 'permission-denied' && (await getDoc(inboxRef).catch(() => null))?.exists()) return cid;
    throw err;
  }
  return cid;
}

/**
 * Invites one of my contacts to a team (team admins only). They join only when they
 * accept; until then the team sees them as "invited".
 */
export async function inviteToTeam(me, cid, teamName, uid) {
  const batch = writeBatch(db);
  batch.set(doc(db, 'chatTeamInvites', uid, 'pending', cid), { cid, teamName, from: me.uid, fromUsername: me.username, createdAt: serverTimestamp() });
  batch.set(doc(db, 'conversations', cid, 'invited', uid), { uid, invitedBy: me.uid, createdAt: serverTimestamp() });
  await batch.commit();
}

/** A team admin takes back an invite that was not answered yet. */
export async function cancelTeamInvite(cid, uid) {
  const batch = writeBatch(db);
  batch.delete(doc(db, 'chatTeamInvites', uid, 'pending', cid));
  batch.delete(doc(db, 'conversations', cid, 'invited', uid));
  await batch.commit();
}

/** I accept a team invite: I join as a member and the chat appears in my list. */
export async function acceptTeamInvite(me, cid) {
  const batch = writeBatch(db);
  batch.set(doc(db, 'conversations', cid, 'chatMembers', me.uid), { uid: me.uid, role: 'member', addedBy: me.uid, joinedAt: serverTimestamp() });
  batch.set(doc(db, 'chatInbox', me.uid, 'chats', cid), { cid, type: 'team', addedAt: serverTimestamp(), lastReadAt: null });
  batch.delete(doc(db, 'chatTeamInvites', me.uid, 'pending', cid));
  batch.delete(doc(db, 'conversations', cid, 'invited', me.uid));
  await batch.commit();
}

export async function declineTeamInvite(myUid, cid) {
  const batch = writeBatch(db);
  batch.delete(doc(db, 'chatTeamInvites', myUid, 'pending', cid));
  batch.delete(doc(db, 'conversations', cid, 'invited', myUid));
  await batch.commit();
}

/** Team invites waiting for my answer, newest first. */
export function subscribeTeamInvites(uid, cb, onError) {
  return onSnapshot(collection(db, 'chatTeamInvites', uid, 'pending'), (snap) => {
    cb(snap.docs.map((d) => ({ id: d.id, kind: 'team', ...d.data({ serverTimestamps: 'estimate' }) })).sort((a, b) => ms(b.createdAt) - ms(a.createdAt)));
  }, onError);
}

/** Teachers invited to a team who have not answered yet. */
export function subscribeTeamInvited(cid, cb, onError) {
  return onSnapshot(collection(db, 'conversations', cid, 'invited'), (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...d.data() }))), onError);
}

/**
 * Creates a team with me as its admin, then invites each teacher (one small write
 * each, so one refused invite never blocks the others). Returns { cid, failed: [uid] }.
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
      await inviteToTeam(me, ref.id, title, uid);
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

/** The latest `count` messages, oldest first (only those after `sinceMs`: "Delete chat"). */
export function subscribeMessages(cid, count, cb, onError, sinceMs = 0) {
  const after = sinceMs ? [where('createdAt', '>', new Date(sinceMs))] : [];
  return onSnapshot(query(collection(db, 'conversations', cid, 'messages'), ...after, orderBy('createdAt', 'desc'), limit(count)),
    (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...d.data({ serverTimestamps: 'estimate' }) })).reverse(), snap.size >= count),
    (err) => onError?.(err));
}

export async function sendMessage(cid, me, rawText) {
  const text = String(rawText || '').replace(/\r\n/g, '\n').trim();
  if (!text) return;
  if (text.length > MAX_MESSAGE_LENGTH) throw new Error(`Messages can be at most ${MAX_MESSAGE_LENGTH} characters.`);
  const batch = writeBatch(db);
  const msgRef = doc(collection(db, 'conversations', cid, 'messages'));
  batch.set(msgRef, { senderUid: me.uid, senderName: me.displayName, text, createdAt: serverTimestamp() });
  for (const url of extractLinks(text)) {
    if (url.length > 2000) continue;
    batch.set(doc(collection(db, 'conversations', cid, 'links')), {
      url, domain: linkDomain(url).slice(0, 255), messageId: msgRef.id, senderUid: me.uid, senderName: me.displayName, createdAt: serverTimestamp(),
    });
  }
  batch.update(doc(db, 'conversations', cid), {
    lastMessage: { text: text.slice(0, 140), senderUid: me.uid, senderName: me.displayName },
    lastMessageAt: serverTimestamp(),
  });
  await batch.commit();
}

export async function markRead(uid, cid) {
  await updateDoc(doc(db, 'chatInbox', uid, 'chats', cid), { lastReadAt: serverTimestamp() });
}

/** Deletes my message, its file and its Media/Files/Links entries (the admin may delete any). */
export async function deleteMyMessage(cid, messageId) {
  await callFunction('deleteChatMessage', { cid, messageId });
}

export async function reportMessage(cid, message, me, reason) {
  await addDoc(collection(db, 'chatReports'), {
    cid,
    messageId: message.id,
    reporterUid: me.uid,
    reason: String(reason || '').trim().slice(0, 500),
    messageText: String(message.text || (message.attachment ? `[${message.attachment.kind === 'image' ? 'Photo' : 'File'}] ${message.attachment.name}` : '')).slice(0, 1000),
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
  return ms(conversation.lastMessageAt) > Math.max(ms(inboxItem?.lastReadAt), ms(inboxItem?.clearedAt));
}

/** A chat I deleted stays out of my list until someone writes again. */
export function isClearedChat(inboxItem, conversation) {
  const cleared = ms(inboxItem?.clearedAt);
  return cleared > 0 && ms(conversation?.lastMessageAt) <= cleared;
}

// ── Phase 2: files, media, links, block, mute, divisions ─────────────────────

async function idToken() {
  const user = auth.currentUser;
  if (!user) throw new Error('Please sign in again.');
  return user.getIdToken();
}

/**
 * Sends a file to a chat. `file` is a File/Blob with a name, or { name, bytes }.
 * Returns { promise, cancel }; onProgress(0..1) while uploading (browser only).
 */
export function uploadChatFile(cid, file, onProgress) {
  const name = file.name;
  const body = file instanceof Blob ? file : new Blob([file.bytes], { type: MIME[fileExtension(name)] || 'application/octet-stream' });
  const problem = fileProblem(name, body.size);
  if (problem) return { promise: Promise.reject(new Error(problem)), cancel: () => {} };
  let xhr = null;
  let aborted = false;
  const promise = (async () => {
    const token = await idToken();
    const url = `${functionsBase}/uploadChatFile`;
    const headers = {
      Authorization: `Bearer ${token}`,
      'Content-Type': MIME[fileExtension(name)] || 'application/octet-stream',
      'X-Chat-Id': cid,
      'X-File-Name': encodeURIComponent(name),
    };
    if (typeof XMLHttpRequest === 'undefined') { // Node (tests): no progress events
      const res = await fetch(url, { method: 'POST', headers, body });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Upload failed. Please try again.');
      return data;
    }
    return new Promise((resolve, reject) => {
      if (aborted) { reject(Object.assign(new Error('Upload cancelled.'), { cancelled: true })); return; }
      xhr = new XMLHttpRequest();
      xhr.open('POST', url);
      Object.entries(headers).forEach(([k, v]) => xhr.setRequestHeader(k, v));
      xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress?.(e.loaded / e.total); };
      xhr.onload = () => {
        let data;
        try { data = JSON.parse(xhr.responseText || '{}'); } catch { data = {}; }
        if (xhr.status >= 200 && xhr.status < 300) resolve(data);
        else reject(new Error(data.error || 'Upload failed. Please try again.'));
      };
      xhr.onerror = () => reject(new Error('Upload failed. Check your connection and try again.'));
      xhr.onabort = () => reject(Object.assign(new Error('Upload cancelled.'), { cancelled: true }));
      xhr.send(body);
    });
  })();
  return { promise, cancel: () => { aborted = true; xhr?.abort(); } };
}

// Images shown in the chat, least recently used first out; bounded by total size.
const blobCache = new Map(); // assetId -> Blob
const CACHE_MAX_BYTES = 80 * 1024 * 1024;
const CACHE_MAX_ITEM = 5 * 1024 * 1024;
let cacheBytes = 0;

function cacheImage(assetId, blob) {
  if (blob.size > CACHE_MAX_ITEM) return;
  blobCache.set(assetId, blob);
  cacheBytes += blob.size;
  for (const [key, b] of blobCache) {
    if (cacheBytes <= CACHE_MAX_BYTES) break;
    blobCache.delete(key);
    cacheBytes -= b.size;
  }
}

/** Forget cached images (on sign-out). */
export function clearFileCache() {
  blobCache.clear();
  cacheBytes = 0;
}

/** Fetches a shared file through the server (members / admin only). */
export async function fetchChatFile(cid, attachment, { download = false } = {}) {
  if (!download && blobCache.has(attachment.assetId)) {
    const hit = blobCache.get(attachment.assetId);
    blobCache.delete(attachment.assetId); // refresh its place (most recently used)
    blobCache.set(attachment.assetId, hit);
    return hit;
  }
  const token = await idToken();
  const res = await fetch(`${functionsBase}/downloadChatFile?cid=${encodeURIComponent(cid)}&asset=${encodeURIComponent(attachment.assetId)}${download ? '&download=1' : ''}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Could not open the file.');
  }
  const blob = await res.blob();
  if (attachment.kind === 'image' && !blobCache.has(attachment.assetId)) cacheImage(attachment.assetId, blob);
  return blob;
}

/** Saves a blob through the browser's download. */
export function saveBlobAs(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

/** Media ('media'), files ('files') or links ('links') of a chat, newest first. */
export function subscribeAssets(cid, kind, count, cb, onError, sinceMs = 0) {
  const after = sinceMs ? [where('createdAt', '>', new Date(sinceMs))] : [];
  return onSnapshot(query(collection(db, 'conversations', cid, kind), ...after, orderBy('createdAt', 'desc'), limit(count)),
    (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...d.data({ serverTimestamps: 'estimate' }) })), snap.size >= count),
    (err) => onError?.(err));
}

export function subscribeBlocks(uid, cb) {
  return onSnapshot(collection(db, 'chatBlocks', uid, 'blocked'), (snap) => cb(new Set(snap.docs.map((d) => d.id))), () => cb(new Set()));
}

/** Block: their pending invite to me is declined too (best effort), so it leaves the bell. */
export async function blockTeacher(myUid, otherUid) {
  respondInvite(otherUid, false).catch(() => {});
  const { setDoc } = await import('firebase/firestore');
  await setDoc(doc(db, 'chatBlocks', myUid, 'blocked', otherUid), { blockedAt: serverTimestamp() });
}

export async function unblockTeacher(myUid, otherUid) {
  const { deleteDoc } = await import('firebase/firestore');
  await deleteDoc(doc(db, 'chatBlocks', myUid, 'blocked', otherUid));
}

/**
 * "Delete chat" for me: the chat leaves my list and its messages so far are hidden
 * for me only (the other teachers keep theirs). It comes back with the next message.
 */
export async function deleteChatForMe(uid, cid) {
  await updateDoc(doc(db, 'chatInbox', uid, 'chats', cid), { clearedAt: serverTimestamp() });
}

export async function setChatMuted(uid, cid, muted) {
  await updateDoc(doc(db, 'chatInbox', uid, 'chats', cid), { muted: Boolean(muted) });
}

let divisionsPromise = null;
/** Division names teachers already use (for the profile's Division field). */
export function listDivisions() {
  if (!divisionsPromise) {
    divisionsPromise = callFunction('listDivisions').then((r) => r?.divisions || []).catch(() => {
      divisionsPromise = null;
      return [];
    });
  }
  return divisionsPromise;
}
