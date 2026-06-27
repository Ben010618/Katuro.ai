import {
  collection, doc, addDoc, setDoc, getDoc, getDocs,
  query, orderBy, where, onSnapshot, serverTimestamp,
  updateDoc, arrayUnion, limit,
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { updateProfile } from 'firebase/auth';
import { db, storage, auth } from '../firebase';

export const COMMUNITY_ID = 'katuro-community';

// ── Community channel bootstrap ───────────────────────────────────────────────

export async function ensureCommunityChannel() {
  const snap = await getDoc(doc(db, 'collabChannels', COMMUNITY_ID));
  if (snap.exists()) return;
  await setDoc(doc(db, 'collabChannels', COMMUNITY_ID), {
    name: 'katuro-community',
    displayName: 'KaTuro Community',
    description: 'Official channel for all KaTuro teachers 🇵🇭',
    isPublic: true,
    createdBy: 'system',
    members: [],
    createdAt: serverTimestamp(),
    lastMessage: 'Welcome to KaTuro Community!',
    lastMessageAt: serverTimestamp(),
  });
  await addDoc(collection(db, 'collabChannels', COMMUNITY_ID, 'messages'), {
    uid: 'katuro-ai',
    displayName: 'KaTuro AI',
    photoURL: null,
    text: '👋 Welcome to **KaTuro Community** — the official space for all KaTuro teachers! Share ideas, ask questions, and collaborate with fellow educators. Type **@KaTuro** anywhere to ask me anything!',
    isAI: true,
    createdAt: serverTimestamp(),
  });
}

// ── Channels ──────────────────────────────────────────────────────────────────

export function subscribeToMyChannels(uid, cb) {
  const seen = new Map();
  const notify = () => cb(
    Array.from(seen.values()).sort((a, b) => a.name.localeCompare(b.name))
  );

  const unsubPublic = onSnapshot(
    query(collection(db, 'collabChannels'), where('isPublic', '==', true)),
    snap => { snap.docs.forEach(d => seen.set(d.id, { id: d.id, ...d.data() })); notify(); }
  );
  const unsubMember = onSnapshot(
    query(collection(db, 'collabChannels'), where('members', 'array-contains', uid)),
    snap => { snap.docs.forEach(d => seen.set(d.id, { id: d.id, ...d.data() })); notify(); }
  );
  return () => { unsubPublic(); unsubMember(); };
}

export function subscribeToChannelMessages(channelId, cb) {
  return onSnapshot(
    query(collection(db, 'collabChannels', channelId, 'messages'), orderBy('createdAt', 'asc'), limit(200)),
    snap => cb(snap.docs.map(d => ({ id: d.id, ...d.data() })))
  );
}

export async function sendChannelMessage(channelId, { uid, displayName, photoURL, text }) {
  await addDoc(collection(db, 'collabChannels', channelId, 'messages'), {
    uid, displayName, photoURL: photoURL || null, text, isAI: false,
    createdAt: serverTimestamp(),
  });
  await updateDoc(doc(db, 'collabChannels', channelId), {
    lastMessage: text.slice(0, 80),
    lastMessageAt: serverTimestamp(),
  }).catch(() => {});
}

export async function createChannel(uid, { name, description }) {
  const inviteCode = Math.random().toString(36).slice(2, 10).toUpperCase();
  const cleanName  = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
  const ref = await addDoc(collection(db, 'collabChannels'), {
    name: cleanName,
    displayName: name,
    description: description || '',
    isPublic: false,
    inviteCode,
    createdBy: uid,
    members: [uid],
    createdAt: serverTimestamp(),
    lastMessage: 'Channel created',
    lastMessageAt: serverTimestamp(),
  });
  return { id: ref.id, inviteCode };
}

export async function joinByInviteCode(uid, code) {
  const snap = await getDocs(
    query(collection(db, 'collabChannels'), where('inviteCode', '==', code.trim().toUpperCase()))
  );
  if (snap.empty) throw new Error('Invalid invite code. Check and try again.');
  const ch = snap.docs[0];
  await updateDoc(ch.ref, { members: arrayUnion(uid) });
  return { id: ch.id, ...ch.data() };
}

// ── Direct Messages ───────────────────────────────────────────────────────────

export const dmId = (a, b) => [a, b].sort().join('__');

export async function openOrCreateDM(myUid, theirUid, myInfo, theirInfo) {
  const id  = dmId(myUid, theirUid);
  const ref = doc(db, 'collabDMs', id);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    await setDoc(ref, {
      participants: [myUid, theirUid].sort(),
      participantInfo: {
        [myUid]:   { name: myInfo.name,   photoURL: myInfo.photoURL   || null },
        [theirUid]:{ name: theirInfo.name, photoURL: theirInfo.photoURL || null },
      },
      lastMessage: '', lastMessageAt: serverTimestamp(), createdAt: serverTimestamp(),
    });
  }
  return id;
}

export function subscribeToMyDMs(uid, cb) {
  // No orderBy — array-contains + orderBy on a different field needs a composite index.
  // Sort client-side instead.
  return onSnapshot(
    query(collection(db, 'collabDMs'), where('participants', 'array-contains', uid)),
    snap => cb(
      snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (b.lastMessageAt?.toMillis?.() ?? 0) - (a.lastMessageAt?.toMillis?.() ?? 0))
    )
  );
}

export function subscribeToDMMessages(id, cb) {
  return onSnapshot(
    query(collection(db, 'collabDMs', id, 'messages'), orderBy('createdAt', 'asc'), limit(200)),
    snap => cb(snap.docs.map(d => ({ id: d.id, ...d.data() })))
  );
}

export async function sendDM(id, { uid, displayName, photoURL, text }) {
  await addDoc(collection(db, 'collabDMs', id, 'messages'), {
    uid, displayName, photoURL: photoURL || null, text,
    createdAt: serverTimestamp(),
  });
  await updateDoc(doc(db, 'collabDMs', id), {
    lastMessage: text.slice(0, 80),
    lastMessageAt: serverTimestamp(),
    lastSenderUid: uid,
  }).catch(() => {});
}

// ── Unread tracking (localStorage) ───────────────────────────────────────────

export function markConversationRead(id) {
  try {
    const reads = JSON.parse(localStorage.getItem('collabReads') || '{}');
    reads[id] = Date.now();
    localStorage.setItem('collabReads', JSON.stringify(reads));
  } catch (_) {}
}

export function subscribeToCollabUnread(uid, cb) {
  return onSnapshot(
    query(collection(db, 'collabDMs'), where('participants', 'array-contains', uid)),
    snap => {
      try {
        const reads = JSON.parse(localStorage.getItem('collabReads') || '{}');
        const count = snap.docs.filter(d => {
          const data = d.data();
          if (!data.lastMessageAt || !data.lastMessage) return false;
          if (data.lastSenderUid === uid) return false;
          return (data.lastMessageAt?.toMillis?.() ?? 0) > (reads[d.id] ?? 0);
        }).length;
        cb(count);
      } catch (_) { cb(0); }
    }
  );
}

// ── Profile photo ─────────────────────────────────────────────────────────────

export async function uploadProfilePhoto(uid, file) {
  const storageRef = ref(storage, `profilePhotos/${uid}/avatar.jpg`);
  const snap = await uploadBytes(storageRef, file, { contentType: file.type });
  const url  = await getDownloadURL(snap.ref);
  await updateDoc(doc(db, 'teachers', uid), { photoURL: url });
  if (auth.currentUser) await updateProfile(auth.currentUser, { photoURL: url }).catch(() => {});
  return url;
}

// ── Status ────────────────────────────────────────────────────────────────────

export const STATUSES = [
  { key: 'online',   label: 'Online',   color: '#23a55a' },
  { key: 'teaching', label: 'Teaching', color: '#f0b429' },
  { key: 'offline',  label: 'Offline',  color: '#80848e' },
];

export async function setStatus(uid, status) {
  await updateDoc(doc(db, 'teachers', uid), { status }).catch(() => {});
}

// ── All teachers (DM picker) ──────────────────────────────────────────────────

export async function fetchAllTeachers() {
  const snap = await getDocs(collection(db, 'teachers'));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}
