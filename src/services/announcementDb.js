import { doc, onSnapshot, setDoc, updateDoc, getDoc, increment } from 'firebase/firestore';
import { db } from '../firebase';

/**
 * Admin broadcast announcement — a single active slot.
 *
 * There is exactly ONE announcement document. Publishing a new message
 * overwrites the previous one and bumps `version`; a teacher has seen the
 * current announcement when their own `announcementSeenVersion` has caught up
 * to it. That keeps "everyone sees it once" working without writing a fan-out
 * record per teacher — with 1000 accounts a per-user copy would be 1000 writes
 * per announcement, and would still need backfilling for accounts created
 * afterwards.
 *
 * A teacher who signs up later still sees the current announcement, because
 * their missing `announcementSeenVersion` reads as 0, which is always behind.
 *
 * Shape of adminConfig/announcement:
 *   { title, text, version, active, updatedAt, updatedBy }
 */

const ANNOUNCEMENT_REF = doc(db, 'adminConfig', 'announcement');

/** Live-subscribe to the current announcement. cb receives the doc data or null. */
export function subscribeAnnouncement(cb) {
  return onSnapshot(
    ANNOUNCEMENT_REF,
    (snap) => cb(snap.exists() ? snap.data() : null),
    // A read failure must not break the app shell the mascot lives in —
    // treat it as "no announcement" and carry on.
    () => cb(null),
  );
}

/**
 * True when this teacher has not yet dismissed the current announcement.
 * `seenVersion` comes from the teacher profile (undefined for a new account).
 */
export function isAnnouncementUnread(announcement, seenVersion) {
  if (!announcement?.active) return false;
  if (!announcement.text?.trim()) return false;
  return (announcement.version ?? 0) > (seenVersion ?? 0);
}

/** Admin-only: publish a new announcement, superseding whatever was there. */
export async function publishAnnouncement({ title = '', text, adminUid }) {
  const trimmed = (text || '').trim();
  if (!trimmed) throw new Error('Announcement text cannot be empty.');

  const snap    = await getDoc(ANNOUNCEMENT_REF);
  const exists  = snap.exists();

  const payload = {
    title:     (title || '').trim(),
    text:      trimmed,
    active:    true,
    updatedAt: new Date(),
    updatedBy: adminUid ?? null,
    // increment() only works on an existing field — seed it on first publish.
    version:   exists ? increment(1) : 1,
  };

  await setDoc(ANNOUNCEMENT_REF, payload, { merge: true });
}

/**
 * Admin-only: take the current announcement down.
 *
 * Deliberately does NOT bump the version. Retiring a notice is not a new
 * message, and bumping would re-alert every teacher who had already read it if
 * it were ever switched back on.
 */
export async function clearAnnouncement() {
  await setDoc(ANNOUNCEMENT_REF, { active: false }, { merge: true });
}

/** Mark the current announcement as read for this teacher. */
export async function markAnnouncementSeen(uid, version) {
  if (!uid) return;
  await updateDoc(doc(db, 'teachers', uid), {
    announcementSeenVersion: version ?? 0,
  });
}
