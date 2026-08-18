import {
  collection, doc, addDoc, setDoc, getDoc, getDocs,
  query, orderBy, where, onSnapshot, serverTimestamp,
  updateDoc, deleteDoc, arrayUnion, limit, startAfter,
  increment, runTransaction,
} from 'firebase/firestore';
import { db } from '../../../firebase';

/** Extract lowercase hashtags from caption text. */
export function extractHashtags(caption) {
  const matches = caption.match(/#(\w+)/g) || [];
  return [...new Set(matches.map(t => t.slice(1).toLowerCase()))];
}

/** Compute display initials from a full name. */
export function getInitials(name = '') {
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || 'T';
}

/** Relative time string from a Firestore Timestamp. */
export function timeAgo(ts) {
  if (!ts?.toMillis) return '';
  const s = Math.floor((Date.now() - ts.toMillis()) / 1000);
  if (s < 60)  return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60)  return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24)  return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7)   return `${d}d`;
  const w = Math.floor(d / 7);
  if (w < 5)   return `${w}w`;
  return ts.toDate().toLocaleDateString('en-PH', { month: 'short', day: 'numeric' });
}

/** Deterministic avatar color from uid. */
const AVATAR_COLORS = ['#534AB7','#1D9E75','#E05C2D','#C2185B','#1565C0','#558B2F'];
export function avatarColor(uid = '') {
  const hash = uid.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

// ── Profile ───────────────────────────────────────────────────────────────────

/**
 * Ensure a shares_profile document exists for the user, creating it on first
 * visit. Identity fields (name/initials/photo) are re-synced from the source
 * of truth — the teacher's main account profile — on every call, so kaTuro
 * Shares always reflects the photo uploaded at registration/AppShell without
 * needing its own separate profile-editing UI.
 */
export async function ensureSharesProfile(uid, { displayName, email, photoURL = null, school = '', gradeLevel = '', subject = '' }) {
  const ref = doc(db, 'shares_profiles', uid);
  const snap = await getDoc(ref);
  const identity = {
    displayName: displayName || email?.split('@')[0] || 'Teacher',
    initials: getInitials(displayName),
    photoURL,
  };
  if (snap.exists()) {
    await setDoc(ref, identity, { merge: true });
    return { id: uid, ...snap.data(), ...identity };
  }
  const profile = {
    ...identity,
    school, gradeLevel, subject,
    followerCount: 0, followingCount: 0, postCount: 0,
    createdAt: serverTimestamp(),
  };
  await setDoc(ref, profile);
  return { id: uid, ...profile };
}

/** Fetch a single shares_profile. */
export async function getSharesProfile(uid) {
  const snap = await getDoc(doc(db, 'shares_profiles', uid));
  return snap.exists() ? { id: uid, ...snap.data() } : null;
}

// ── Posts ─────────────────────────────────────────────────────────────────────

/** Create a new photo post. Returns the new document ID. */
export async function createPost(uid, { photoUrls, title, caption, school, gradeLevel, subject, authorName, authorInitials, authorPhotoURL }) {
  const hashtags = extractHashtags(caption);
  const ref = await addDoc(collection(db, 'shares_posts'), {
    authorUid: uid,
    authorName: authorName || '',
    authorInitials: authorInitials || '',
    authorPhotoURL: authorPhotoURL || null,
    photoUrls,
    title: title || '',
    caption,
    hashtags,
    school, gradeLevel, subject,
    reactions: { love: 0, clap: 0, star: 0, insight: 0 },
    commentCount: 0,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  await updateDoc(doc(db, 'shares_profiles', uid), { postCount: increment(1) });
  return ref.id;
}

/** Delete a post (author or admin). */
export async function deletePost(postId, authorUid) {
  await deleteDoc(doc(db, 'shares_posts', postId));
  if (authorUid) {
    try {
      await updateDoc(doc(db, 'shares_profiles', authorUid), { postCount: increment(-1) });
    } catch (err) {
      console.warn('Could not decrement author postCount:', err);
    }
  }
}

/** Edit a post's title/caption (author only — enforced by firestore.rules). */
export async function editPost(postId, { title, caption }) {
  const hashtags = extractHashtags(caption);
  await updateDoc(doc(db, 'shares_posts', postId), {
    title: title || '', caption, hashtags,
    editedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

/** Fetch a single post by ID (used by the shareable single-post view). */
export async function getPost(postId) {
  const snap = await getDoc(doc(db, 'shares_posts', postId));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

/** Fetch paginated global feed (all teachers). Returns { posts, lastDoc }. */
export async function fetchFeedPage(lastDoc = null, pageSize = 10) {
  const constraints = [orderBy('createdAt', 'desc'), limit(pageSize)];
  if (lastDoc) constraints.push(startAfter(lastDoc));
  const snap = await getDocs(query(collection(db, 'shares_posts'), ...constraints));
  return {
    posts:   snap.docs.map(d => ({ id: d.id, ...d.data() })),
    lastDoc: snap.docs[snap.docs.length - 1] || null,
  };
}

/** Fetch paginated posts from teachers a user follows. */
export async function fetchFollowingFeedPage(uid, lastDoc = null, pageSize = 10) {
  const followSnap = await getDocs(collection(db, 'shares_follows', uid, 'following'));
  const followedUids = followSnap.docs.map(d => d.id);
  if (!followedUids.length) return { posts: [], lastDoc: null };
  const constraints = [
    where('authorUid', 'in', followedUids.slice(0, 10)),
    orderBy('createdAt', 'desc'),
    limit(pageSize),
  ];
  if (lastDoc) constraints.push(startAfter(lastDoc));
  const snap = await getDocs(query(collection(db, 'shares_posts'), ...constraints));
  return {
    posts:   snap.docs.map(d => ({ id: d.id, ...d.data() })),
    lastDoc: snap.docs[snap.docs.length - 1] || null,
  };
}

/** Fetch paginated posts by a specific author (profile grid). */
export async function fetchUserPostsPage(authorUid, lastDoc = null, pageSize = 12) {
  const constraints = [
    where('authorUid', '==', authorUid),
    orderBy('createdAt', 'desc'),
    limit(pageSize),
  ];
  if (lastDoc) constraints.push(startAfter(lastDoc));
  const snap = await getDocs(query(collection(db, 'shares_posts'), ...constraints));
  return {
    posts:   snap.docs.map(d => ({ id: d.id, ...d.data() })),
    lastDoc: snap.docs[snap.docs.length - 1] || null,
  };
}

/** Fetch paginated posts tagged with a given hashtag. */
export async function fetchHashtagPostsPage(hashtag, lastDoc = null, pageSize = 10) {
  const constraints = [
    where('hashtags', 'array-contains', hashtag.toLowerCase()),
    orderBy('createdAt', 'desc'),
    limit(pageSize),
  ];
  if (lastDoc) constraints.push(startAfter(lastDoc));
  const snap = await getDocs(query(collection(db, 'shares_posts'), ...constraints));
  return {
    posts:   snap.docs.map(d => ({ id: d.id, ...d.data() })),
    lastDoc: snap.docs[snap.docs.length - 1] || null,
  };
}

/** Fetch top 10 trending hashtags by post count this week. */
export async function fetchTrendingHashtags() {
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const snap = await getDocs(
    query(collection(db, 'shares_posts'),
      where('createdAt', '>=', weekAgo),
      orderBy('createdAt', 'desc'),
      limit(100)
    )
  );
  const counts = {};
  snap.docs.forEach(d => {
    (d.data().hashtags || []).forEach(tag => { counts[tag] = (counts[tag] || 0) + 1; });
  });
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([tag, count]) => ({ tag, count }));
}

/** Search teachers by displayName prefix. */
export async function searchTeachers(q) {
  if (!q.trim()) return [];
  const end = q + '';
  const snap = await getDocs(
    query(collection(db, 'shares_profiles'),
      where('displayName', '>=', q),
      where('displayName', '<=', end),
      limit(20)
    )
  );
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

/** Fetch teachers currently marked as online. */
export async function fetchOnlineTeachers(excludeUid, maxCount = 8) {
  const snap = await getDocs(
    query(collection(db, 'teachers'),
      where('status', '==', 'online'),
      limit(maxCount + 1)
    )
  );
  return snap.docs
    .filter(d => d.id !== excludeUid)
    .slice(0, maxCount)
    .map(d => ({ id: d.id, ...d.data() }));
}

/** Fetch teacher suggestions (same school or same grade). */
export async function fetchSuggestions(uid, school, gradeLevel) {
  if (!school && !gradeLevel) return [];
  const snap = await getDocs(
    query(collection(db, 'shares_profiles'),
      where('school', '==', school || '__none__'),
      limit(6)
    )
  );
  return snap.docs
    .filter(d => d.id !== uid)
    .map(d => ({ id: d.id, ...d.data() }))
    .slice(0, 4);
}

// ── Reactions ─────────────────────────────────────────────────────────────────

/** Get the current user's reaction on a post. */
export async function getMyReaction(postId, uid) {
  const snap = await getDoc(doc(db, 'shares_reactions', postId, 'userReactions', uid));
  return snap.exists() ? snap.data().type : null;
}

/** Everyone who reacted to a post — so the author (or anyone) can see who reacted, and with what. */
export async function getReactors(postId) {
  const snap = await getDocs(collection(db, 'shares_reactions', postId, 'userReactions'));
  return snap.docs
    .map(d => ({ uid: d.id, type: d.data().type, createdAt: d.data().createdAt }))
    .sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
}

/**
 * Toggle reaction. If same type → remove. If different → switch. If none → add.
 * Uses a transaction to keep reaction counts consistent.
 */
export async function toggleReaction(postId, uid, type) {
  const postRef      = doc(db, 'shares_posts', postId);
  const reactionRef  = doc(db, 'shares_reactions', postId, 'userReactions', uid);

  await runTransaction(db, async tx => {
    const reactionSnap = await tx.get(reactionRef);
    const existing     = reactionSnap.exists() ? reactionSnap.data().type : null;

    if (existing === type) {
      tx.delete(reactionRef);
      tx.update(postRef, { [`reactions.${type}`]: increment(-1) });
    } else {
      if (existing) tx.update(postRef, { [`reactions.${existing}`]: increment(-1) });
      tx.set(reactionRef, { type, createdAt: serverTimestamp() });
      tx.update(postRef, { [`reactions.${type}`]: increment(1) });
    }
  });
}

// ── Comments ──────────────────────────────────────────────────────────────────

/** Real-time comments subscription. Returns unsubscribe function. */
export function subscribeToComments(postId, cb) {
  return onSnapshot(
    query(
      collection(db, 'shares_posts', postId, 'comments'),
      orderBy('createdAt', 'asc'),
      limit(100)
    ),
    snap => cb(snap.docs.map(d => ({ id: d.id, ...d.data() })))
  );
}

/** Real-time replies subscription for a single comment. */
export function subscribeToReplies(postId, commentId, cb) {
  return onSnapshot(
    query(
      collection(db, 'shares_posts', postId, 'comments', commentId, 'replies'),
      orderBy('createdAt', 'asc'),
      limit(50)
    ),
    snap => cb(snap.docs.map(d => ({ id: d.id, ...d.data() })))
  );
}

/** Post a top-level comment. */
export async function addComment(postId, uid, { displayName, initials, photoURL, text }) {
  const ref = await addDoc(
    collection(db, 'shares_posts', postId, 'comments'),
    { authorUid: uid, authorName: displayName, authorInitials: initials, authorPhotoURL: photoURL || null, text, likes: 0, replyCount: 0, createdAt: serverTimestamp() }
  );
  await updateDoc(doc(db, 'shares_posts', postId), { commentCount: increment(1) });
  return ref.id;
}

/** Post a reply to a comment. */
export async function addReply(postId, commentId, uid, { displayName, initials, photoURL, text }) {
  await addDoc(
    collection(db, 'shares_posts', postId, 'comments', commentId, 'replies'),
    { authorUid: uid, authorName: displayName, authorInitials: initials, authorPhotoURL: photoURL || null, text, createdAt: serverTimestamp() }
  );
  await updateDoc(doc(db, 'shares_posts', postId, 'comments', commentId), { replyCount: increment(1) });
  await updateDoc(doc(db, 'shares_posts', postId), { commentCount: increment(1) });
}

/** Delete a comment (and decrement post count). */
export async function deleteComment(postId, commentId) {
  await deleteDoc(doc(db, 'shares_posts', postId, 'comments', commentId));
  await updateDoc(doc(db, 'shares_posts', postId), { commentCount: increment(-1) });
}

/** Delete a reply (and decrement comment replyCount and post commentCount). */
export async function deleteReply(postId, commentId, replyId) {
  await deleteDoc(doc(db, 'shares_posts', postId, 'comments', commentId, 'replies', replyId));
  await updateDoc(doc(db, 'shares_posts', postId, 'comments', commentId), { replyCount: increment(-1) });
  await updateDoc(doc(db, 'shares_posts', postId), { commentCount: increment(-1) });
}

/** Edit comment text. */
export async function editComment(postId, commentId, text) {
  await updateDoc(doc(db, 'shares_posts', postId, 'comments', commentId), { text, editedAt: serverTimestamp() });
}

// ── Follows ───────────────────────────────────────────────────────────────────

/** Check if uid follows targetUid. */
export async function isFollowing(uid, targetUid) {
  const snap = await getDoc(doc(db, 'shares_follows', uid, 'following', targetUid));
  return snap.exists();
}

/** Follow a teacher. Updates both sides and increments profile counters. */
export async function followTeacher(uid, targetUid) {
  await setDoc(doc(db, 'shares_follows', uid, 'following', targetUid), { createdAt: serverTimestamp() });
  await setDoc(doc(db, 'shares_follows', targetUid, 'followers', uid), { createdAt: serverTimestamp() });
  await updateDoc(doc(db, 'shares_profiles', uid),       { followingCount: increment(1) });
  await updateDoc(doc(db, 'shares_profiles', targetUid), { followerCount:  increment(1) });
}

/** Unfollow a teacher. Updates both sides and decrements profile counters. */
export async function unfollowTeacher(uid, targetUid) {
  await deleteDoc(doc(db, 'shares_follows', uid, 'following', targetUid));
  await deleteDoc(doc(db, 'shares_follows', targetUid, 'followers', uid));
  await updateDoc(doc(db, 'shares_profiles', uid),       { followingCount: increment(-1) });
  await updateDoc(doc(db, 'shares_profiles', targetUid), { followerCount:  increment(-1) });
}
