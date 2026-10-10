/**
 * accountPurge.js — removes a deleted account COMPLETELY: every document and file kaTuro
 * keeps for that teacher (see the map in this file), plus the login. Used by the admin
 * "Delete account", the nightly inactivity cleanup, "Delete all now", and the cleanup of
 * leftovers from accounts deleted before this existed.
 *
 * Shared places keep other people's data:
 *   - chats (1-on-1 and team): only the deleted teacher's messages, files, links and
 *     membership go; a conversation is removed only when nobody is left in it;
 *   - Shares: the teacher's posts go whole; their comments, replies, reactions and follows
 *     on other people's things go, and the counters there are corrected.
 * The audit log keeps the date, reason, account ID and a masked email only.
 */

const BATCH = 400;

/** "juan.cruz@deped.gov.ph" → "j***@deped.gov.ph" */
function maskEmail(email) {
  const s = String(email || '');
  const at = s.indexOf('@');
  if (at < 1) return s ? '***' : null;
  return `${s[0]}***${s.slice(at)}`;
}

async function deleteRefs(db, refs) {
  for (let i = 0; i < refs.length; i += BATCH) {
    const batch = db.batch();
    refs.slice(i, i + BATCH).forEach((r) => batch.delete(r));
    await batch.commit();
  }
  return refs.length;
}

/** Deletes every doc a query returns (with its subcollections when `deep`). */
async function deleteQuery(db, q, { deep = false } = {}) {
  const snap = await q.get();
  if (!deep) return deleteRefs(db, snap.docs.map((d) => d.ref));
  for (const d of snap.docs) await db.recursiveDelete(d.ref);
  return snap.docs.length;
}

const parentDocId = (ref) => ref.parent && ref.parent.parent ? ref.parent.parent.id : null;

/**
 * Removes everything of these accounts. accounts: [{ uid, teacher? }]
 * deps: { db, admin, bucket?, reason, deletedBy?, onPurged?(uid) }
 * → { purged: [uid], failed: [{ uid, error }], removed: { what: count } }
 */
async function purgeAccounts(accounts, { db, admin, bucket, reason, deletedBy = null, onPurged }) {
  const FV = admin.firestore.FieldValue;
  const uids = new Set(accounts.map((a) => a.uid).filter(Boolean));
  const removed = {};
  const add = (k, n) => { removed[k] = (removed[k] || 0) + (n || 0); };
  const purged = [];
  const failed = [];
  if (!uids.size) return { purged, failed, removed };

  // Places keyed only by the document ID under OTHER users: read once for all accounts.
  const reactionsSnap = await db.collectionGroup('userReactions').get();
  const blockedSnap = await db.collectionGroup('blocked').get();

  for (const { uid, teacher: given } of accounts) {
    try {
      const teacherSnap = await db.doc(`teachers/${uid}`).get();
      const t = given || (teacherSnap.exists ? teacherSnap.data() : {}) || {};

      // ── Shares ────────────────────────────────────────────────────────
      // Reactions on posts: lower the post's counter, then remove.
      for (const r of reactionsSnap.docs.filter((d) => d.id === uid)) {
        const postId = parentDocId(r.ref);
        const type = r.data() && r.data().type;
        if (postId && type) {
          const post = db.doc(`shares_posts/${postId}`);
          if ((await post.get()).exists) await post.update({ [`reactions.${type}`]: FV.increment(-1) });
        }
        await r.ref.delete();
        add('shareReactions', 1);
      }
      // Replies, then comments, on other people's posts (counters corrected).
      const replies = await db.collectionGroup('replies').where('authorUid', '==', uid).get();
      for (const rp of replies.docs) {
        const comment = rp.ref.parent.parent;
        const post = comment && comment.parent.parent;
        if (comment && (await comment.get()).exists) await comment.update({ replyCount: FV.increment(-1) });
        if (post && (await post.get()).exists) await post.update({ commentCount: FV.increment(-1) });
        await rp.ref.delete();
        add('shareReplies', 1);
      }
      const comments = await db.collectionGroup('comments').where('authorUid', '==', uid).get();
      for (const c of comments.docs) {
        const post = c.ref.parent.parent;
        const left = await c.ref.collection('replies').get();
        if (post && post.path.startsWith('shares_posts/') && (await post.get()).exists) {
          await post.update({ commentCount: FV.increment(-(1 + left.docs.length)) });
        }
        await db.recursiveDelete(c.ref);
        add('shareComments', 1);
      }
      // Their own posts, whole (with everyone's comments on them) and the posts' reactions.
      const posts = await db.collection('shares_posts').where('authorUid', '==', uid).get();
      for (const p of posts.docs) {
        await db.recursiveDelete(p.ref);
        await db.recursiveDelete(db.doc(`shares_reactions/${p.id}`));
        add('sharePosts', 1);
      }
      // Follows both ways, with the other people's counters.
      const following = await db.collection(`shares_follows/${uid}/following`).get();
      for (const f of following.docs) {
        await db.doc(`shares_follows/${f.id}/followers/${uid}`).delete();
        const prof = db.doc(`shares_profiles/${f.id}`);
        if ((await prof.get()).exists) await prof.update({ followerCount: FV.increment(-1) });
      }
      const followers = await db.collection(`shares_follows/${uid}/followers`).get();
      for (const f of followers.docs) {
        await db.doc(`shares_follows/${f.id}/following/${uid}`).delete();
        const prof = db.doc(`shares_profiles/${f.id}`);
        if ((await prof.get()).exists) await prof.update({ followingCount: FV.increment(-1) });
      }
      await db.recursiveDelete(db.doc(`shares_follows/${uid}`));
      add('shareFollows', following.docs.length + followers.docs.length);
      await db.recursiveDelete(db.doc(`shares_notifications/${uid}`));
      const sentNotes = (await db.collectionGroup('items').where('fromUid', '==', uid).get()).docs.filter((d) => d.ref.path.startsWith('shares_notifications/'));
      add('shareNotifications', await deleteRefs(db, sentNotes.map((d) => d.ref)));
      await db.doc(`shares_profiles/${uid}`).delete();

      // ── Messages ──────────────────────────────────────────────────────
      const cids = new Set();
      (await db.collection(`chatInbox/${uid}/chats`).get()).docs.forEach((d) => cids.add(d.id));
      (await db.collectionGroup('chatMembers').where('uid', '==', uid).get()).docs.forEach((d) => { const c = parentDocId(d.ref); if (c) cids.add(c); });
      (await db.collection('conversations').where('members', 'array-contains', uid).get()).docs.forEach((d) => cids.add(d.id));
      for (const cid of cids) {
        const conv = db.doc(`conversations/${cid}`);
        // Their messages, files, photos and links (the stored files too).
        add('chatMessages', await deleteQuery(db, conv.collection('messages').where('senderUid', '==', uid)));
        for (const sub of ['media', 'files']) {
          const assets = await conv.collection(sub).where('senderUid', '==', uid).get();
          for (const a of assets.docs) {
            const p = a.data() && a.data().path;
            if (bucket && p) await bucket.file(p).delete().catch(() => {});
          }
          add('chatFiles', await deleteRefs(db, assets.docs.map((d) => d.ref)));
        }
        await deleteQuery(db, conv.collection('links').where('senderUid', '==', uid));
        await conv.collection('chatMembers').doc(uid).delete();
        await conv.collection('invited').doc(uid).delete();
        const convSnap = await conv.get();
        if (!convSnap.exists) continue;
        const left = await conv.collection('chatMembers').get();
        if (!left.docs.length) {
          // Nobody is left: the conversation and its stored files go.
          if (bucket) await bucket.deleteFiles({ prefix: `chatFiles/${cid}/` }).catch(() => {});
          await db.recursiveDelete(conv);
          add('conversations', 1);
          continue;
        }
        // The preview shows the latest remaining message.
        const c = convSnap.data() || {};
        const update = {};
        if (Array.isArray(c.members) && c.members.includes(uid)) update.members = FV.arrayRemove(uid);
        if (c.createdBy === uid) update.createdBy = null;
        if (c.lastMessage && c.lastMessage.senderUid === uid) {
          const latest = await conv.collection('messages').orderBy('createdAt', 'desc').limit(1).get();
          const m = latest.docs[0] && latest.docs[0].data();
          update.lastMessage = m ? { text: String(m.text || (m.attachment ? 'Sent a file' : '')).slice(0, 140), senderUid: m.senderUid || null, senderName: m.senderName || '' } : null;
          update.lastMessageAt = m ? m.createdAt || null : null;
        }
        if (Object.keys(update).length) await conv.update(update);
      }
      await db.recursiveDelete(db.doc(`chatInbox/${uid}`));
      await db.recursiveDelete(db.doc(`chatContacts/${uid}`));
      add('chatContacts', await deleteQuery(db, db.collectionGroup('list').where('uid', '==', uid)));
      await db.recursiveDelete(db.doc(`chatTeamInvites/${uid}`));
      add('chatInvites', await deleteQuery(db, db.collectionGroup('pending').where('from', '==', uid)));
      await db.recursiveDelete(db.doc(`chatBlocks/${uid}`));
      add('chatBlocks', await deleteRefs(db, blockedSnap.docs.filter((d) => d.id === uid && d.ref.path.startsWith('chatBlocks/')).map((d) => d.ref)));
      add('chatInvites', await deleteQuery(db, db.collection('chatInvites').where('from', '==', uid)));
      add('chatInvites', await deleteQuery(db, db.collection('chatInvites').where('to', '==', uid)));
      add('chatReports', await deleteQuery(db, db.collection('chatReports').where('reporterUid', '==', uid)));
      add('chatReports', await deleteQuery(db, db.collection('chatReports').where('senderUid', '==', uid)));
      // Older collaboration chats.
      for (const coll of ['collabChannels', 'collabDMs']) {
        const field = coll === 'collabDMs' ? 'participants' : 'members';
        const rooms = await db.collection(coll).where(field, 'array-contains', uid).get();
        for (const room of rooms.docs) {
          await deleteQuery(db, room.ref.collection('messages').where('uid', '==', uid));
          await deleteQuery(db, room.ref.collection('messages').where('replyTo', '==', uid));
          const rest = (room.data()[field] || []).filter((x) => x !== uid);
          if (!rest.length) await db.recursiveDelete(room.ref);
          else await room.ref.update({ [field]: FV.arrayRemove(uid) });
        }
      }

      // ── Everything else tied to the account ───────────────────────────
      add('usernames', await deleteQuery(db, db.collection('usernames').where('uid', '==', uid)));
      await db.doc(`directory/${uid}`).delete();
      add('usageEvents', await deleteQuery(db, db.collection('usageEvents').where('uid', '==', uid)));
      add('feedback', await deleteQuery(db, db.collection('deskFeedback').where('uid', '==', uid)));
      add('feedback', await deleteQuery(db, db.collection('feedback_inbox').where('createdBy.uid', '==', uid)));
      add('errorReports', await deleteQuery(db, db.collection('aiErrorReports').where('uid', '==', uid)));
      add('sharedPlans', await deleteQuery(db, db.collection('sharedPlans').where('ownerUid', '==', uid)));
      add('adminNotices', await deleteQuery(db, db.collection('adminNotifications').where('uid', '==', uid)));
      add('protectCases', await deleteQuery(db, db.collection('protect_cases').where('createdBy', '==', uid), { deep: true }));
      add('sections', await deleteQuery(db, db.collection('sections').where('adviserUid', '==', uid), { deep: true }));
      await db.doc(`emailChecks/${uid}`).delete();
      // Codes keep the email as it was typed: match it as written and in lowercase.
      for (const e of new Set([t.email, String(t.email || '').toLowerCase()].filter(Boolean))) {
        add('emailCodes', await deleteQuery(db, db.collection('emailCodes').where('email', '==', e)));
      }
      await db.recursiveDelete(db.doc(`aiLeases/${uid}`));
      await db.recursiveDelete(db.doc(`teachers/${uid}`));

      // ── Stored files and the login ────────────────────────────────────
      if (bucket) {
        for (const prefix of [`teachers/${uid}/`, `profilePhotos/${uid}/`, `shares/${uid}/`]) await bucket.deleteFiles({ prefix }).catch(() => {});
      }
      await admin.auth().deleteUser(uid).catch((e) => { if (!/not.found|no user record/i.test(String(e && (e.code || e.message)))) throw e; });

      // ── The audit log: masked email only (older entries are masked too) ─
      const email = maskEmail(t.email);
      const oldLogs = await db.collection('deletionLogs').where('uid', '==', uid).get();
      for (const l of oldLogs.docs) await l.ref.update({ email: maskEmail(l.data().email), displayName: FV.delete() });
      await db.collection('deletionLogs').add({
        uid, email, reason, ...(deletedBy ? { deletedBy } : {}),
        deletedAt: FV.serverTimestamp(),
      });
      if (onPurged) onPurged(uid);
      purged.push(uid);
    } catch (err) {
      failed.push({ uid, error: String((err && err.message) || err).slice(0, 300) });
      await db.collection('deletionLogs').add({
        uid, reason: `${reason}_failed`, error: String((err && err.message) || err).slice(0, 300),
        deletedAt: FV.serverTimestamp(),
      }).catch(() => {});
    }
  }
  return { purged, failed, removed };
}

/**
 * Accounts deleted earlier (no teacher record, no login) that still have leftovers.
 * → [uid]
 */
async function findLeftoverUids({ db, admin }) {
  const ids = new Set();
  const addAll = (list) => list.forEach((x) => { if (x && typeof x === 'string') ids.add(x); });
  addAll((await db.collection('deletionLogs').get()).docs.map((d) => d.data().uid));
  addAll((await db.collection('directory').get()).docs.map((d) => d.id));
  addAll((await db.collection('usernames').get()).docs.map((d) => d.data().uid));
  addAll((await db.collection('shares_profiles').get()).docs.map((d) => d.id));
  for (const coll of ['chatInbox', 'chatContacts', 'shares_follows', 'shares_notifications', 'chatTeamInvites', 'chatBlocks', 'aiLeases', 'emailChecks']) {
    addAll((await db.collection(coll).listDocuments()).map((r) => r.id));
  }
  const candidates = [];
  for (const uid of ids) if (!(await db.doc(`teachers/${uid}`).get()).exists) candidates.push(uid);
  // Never touch anyone who still has a login.
  const out = [];
  for (let i = 0; i < candidates.length; i += 100) {
    const chunk = candidates.slice(i, i + 100);
    const res = await admin.auth().getUsers(chunk.map((uid) => ({ uid })));
    const notFound = new Set((res.notFound || []).map((x) => x.uid));
    chunk.filter((u) => notFound.has(u)).forEach((u) => out.push(u));
  }
  return out;
}

module.exports = { purgeAccounts, findLeftoverUids, maskEmail };
