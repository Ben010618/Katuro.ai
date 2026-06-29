import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';

export async function trackEvent(uid, feature, meta = {}) {
  if (!uid) return;
  try {
    await addDoc(collection(db, 'usageEvents'), {
      uid,
      feature,
      ts: serverTimestamp(),
      ...meta,
    });
  } catch (_) {
    // analytics must never surface errors to the user
  }
}
