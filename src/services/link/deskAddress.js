/**
 * deskAddress.js — so a linked phone can find KaTuroDesk again after the computer gets a new
 * Wi-Fi address (another network, a new hotspot, the router restarted).
 *
 * KaTuroDesk saves ONLY where its phone link listens, for the signed-in teacher:
 *   teachers/{uid}/linkDesks/{deskId} = { deskId, deskName, addresses: [...], port, updatedAt }
 * No learner data, no keys: a phone still needs its own link key (from the QR code) to talk to it.
 * The phone reads this document by its link's deskId when the saved addresses fail.
 */

/** The link status (linkStatus / onLinkChanged) → what to publish, or null when there is nothing. */
export function deskAddressDoc(status) {
  if (!status?.running || !status.deskId || !status.port) return null;
  const addresses = [...new Set((status.addresses || []).map(String).filter(Boolean))];
  if (!addresses.length) return null;
  return { deskId: String(status.deskId), deskName: String(status.deskName || 'KaTuroDesk'), addresses, port: Number(status.port) };
}

/** A key that changes only when what a phone needs changes (so unchanged status writes nothing). */
export const deskAddressKey = (doc) => (doc ? `${doc.deskId}|${doc.deskName}|${doc.port}|${doc.addresses.join(',')}` : '');

/** Saves the document for the signed-in teacher (Firestore; the owner may write their own subcollections). */
export async function publishDeskAddress(uid, doc) {
  const [{ doc: ref, setDoc, serverTimestamp }, { db }] = await Promise.all([import('firebase/firestore'), import('../../firebase')]);
  await setDoc(ref(db, 'teachers', uid, 'linkDesks', doc.deskId), { ...doc, updatedAt: serverTimestamp() });
}
