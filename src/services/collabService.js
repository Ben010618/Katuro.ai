import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { updateProfile } from 'firebase/auth';
import app, { db, auth } from '../firebase';

// ── Profile photo ─────────────────────────────────────────────────────────────

export async function uploadProfilePhoto(uid, file) {
  const { getStorage, ref, uploadBytes, getDownloadURL } = await import('firebase/storage');
  const storage = getStorage(app);
  const storageRef = ref(storage, `profilePhotos/${uid}/avatar.jpg`);
  const snap = await uploadBytes(storageRef, file, { contentType: file.type });
  const url  = await getDownloadURL(snap.ref);
  // Update all Firestore locations so every module sees the new photo immediately
  await updateDoc(doc(db, 'teachers', uid), { photoURL: url });
  await updateDoc(doc(db, 'shares_profiles', uid), { photoURL: url }).catch(() => {});
  if (auth.currentUser) {
    await updateProfile(auth.currentUser, { photoURL: url }).catch(() => {});
    await auth.currentUser.reload().catch(() => {});
  }
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

export async function getTeacherProfile(uid) {
  const snap = await getDoc(doc(db, 'teachers', uid));
  return snap.exists() ? { id: uid, ...snap.data() } : null;
}
