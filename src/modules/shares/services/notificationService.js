import {
  collection, doc, addDoc, updateDoc, getDocs,
  query, onSnapshot, orderBy, limit, serverTimestamp, where, writeBatch,
} from 'firebase/firestore';
import { db } from '../../../firebase';

/**
 * Write a notification to a target user's inbox.
 * @param {string} targetUid
 * @param {object} payload — { type, fromUid, fromName, postId? }
 */
async function writeNotification(targetUid, payload) {
  await addDoc(collection(db, 'shares_notifications', targetUid, 'items'), {
    ...payload,
    read: false,
    createdAt: serverTimestamp(),
  });
}

/** Notify a user that someone followed them. */
export async function notifyFollow(fromUid, fromName, targetUid) {
  if (fromUid === targetUid) return;
  await writeNotification(targetUid, { type: 'follow', fromUid, fromName });
}

/** Notify post author of a reaction. */
export async function notifyReaction(fromUid, fromName, postId, postAuthorUid, reactionType) {
  if (fromUid === postAuthorUid) return;
  await writeNotification(postAuthorUid, { type: 'reaction', fromUid, fromName, postId, reactionType });
}

/** Notify post author of a new comment. */
export async function notifyComment(fromUid, fromName, postId, postAuthorUid) {
  if (fromUid === postAuthorUid) return;
  await writeNotification(postAuthorUid, { type: 'comment', fromUid, fromName, postId });
}

/** Notify comment author of a reply. */
export async function notifyReply(fromUid, fromName, postId, commentAuthorUid) {
  if (fromUid === commentAuthorUid) return;
  await writeNotification(commentAuthorUid, { type: 'reply', fromUid, fromName, postId });
}

/** Real-time subscription to a user's notifications (latest 30). */
export function subscribeToNotifications(uid, cb) {
  return onSnapshot(
    query(
      collection(db, 'shares_notifications', uid, 'items'),
      orderBy('createdAt', 'desc'),
      limit(30)
    ),
    snap => cb(snap.docs.map(d => ({ id: d.id, ...d.data() })))
  );
}

/** Mark a single notification as read. */
export async function markNotificationRead(uid, notifId) {
  await updateDoc(doc(db, 'shares_notifications', uid, 'items', notifId), { read: true });
}

/** Mark all unread notifications as read in a batch. */
export async function markAllNotificationsRead(uid) {
  const snap = await getDocs(
    query(
      collection(db, 'shares_notifications', uid, 'items'),
      where('read', '==', false)
    )
  );
  if (snap.empty) return;
  const batch = writeBatch(db);
  snap.docs.forEach(d => batch.update(d.ref, { read: true }));
  await batch.commit();
}
