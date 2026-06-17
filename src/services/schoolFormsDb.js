import { doc, setDoc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';

const profileDoc = uid => doc(db, 'teachers', uid, 'settings', 'schoolProfile');

export function subscribeSchoolProfile(uid, cb) {
  return onSnapshot(profileDoc(uid), snap =>
    cb(snap.exists() ? snap.data() : {})
  );
}

export async function saveSchoolProfile(uid, data) {
  await setDoc(profileDoc(uid), { ...data }, { merge: true });
}
