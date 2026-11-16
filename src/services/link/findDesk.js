/**
 * findDesk.js — when the laptop got a new Wi-Fi address, the phone finds KaTuroDesk again.
 * KaTuroDesk publishes ONLY its link addresses for the signed-in teacher at
 * teachers/{uid}/linkDesks/{deskId} (no learner data); the phone reads it with the same account.
 */

import { MAX_HOSTS } from './linkClient.js';

// The phone and KaTuroDesk talk on the same Wi-Fi / hotspot only: private IPv4 addresses.
const PRIVATE_IP = /^(10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})$/;

/** The saved link + what KaTuroDesk published → the link with the new addresses first, or null when nothing is new. */
export function withPublishedAddresses(link, published) {
  if (!link || !published || published.deskId !== link.deskId) return null;
  const addresses = (Array.isArray(published.addresses) ? published.addresses : []).map(String).filter((a) => PRIVATE_IP.test(a));
  const port = Number(published.port);
  if (!addresses.length || !(port > 0 && port < 65536)) return null;
  const hosts = [...new Set([...addresses, ...link.hosts])].slice(0, MAX_HOSTS);
  if (hosts.join() === link.hosts.join() && port === link.port) return null;
  return { ...link, hosts, port };
}

/** KaTuroDesk's latest published addresses for this teacher, or null. */
export async function publishedDesk(uid, deskId) {
  if (!uid || !deskId) return null;
  try {
    const [{ doc, getDoc }, { db }] = await Promise.all([import('firebase/firestore'), import('../../firebase')]);
    const snap = await getDoc(doc(db, 'teachers', uid, 'linkDesks', deskId));
    return snap.exists() ? snap.data() : null;
  } catch {
    return null;
  }
}
