import { describe, it, expect, vi } from 'vitest';

vi.mock('../src/firebase.js', () => ({ default: {}, db: {}, auth: {}, firebaseConfig: { projectId: 'x' }, USE_EMULATORS: false }));
vi.mock('firebase/functions', () => ({ getFunctions: () => ({}), httpsCallable: () => async () => ({ data: {} }) }));

const { isUnread, isClearedChat } = await import('../src/services/messages/chatService.js');
const { buildChats, messageNotices } = await import('../src/features/messages/chatStore.js');
const { badgeLabel } = await import('../src/pages/desk/unreadBadge.js');

const t = (ms) => ({ toMillis: () => ms });
const msg = (at, senderUid = 'ben', text = 'Hello po') => ({ lastMessageAt: t(at), lastMessage: { senderUid, senderName: 'Ben', text } });

describe('"Delete chat" for me', () => {
  it('hides the chat and its old messages until someone writes again', () => {
    const inbox = { lastReadAt: t(100), clearedAt: t(500) };
    expect(isClearedChat(inbox, msg(400))).toBe(true);
    expect(isUnread(inbox, msg(400), 'ana')).toBe(false); // old message: not unread after deleting
    expect(isClearedChat(inbox, msg(600))).toBe(false);   // a new message brings it back
    expect(isUnread(inbox, msg(600), 'ana')).toBe(true);
    expect(isClearedChat({ lastReadAt: t(1) }, msg(400))).toBe(false); // never deleted
  });

  it('a deleted chat is still returned (so it can be reopened) but marked hidden and not unread', () => {
    const chats = buildChats(
      [{ id: 'dm_a_b', type: 'dm', clearedAt: t(500), lastReadAt: t(1) }, { id: 'team1', type: 'team', lastReadAt: t(1) }],
      { dm_a_b: msg(400), team1: msg(300) },
      'ana',
    );
    expect(chats.map((c) => [c.cid, c.hidden, c.unread])).toEqual([['dm_a_b', true, false], ['team1', false, true]]);
  });
});

describe('message notifications', () => {
  const chat = (cid, at, extra = {}) => ({ cid, type: 'dm', conv: msg(at), unread: true, muted: false, ...extra });

  it('say which chat a click should open', () => {
    const seen = new Map([['c1', 100]]);
    expect(messageNotices(seen, [chat('c1', 200)])).toEqual([{ title: 'Ben', body: 'Hello po', target: { cid: 'c1' } }]);
    expect(seen.get('c1')).toBe(200);
    expect(messageNotices(seen, [chat('c1', 200)])).toEqual([]); // same message: once only
  });

  it('team messages name the team; muted, read, or open-and-visible chats stay quiet', () => {
    const team = { cid: 't1', type: 'team', conv: { ...msg(200), name: 'Grade 7 Science' }, unread: true, muted: false };
    expect(messageNotices(new Map(), [team])[0].title).toBe('Ben in Grade 7 Science');
    expect(messageNotices(new Map(), [chat('c1', 200, { muted: true })])).toEqual([]);
    expect(messageNotices(new Map(), [chat('c1', 200, { unread: false })])).toEqual([]);
    expect(messageNotices(new Map(), [chat('c1', 200)], { openCid: 'c1', panelOpen: true, visible: true })).toEqual([]);
    // Open but the window is hidden (in the tray): still notify.
    expect(messageNotices(new Map(), [chat('c1', 200)], { openCid: 'c1', panelOpen: true, visible: false })).toHaveLength(1);
  });
});

describe('taskbar unread badge', () => {
  it('shows 1-9, then 9+; nothing when all is read', () => {
    expect([0, -2, 1, 9, 10, 250, 'x'].map(badgeLabel)).toEqual(['', '', '1', '9', '9+', '9+', '']);
  });
});
