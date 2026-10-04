/**
 * chatStore.js — one live view of "my chats" shared by the Messages screen, the
 * sidebar/top-bar unread badges and notifications (one set of Firestore listeners,
 * however many components use it).
 */
import { useEffect, useMemo, useRef } from 'react';
import { create } from 'zustand';
import { subscribeInbox, subscribeConversation, isUnread } from '../../services/messages/chatService';

export const useChatStore = create(() => ({ uid: null, inbox: [], conversations: {}, ready: false, error: '' }));

let users = 0;
let currentUid = null;
let unsubInbox = null;
const convUnsubs = new Map();

function stopAll() {
  unsubInbox?.();
  unsubInbox = null;
  convUnsubs.forEach((u) => u());
  convUnsubs.clear();
}

function start(uid) {
  stopAll();
  currentUid = uid;
  useChatStore.setState({ uid, inbox: [], conversations: {}, ready: false, error: '' });
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
        currentUid = null;
        useChatStore.setState({ uid: null, inbox: [], conversations: {}, ready: false, error: '' });
      }
    };
  }, [uid]);

  const inbox = useChatStore((s) => s.inbox);
  const conversations = useChatStore((s) => s.conversations);
  const ready = useChatStore((s) => s.ready);
  const error = useChatStore((s) => s.error);

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
  return { chats, unreadCount, ready, error };
}

/**
 * Desktop/browser notification when someone else writes, unless that chat is open
 * and visible. Messages already there when the app opened never notify.
 */
export function useChatNotifications({ uid, chats, ready, openCid, panelOpen, notify }) {
  const seen = useRef(null);
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
