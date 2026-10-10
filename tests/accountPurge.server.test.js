/**
 * functions/accountPurge.js: a deleted account leaves nothing behind, while other
 * people's data (and the counters on it) stays correct.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { createRequire } from 'module';
import path from 'path';
import { fakeFirebase, ts } from './helpers/fakeFirebase';

const require = createRequire(import.meta.url);
const { purgeAccounts, findLeftoverUids, maskEmail } = require(path.resolve(__dirname, '../functions/accountPurge.js'));

function world() {
  const f = fakeFirebase();
  const put = (p, d) => f.docs.set(p, d);
  ['gone', 'other', 'third', 'ghost'].forEach((u) => f.authUsers.add(u));
  put('teachers/gone', { email: 'Gone@DepEd.gov.ph', displayName: 'GONE' });
  put('teachers/gone/lessonPlans/l1', { title: 'x' });
  put('teachers/other', { email: 'other@deped.gov.ph' });
  put('sections/s1', { adviserUid: 'gone' });
  put('sections/s1/students/st1', { name: 'learner' });
  put('usageEvents/e1', { uid: 'gone' });
  put('usageEvents/e2', { uid: 'gone' });
  put('usageEvents/e3', { uid: 'other' });
  put('directory/gone', { uid: 'gone' });
  put('directory/other', { uid: 'other' });
  put('usernames/gonename', { uid: 'gone' });
  put('usernames/othername', { uid: 'other' });
  // Shares
  put('shares_profiles/gone', { postCount: 1 });
  put('shares_profiles/other', { followerCount: 1, followingCount: 1 });
  put('shares_posts/p1', { authorUid: 'gone', commentCount: 1 });
  put('shares_posts/p1/comments/c1', { authorUid: 'other' });
  put('shares_reactions/p1/userReactions/other', { type: 'like' });
  put('shares_posts/p2', { authorUid: 'other', commentCount: 4, reactions: { like: 2 } });
  put('shares_posts/p2/comments/c2', { authorUid: 'gone', replyCount: 1 });
  put('shares_posts/p2/comments/c2/replies/r1', { authorUid: 'other' });
  put('shares_posts/p2/comments/c3', { authorUid: 'other', replyCount: 1 });
  put('shares_posts/p2/comments/c3/replies/r2', { authorUid: 'gone' });
  put('shares_reactions/p2/userReactions/gone', { type: 'like' });
  put('shares_reactions/p2/userReactions/third', { type: 'like' });
  put('shares_follows/gone/following/other', {});
  put('shares_follows/other/followers/gone', {});
  put('shares_follows/gone/followers/other', {});
  put('shares_follows/other/following/gone', {});
  put('shares_notifications/gone/items/n1', { fromUid: 'other' });
  put('shares_notifications/other/items/n2', { fromUid: 'gone' });
  put('shares_notifications/other/items/n3', { fromUid: 'third' });
  // Messages
  put('conversations/dm_gone_other', { type: 'dm', members: ['gone', 'other'], createdBy: 'gone', lastMessage: { text: 'bye', senderUid: 'gone', senderName: 'GONE' } });
  put('conversations/dm_gone_other/chatMembers/gone', { uid: 'gone' });
  put('conversations/dm_gone_other/chatMembers/other', { uid: 'other' });
  put('conversations/dm_gone_other/messages/m1', { senderUid: 'other', senderName: 'OTHER', text: 'hello', createdAt: ts(1) });
  put('conversations/dm_gone_other/messages/m2', { senderUid: 'gone', senderName: 'GONE', text: 'bye', createdAt: ts(2) });
  put('conversations/dm_gone_other/files/f1', { senderUid: 'gone', path: 'chatFiles/dm_gone_other/f1/a.pdf' });
  put('conversations/dm_gone_other/links/k1', { senderUid: 'gone', url: 'https://x' });
  put('conversations/team1', { type: 'team', createdBy: 'gone' });
  put('conversations/team1/chatMembers/gone', { uid: 'gone' });
  put('conversations/team1/messages/m3', { senderUid: 'gone', text: 'only me' });
  put('chatInbox/gone/chats/dm_gone_other', {});
  put('chatInbox/other/chats/dm_gone_other', {});
  put('chatContacts/gone/list/other', { uid: 'other' });
  put('chatContacts/other/list/gone', { uid: 'gone' });
  put('chatTeamInvites/other/pending/team9', { from: 'gone' });
  put('chatBlocks/other/blocked/gone', {});
  put('chatBlocks/gone/blocked/third', {});
  put('chatInvites/gone_other', { from: 'gone', to: 'other' });
  put('chatReports/r1', { reporterUid: 'other', senderUid: 'gone', messageText: 'x' });
  // Everything else
  put('deskFeedback/d1', { uid: 'gone' });
  put('feedback_inbox/f1', { createdBy: { uid: 'gone', email: 'Gone@DepEd.gov.ph' } });
  put('aiErrorReports/a1', { uid: 'gone' });
  put('sharedPlans/sp1', { ownerUid: 'gone' });
  put('adminNotifications/an1', { type: 'new_user', uid: 'gone' });
  put('protect_cases/pc1', { createdBy: 'gone' });
  put('protect_cases/pc1/notes/x', { text: 'x' });
  put('emailChecks/gone', { at: 1 });
  put('emailCodes/h1', { email: 'Gone@DepEd.gov.ph' });
  put('aiLeases/gone/active/a1', { expiresAt: 1 });
  put('deletionLogs/old', { uid: 'gone', email: 'gone@deped.gov.ph', displayName: 'GONE', reason: 'earlier' });
  ['teachers/gone/uploads/a.jpg', 'profilePhotos/gone/avatar.jpg', 'shares/gone/p1/0.jpg', 'chatFiles/dm_gone_other/f1/a.pdf', 'chatFiles/team1/x/b.pdf', 'profilePhotos/other/avatar.jpg'].forEach((x) => f.files.add(x));
  return f;
}

describe('complete account deletion', () => {
  let f;
  beforeEach(() => { f = world(); });
  const run = (accounts) => purgeAccounts(accounts, { db: f.db, admin: f.admin, bucket: f.bucket, reason: 'test', deletedBy: 'admin1', onPurged: (u) => f.purgedHook.push(u) });

  it('nothing of the account is left anywhere (data, files, login); only a masked audit entry', async () => {
    f.purgedHook = [];
    const res = await run([{ uid: 'gone' }]);
    expect(res.failed).toEqual([]);
    expect(res.purged).toEqual(['gone']);
    expect(f.purgedHook).toEqual(['gone']);                                   // server memory cleared too
    // No document mentions the account any more, except the masked audit log
    // (and the other teacher's 1-on-1 chat, whose ID is made of both IDs).
    for (const [p, d] of f.docs) {
      if (p.startsWith('deletionLogs/')) continue;
      expect(p.replace('dm_gone_other', '').split('/'), p).not.toContain('gone');
      expect(JSON.stringify(d), p).not.toMatch(/gone/i);
    }
    expect([...f.files].sort()).toEqual(['profilePhotos/other/avatar.jpg']);
    expect(f.authUsers.has('gone')).toBe(false);
    const logs = [...f.docs.entries()].filter(([p]) => p.startsWith('deletionLogs/')).map(([, d]) => d);
    expect(logs.map((l) => [l.email, l.displayName])).toEqual([['g***@deped.gov.ph', undefined], ['G***@DepEd.gov.ph', undefined]]);
  });

  it('other people keep their data, and their counters are corrected', async () => {
    await run([{ uid: 'gone' }]);
    expect(f.docs.get('shares_posts/p2')).toMatchObject({ commentCount: 1, reactions: { like: 1 } });   // c3 is left
    expect(f.docs.has('shares_posts/p2/comments/c3')).toBe(true);
    expect(f.docs.has('shares_reactions/p2/userReactions/third')).toBe(true);
    expect(f.docs.get('shares_profiles/other')).toMatchObject({ followerCount: 0, followingCount: 0 });
    expect(f.docs.has('shares_notifications/other/items/n3')).toBe(true);
    // Their 1-on-1 chat stays, with only their own messages; the preview shows their last message.
    expect(f.docs.get('conversations/dm_gone_other')).toMatchObject({ members: ['other'], createdBy: null, lastMessage: { text: 'hello', senderUid: 'other', senderName: 'OTHER' } });
    expect(f.docs.has('conversations/dm_gone_other/messages/m1')).toBe(true);
    expect(f.docs.has('chatInbox/other/chats/dm_gone_other')).toBe(true);
    // A team chat with nobody left is removed with its files.
    expect([...f.docs.keys()].some((p) => p.startsWith('conversations/team1'))).toBe(false);
    // The other teacher is untouched.
    expect(f.docs.has('teachers/other')).toBe(true);
    expect(f.docs.has('usageEvents/e3')).toBe(true);
    expect(f.authUsers.has('other')).toBe(true);
  });

  it('leftovers of accounts deleted earlier are found (no record, no login) and removed; anyone with a login is never touched', async () => {
    const g = fakeFirebase();
    g.authUsers.add('other');
    g.authUsers.add('ghost');                                                  // a login but no teacher record
    g.docs.set('teachers/other', { email: 'o@x' });
    g.docs.set('directory/old', { uid: 'old' });
    g.docs.set('usernames/oldname', { uid: 'old' });
    g.docs.set('usageEvents/e1', { uid: 'old' });
    g.docs.set('chatInbox/old/chats/c', {});
    g.docs.set('directory/ghost', { uid: 'ghost' });
    g.docs.set('directory/other', { uid: 'other' });
    g.docs.set('deletionLogs/l1', { uid: 'old', email: 'old@deped.gov.ph', displayName: 'OLD' });
    const found = await findLeftoverUids({ db: g.db, admin: g.admin });
    expect(found).toEqual(['old']);
    await purgeAccounts(found.map((uid) => ({ uid })), { db: g.db, admin: g.admin, bucket: g.bucket, reason: 'leftovers' });
    expect([...g.docs.keys()].filter((p) => !p.startsWith('deletionLogs/')).sort()).toEqual(['directory/ghost', 'directory/other', 'teachers/other']);
    expect(g.docs.get('deletionLogs/l1')).toMatchObject({ email: 'o***@deped.gov.ph' });
    expect(g.docs.get('deletionLogs/l1').displayName).toBeUndefined();
  });

  it('masking', () => {
    expect([maskEmail('juan.cruz@deped.gov.ph'), maskEmail(''), maskEmail('nope')]).toEqual(['j***@deped.gov.ph', null, '***']);
  });
});
