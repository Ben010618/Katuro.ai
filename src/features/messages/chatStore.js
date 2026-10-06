/**
 * chatStore.js — one live view of "my chats" shared by the Messages screen, the
 * sidebar/top-bar unread badges and notifications (one set of Firestore listeners,
 * however many components use it).
 */
import { useEffect, useMemo, useRef } from 'react';
import { create } from 'zustand';
import { subscribeInbox, subscribeConversation, subscribeIncomingInvites, isUnread, clearFileCache } from '../../services/messages/chatService';

export const useChatStore = create(() => ({ uid: null, inbox: [], conversations: {}, invites: [], invitesReady: false, ready: false, error: '' }));

let users = 0;
let currentUid = null;
let unsubInbox = null;
let unsubInvites = null;
const convUnsubs = new Map();

function stopAll() {
  unsubInbox?.();
  unsubInbox = null;
  unsubInvites?.();
  unsubInvites = null;
  convUnsubs.forEach((u) => u());
  convUnsubs.clear();
}

function start(uid) {
  stopAll();
  currentUid = uid;
  useChatStore.setState({ uid, inbox: [], conversations: {}, invites: [], invitesReady: false, ready: false, error: '' });
  // Invites waiting for my answer (bell + badge). A failure here never blocks the chats.
  unsubInvites = subscribeIncomingInvites(uid,
    (invites) => useChatStore.setState({ invites, invitesReady: true }),
    () => useChatStore.setState({ invites: [], invitesReady: true }));
  unsubInbox = subscribeInbox(uid, (items) => {
    const wanted = new Set(items.map((i) => i.id));
    for (const [cid, unsub] of convUnsubs) {
      if (!wanted.has(cid)) {
        unsub();
        convUnsubs.delete(cid);
        useChatStore.setState((s) => {
          const conversations = { ...s.conversations };
          delete conversations[cid];
          return { conversations };
        });
      }
    }
    for (const cid of wanted) {
      if (convUnsubs.has(cid)) continue;
      convUnsubs.set(cid, subscribeConversation(cid,
        (conv) => useChatStore.setState((s) => ({ conversations: { ...s.conversations, [cid]: conv } })),
        () => useChatStore.setState((s) => ({ conversations: { ...s.conversations, [cid]: null } }))));
    }
    useChatStore.setState({ inbox: items, ready: true, error: '' });
  }, (err) => useChatStore.setState({ ready: true, error: err?.message || 'Could not load your chats.' }));
}

/** Keeps the shared listeners running while at least one component needs them. */
export function useChats(uid) {
  useEffect(() => {
    if (!uid) return undefined;
    users += 1;
    if (currentUid !== uid) start(uid);
    return () => {
      users -= 1;
      if (users <= 0) {
        users = 0;
        stopAll();
        clearFileCache(); // signed out / left: no cached images of the previous user
        currentUid = null;
        useChatStore.setState({ uid: null, inbox: [], conversations: {}, invites: [], invitesReady: false, ready: false, error: '' });
      }
    };
  }, [uid]);

  const inbox = useChatStore((s) => s.inbox);
  const conversations = useChatStore((s) => s.conversations);
  const ready = useChatStore((s) => s.ready);
  const error = useChatStore((s) => s.error);
  const invites = useChatStore((s) => s.invites);
  const invitesReady = useChatStore((s) => s.invitesReady);

  const chats = useMemo(() => {
    const ms = (t) => (t?.toMillis ? t.toMillis() : 0);
    return inbox
      .map((item) => {
        const conv = conversations[item.id];
        return { cid: item.id, type: item.type, inbox: item, conv, muted: item.muted === true, unread: isUnread(item, conv, uid) };
      })
      .filter((c) => c.conv !== null) // no longer readable (removed from the team)
      .sort((a, b) => (ms(b.conv?.lastMessageAt) || ms(b.inbox.addedAt)) - (ms(a.conv?.lastMessageAt) || ms(a.inbox.addedAt)));
  }, [inbox, conversations, uid]);

  // Muted chats still show as unread in the list, but not in the badge.
  const unreadCount = chats.filter((c) => c.unread && !c.muted).length;
  // Badges show unread chats plus invites waiting for an answer.
  return { chats, unreadCount, invites, invitesReady, inviteCount: invites.length, badgeCount: unreadCount + invites.length, ready, error };
}

/**
 * Desktop/browser notification when someone else writes, unless that chat is open
 * and visible. Messages already there when the app opened never notify.
 */
export function useChatNotifications({ uid, chats, ready, openCid, panelOpen, notify, invites = [], invitesReady = false }) {
  const seen = useRef(null);
  const seenInvites = useRef(null);

  // A new invite: "@ben wants to connect". Invites already there when the app opened never notify.
  useEffect(() => {
    if (!invitesReady || !uid) return;
    if (!seenInvites.current) {
      seenInvites.current = new Set(invites.map((i) => i.id));
      return;
    }
    for (const inv of invites) {
      if (seenInvites.current.has(inv.id)) continue;
      seenInvites.current.add(inv.id);
      notify?.(`@${inv.fromUsername || 'a teacher'} wants to connect`, 'Open Messages to accept the invite.');
    }
  }, [invites, invitesReady, uid, notify]);

  useEffect(() => {
    if (!ready || !uid) return;
    const ms = (t) => (t?.toMillis ? t.toMillis() : 0);
    if (!seen.current) {
      seen.current = new Map(chats.map((c) => [c.cid, ms(c.conv?.lastMessageAt)]));
      return;
    }
    for (const c of chats) {
      const at = ms(c.conv?.lastMessageAt);
      const before = seen.current.get(c.cid) || 0;
      seen.current.set(c.cid, at);
      if (!at || at <= before || !c.unread || c.muted) continue;
      const looking = panelOpen && openCid === c.cid && typeof document !== 'undefined' && document.visibilityState === 'visible';
      if (looking) continue;
      const who = c.conv?.lastMessage?.senderName || 'New message';
      const title = c.type === 'team' ? `${who} in ${c.conv?.name || 'your team'}` : who;
      notify?.(title, c.conv?.lastMessage?.text || '');
    }
  }, [chats, ready, uid, openCid, panelOpen, notify]);
}
