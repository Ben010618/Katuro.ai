/**
 * chatStore.js — one live view of "my chats" shared by the Messages screen, the
 * sidebar/top-bar unread badges and notifications (one set of Firestore listeners,
 * however many components use it).
 */
import { useEffect, useMemo, useRef } from 'react';
import { create } from 'zustand';
import { subscribeInbox, subscribeConversation, subscribeIncomingInvites, subscribeTeamInvites, isUnread, isClearedChat, clearFileCache } from '../../services/messages/chatService';

const EMPTY = { inbox: [], conversations: {}, invites: [], invitesReady: false, teamInvites: [], teamInvitesReady: false, ready: false, error: '' };
export const useChatStore = create(() => ({ uid: null, ...EMPTY }));

let users = 0;
let currentUid = null;
let unsubInbox = null;
let unsubInvites = null;
let unsubTeamInvites = null;
const convUnsubs = new Map();

function stopAll() {
  unsubInbox?.();
  unsubInbox = null;
  unsubInvites?.();
  unsubInvites = null;
  unsubTeamInvites?.();
  unsubTeamInvites = null;
  convUnsubs.forEach((u) => u());
  convUnsubs.clear();
}

function start(uid) {
  stopAll();
  currentUid = uid;
  useChatStore.setState({ uid, ...EMPTY });
  // Invites waiting for my answer (bell + badge). A failure here never blocks the chats.
  unsubInvites = subscribeIncomingInvites(uid,
    (invites) => useChatStore.setState({ invites, invitesReady: true }),
    () => useChatStore.setState({ invites: [], invitesReady: true }));
  unsubTeamInvites = subscribeTeamInvites(uid,
    (teamInvites) => useChatStore.setState({ teamInvites, teamInvitesReady: true }),
    () => useChatStore.setState({ teamInvites: [], teamInvitesReady: true }));
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
      if (!convUnsubs.has(cid)) watchConversation(cid, 0);
    }
    useChatStore.setState({ inbox: items, ready: true, error: '' });
  }, (err) => useChatStore.setState({ ready: true, error: err?.message || 'Could not load your chats.' }));
}

const RETRY_MS = [800, 2000, 5000];

/**
 * Live copy of one chat. A chat that just appeared in my inbox (joining a team,
 * accepting an invite) can be refused for a moment while the server is still saving
 * that same write, so a refusal is retried a few times before it counts.
 */
function watchConversation(cid, attempt) {
  convUnsubs.set(cid, subscribeConversation(cid,
    (conv) => useChatStore.setState((s) => ({ conversations: { ...s.conversations, [cid]: conv } })),
    () => {
      if (attempt < RETRY_MS.length) {
        const uid = currentUid;
        setTimeout(() => {
          if (currentUid !== uid || !convUnsubs.has(cid)) return; // signed out or no longer in my list
          convUnsubs.get(cid)?.();
          watchConversation(cid, attempt + 1);
        }, RETRY_MS[attempt]);
        return;
      }
      useChatStore.setState((s) => ({ conversations: { ...s.conversations, [cid]: null } }));
    }));
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
        useChatStore.setState({ uid: null, ...EMPTY });
      }
    };
  }, [uid]);

  const inbox = useChatStore((s) => s.inbox);
  const conversations = useChatStore((s) => s.conversations);
  const ready = useChatStore((s) => s.ready);
  const error = useChatStore((s) => s.error);
  const invites = useChatStore((s) => s.invites);
  const invitesReady = useChatStore((s) => s.invitesReady);
  const teamInvites = useChatStore((s) => s.teamInvites);
  const teamInvitesReady = useChatStore((s) => s.teamInvitesReady);

  const chats = useMemo(() => buildChats(inbox, conversations, uid), [inbox, conversations, uid]);

  // Muted chats still show as unread in the list, but not in the badge.
  const unreadCount = chats.filter((c) => c.unread && !c.muted && !c.hidden).length;
  const inviteCount = invites.length + teamInvites.length;
  // Badges show unread chats plus invites waiting for an answer.
  return {
    chats, unreadCount, invites, invitesReady, teamInvites, teamInvitesReady,
    inviteCount, badgeCount: unreadCount + inviteCount, ready, error,
  };
}

/**
 * My chats, newest first. `hidden`: I deleted it and nobody wrote since, so it stays
 * out of the list (it is still returned, so it can be opened again).
 */
export function buildChats(inbox, conversations, uid) {
  const ms = (t) => (t?.toMillis ? t.toMillis() : 0);
  return inbox
    .map((item) => {
      const conv = conversations[item.id];
      return { cid: item.id, type: item.type, inbox: item, conv, muted: item.muted === true, unread: isUnread(item, conv, uid), hidden: isClearedChat(item, conv) };
    })
    .filter((c) => c.conv !== null) // no longer readable (removed from the team)
    .sort((a, b) => (ms(b.conv?.lastMessageAt) || ms(b.inbox.addedAt)) - (ms(a.conv?.lastMessageAt) || ms(a.inbox.addedAt)));
}

/**
 * Desktop/browser notification when someone else writes, unless that chat is open
 * and visible. Messages already there when the app opened never notify.
 */
export function useChatNotifications({ uid, chats, ready, openCid, panelOpen, notify, invites = [], invitesReady = false, teamInvites = [], teamInvitesReady = false }) {
  const seen = useRef(null);
  const seenInvites = useRef(null);
  const seenTeamInvites = useRef(null);

  // A new team invite: "@ana invited you to Grade 7 Science".
  useEffect(() => {
    if (!teamInvitesReady || !uid) return;
    if (!seenTeamInvites.current) {
      seenTeamInvites.current = new Set(teamInvites.map((i) => i.id));
      return;
    }
    for (const inv of teamInvites) {
      if (seenTeamInvites.current.has(inv.id)) continue;
      seenTeamInvites.current.add(inv.id);
      notify?.(`@${inv.fromUsername || 'a teacher'} invited you to ${inv.teamName || 'a team'}`, 'Open Messages to join or decline.', { invites: true });
    }
  }, [teamInvites, teamInvitesReady, uid, notify]);

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
      notify?.(`@${inv.fromUsername || 'a teacher'} wants to connect`, 'Open Messages to accept the invite.', { invites: true });
    }
  }, [invites, invitesReady, uid, notify]);

  useEffect(() => {
    if (!ready || !uid) return;
    if (!seen.current) {
      seen.current = new Map(chats.map((c) => [c.cid, lastAt(c)]));
      return;
    }
    const visible = typeof document !== 'undefined' && document.visibilityState === 'visible';
    for (const n of messageNotices(seen.current, chats, { openCid, panelOpen, visible })) notify?.(n.title, n.body, n.target);
  }, [chats, ready, uid, openCid, panelOpen, notify]);
}

const lastAt = (c) => (c.conv?.lastMessageAt?.toMillis ? c.conv.lastMessageAt.toMillis() : 0);

/**
 * The notifications to show for chats that changed since `seen` (cid -> last message
 * time; updated in place): someone else wrote, the chat is not muted, and the teacher
 * is not already looking at it. Each says which chat a click should open.
 */
export function messageNotices(seen, chats, { openCid = null, panelOpen = false, visible = true } = {}) {
  const out = [];
  for (const c of chats) {
    const at = lastAt(c);
    const before = seen.get(c.cid) || 0;
    seen.set(c.cid, at);
    if (!at || at <= before || !c.unread || c.muted) continue;
    if (panelOpen && openCid === c.cid && visible) continue;
    const who = c.conv?.lastMessage?.senderName || 'New message';
    const title = c.type === 'team' ? `${who} in ${c.conv?.name || 'your team'}` : who;
    out.push({ title, body: c.conv?.lastMessage?.text || '', target: { cid: c.cid } });
  }
  return out;
}
