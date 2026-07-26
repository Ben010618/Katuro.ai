// CRUD for referral_contacts — the school's real contact info for each
// BrainBank Part M office (constants/referralOffices.js has the static list).

import { collection, doc, setDoc, onSnapshot, serverTimestamp } from 'firebase/firestore';
import { db } from '../../../firebase';

/** Real-time subscription; resolves to a map of officeId -> saved contact fields. */
export function subscribeReferralContacts(onData, onError) {
  return onSnapshot(
    collection(db, 'referral_contacts'),
    (snap) => {
      const byOfficeId = {};
      snap.docs.forEach((d) => { byOfficeId[d.id] = d.data(); });
      onData(byOfficeId);
    },
    onError,
  );
}

export async function saveReferralContact(officeId, { contactName, contactNumber, contactEmail }) {
  await setDoc(doc(db, 'referral_contacts', officeId), {
    contactName: contactName || '',
    contactNumber: contactNumber || '',
    contactEmail: contactEmail || '',
    updatedAt: serverTimestamp(),
  }, { merge: true });
}
