/**
 * MessagesPanel — teacher-to-teacher messages (Phase 1): unique usernames, one-to-one
 * chats and teams with teachers from the same school or division. Used by the web
 * /messages page and by KaTuroDesk (top bar → Messages).
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, Plus, Users, Search, Send, X, ArrowLeft, Flag, Trash2, Settings2, AtSign, Info } from 'lucide-react';
import {
  syncDirectory, claimUsername, isUsernameFree, usernameProblem, normalizeUsername, canMessage,
  listColleagues, findByUsername, openDirectChat, createTeam, addTeamMember, removeTeamMember, leaveTeam,
  renameTeam, subscribeMembers, subscribeMessages, sendMessage, markRead, deleteMyMessage, reportMessage,
  getDirectoryCard, MAX_MESSAGE_LENGTH, MAX_TEAM_MEMBERS,
} from '../../services/messages/chatService';
import { useChats } from './chatStore';

const C = {
  card: 'var(--kt-card, #FBF7EC)',
  surface: 'var(--kt-surface, #FBF7EC)',
  border: 'var(--kt-border, #DCD0AE)',
  text: 'var(--kt-text-primary, #262119)',
  muted: 'var(--kt-text-secondary, #6E6455)',
  green: '#2d6a4f',
  greenDark: '#1a3d2b',
  red: '#b91c1c',
};
const btn = { display: 'inline-flex', alignItems: 'center', gap: 6, border: 'none', borderRadius: 8, padding: '8px 12px', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' };
const btnPrimary = { ...btn, background: C.green, color: '#fff' };
const btnGhost = { ...btn, background: 'transparent', color: C.text, border: `1px solid ${C.border}` };
const input = { width: '100%', boxSizing: 'border-box', padding: '9px 11px', fontSize: 13, borderRadius: 8, border: `1px solid ${C.border}`, background: '#fff', color: '#262119', fontFamily: 'inherit' };

const ms = (t) => (t?.toMillis ? t.toMillis() : (t instanceof Date ? t.getTime() : 0));
function when(t) {
  const m = ms(t);
  if (!m) return '';
  const d = new Date(m);
  const today = new Date();
  return d.toDateString() === today.toDateString()
    ? d.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' })
    : d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' });
}

function Modal({ title, onClose, children, width = 460 }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 80, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: width, maxHeight: '85vh', overflow: 'auto', background: C.card, color: C.text, borderRadius: 14, border: `1px solid ${C.border}`, padding: 18, boxShadow: '0 20px 50px rgba(0,0,0,0.25)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800 }}>{title}</h3>
          <button onClick={onClose} title="Close" style={{ ...btn, padding: 4, background: 'transparent', color: C.muted }}><X size={16} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

/** Choose (or change) a unique username, with a live "taken / available" check. */
function UsernameForm({ uid, current = '', onDone, onCancel }) {
  const [value, setValue] = useState(current);
  const [avail, setAvail] = useState({ name: '', free: null }); // last availability answer
  const [serverError, setServerError] = useState('');
  const [saving, setSaving] = useState(false);
  const name = normalizeUsername(value);
  const problem = name && name !== current ? usernameProblem(name) : '';

  // Ask whether the name is free (debounced); the server makes the final atomic check.
  useEffect(() => {
    if (!name || name === current || problem) return undefined;
    let alive = true;
    const t = setTimeout(() => {
      isUsernameFree(name, uid).then((free) => alive && setAvail({ name, free })).catch(() => {});
    }, 350);
    return () => { alive = false; clearTimeout(t); };
  }, [name, uid, current, problem]);

  let status = { state: 'idle', text: '' };
  if (!name || name === current) status = { state: 'idle', text: '' };
  else if (problem) status = { state: 'bad', text: problem };
  else if (serverError) status = { state: 'bad', text: serverError };
  else if (avail.name !== name) status = { state: 'checking', text: 'Checking…' };
  else status = avail.free ? { state: 'ok', text: 'Available' } : { state: 'bad', text: 'That username is taken.' };

  async function submit(e) {
    e.preventDefault();
    if (status.state === 'bad' || usernameProblem(name)) return;
    setSaving(true);
    try {
      onDone(await claimUsername(name));
    } catch (err) {
      setServerError(err?.message || 'Could not save the username.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <label style={{ fontSize: 12, fontWeight: 700, color: C.muted }} htmlFor="kt-username">Username</label>
      <div style={{ position: 'relative' }}>
        <AtSign size={14} style={{ position: 'absolute', left: 10, top: 11, color: '#6E6455' }} />
        <input id="kt-username" autoFocus value={value} onChange={(e) => { setValue(e.target.value); setServerError(''); }} placeholder="e.g. ben.cuvinar" maxLength={21} style={{ ...input, paddingLeft: 30 }} />
      </div>
      <p style={{ margin: 0, fontSize: 12, minHeight: 16, color: status.state === 'bad' ? C.red : status.state === 'ok' ? C.green : C.muted }}>
        {status.text || '3 to 20 letters, numbers, dots or underscores. Teachers find you by it.'}
      </p>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        {onCancel && <button type="button" onClick={onCancel} style={btnGhost}>Cancel</button>}
        <button type="submit" disabled={saving || status.state === 'bad' || status.state === 'checking' || !name || name === current} style={{ ...btnPrimary, opacity: saving || status.state === 'bad' || !name || name === current ? 0.5 : 1 }}>
          {saving && <Loader2 size={13} className="animate-spin" />} {current ? 'Change username' : 'Save username'}
        </button>
      </div>
    </form>
  );
}

/** Pick teachers from my school / division (plus exact username lookup). */
function ColleaguePicker({ me, multiple, exclude = [], onPick, selected = [], max = MAX_TEAM_MEMBERS - 1 }) {
  const [list, setList] = useState(null);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('');
  const [lookup, setLookup] = useState('');
  const [lookupMsg, setLookupMsg] = useState('');

  useEffect(() => {
    let alive = true;
    listColleagues(me).then((l) => alive && setList(l)).catch((e) => alive && setError(e?.message || 'Could not load teachers.'));
    return () => { alive = false; };
  }, [me]);

  const shown = useMemo(() => {
    const f = filter.trim().toLowerCase();
    return (list || []).filter((c) => !exclude.includes(c.id) && (!f || `${c.displayName} ${c.username} ${c.school}`.toLowerCase().includes(f)));
  }, [list, filter, exclude]);

  async function findExact(e) {
    e.preventDefault();
    setLookupMsg('');
    try {
      const res = await findByUsername(lookup, me);
      if (res.card) onPick(res.card);
      else setLookupMsg(res.reason === 'self' ? 'That is you.' : res.reason === 'other_org' ? 'That teacher is not in your school or division.' : 'No teacher has that username.');
    } catch (err) {
      setLookupMsg(err?.message || 'Could not search.');
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <form onSubmit={findExact} style={{ display: 'flex', gap: 6 }}>
        <input value={lookup} onChange={(e) => setLookup(e.target.value)} placeholder="Find by exact username" style={input} />
        <button type="submit" style={btnGhost} disabled={!lookup.trim()}>Find</button>
      </form>
      {lookupMsg && <p style={{ margin: 0, fontSize: 12, color: C.red }}>{lookupMsg}</p>}
      <div style={{ position: 'relative' }}>
        <Search size={14} style={{ position: 'absolute', left: 10, top: 11, color: '#6E6455' }} />
        <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter teachers in your school or division" style={{ ...input, paddingLeft: 30 }} />
      </div>
      {error && <p style={{ margin: 0, fontSize: 12, color: C.red }}>{error}</p>}
      {list === null && !error ? (
        <p style={{ margin: 0, fontSize: 12, color: C.muted }}><Loader2 size={12} className="animate-spin" style={{ display: 'inline' }} /> Loading teachers…</p>
      ) : (
        <div style={{ maxHeight: 280, overflowY: 'auto', border: `1px solid ${C.border}`, borderRadius: 8 }}>
          {shown.length === 0 && <p style={{ margin: 0, padding: 12, fontSize: 12, color: C.muted }}>No teachers found. Teachers appear here once they choose a username in Messages.</p>}
          {shown.map((c) => {
            const on = selected.includes(c.id);
            const full = multiple && !on && selected.length >= max;
            return (
              <button key={c.id} type="button" disabled={full} onClick={() => onPick(c)}
                style={{ display: 'flex', width: '100%', textAlign: 'left', gap: 10, alignItems: 'center', padding: '9px 12px', border: 'none', borderBottom: `1px solid ${C.border}`, background: on ? 'rgba(45,106,79,0.12)' : 'transparent', color: C.text, cursor: full ? 'not-allowed' : 'pointer', opacity: full ? 0.5 : 1, fontFamily: 'inherit' }}>
                {multiple && <input type="checkbox" readOnly checked={on} style={{ accentColor: C.green }} />}
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: 13, fontWeight: 700 }}>{c.displayName}</span>
                  <span style={{ display: 'block', fontSize: 11, color: C.muted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>@{c.username}{c.school ? ` · ${c.school}` : ''}</span>
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function useCardName(uid) {
  const [card, setCard] = useState(null);
  useEffect(() => {
    let alive = true;
    if (uid) getDirectoryCard(uid).then((c) => alive && setCard(c));
    return () => { alive = false; };
  }, [uid]);
  return card;
}

function ChatTitle({ chat, me }) {
  const otherUid = chat.type === 'dm' ? (chat.conv?.members || []).find((u) => u !== me.uid) : null;
  const card = useCardName(otherUid);
  if (chat.type === 'team') return <>{chat.conv?.name || 'Team'}</>;
  return <>{card?.displayName || chat.conv?.lastMessage?.senderName || 'Teacher'}</>;
}

function TeamInfo({ me, chat, members, onClose, onLeft }) {
  const iAmAdmin = members.some((m) => m.uid === me.uid && m.role === 'admin');
  const [cards, setCards] = useState({});
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState(chat.conv?.name || '');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);

  useEffect(() => {
    let alive = true;
    Promise.all(members.map((m) => getDirectoryCard(m.uid).then((c) => [m.uid, c]))).then((pairs) => alive && setCards(Object.fromEntries(pairs)));
    return () => { alive = false; };
  }, [members]);

  const run = async (fn) => {
    setError('');
    setBusy(true);
    try { await fn(); } catch (err) { setError(err?.message || 'That did not work. Please try again.'); } finally { setBusy(false); }
  };

  return (
    <Modal title="Team info" onClose={onClose}>
      {iAmAdmin && (
        <form onSubmit={(e) => { e.preventDefault(); run(() => renameTeam(chat.cid, name)); }} style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} style={input} aria-label="Team name" />
          <button type="submit" style={btnGhost} disabled={busy || !name.trim() || name.trim() === chat.conv?.name}>Rename</button>
        </form>
      )}
      <p style={{ margin: '0 0 6px', fontSize: 12, fontWeight: 700, color: C.muted }}>{members.length} member{members.length === 1 ? '' : 's'}</p>
      <div style={{ border: `1px solid ${C.border}`, borderRadius: 8, marginBottom: 12 }}>
        {members.map((m) => (
          <div key={m.uid} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderBottom: `1px solid ${C.border}` }}>
            <span style={{ flex: 1, minWidth: 0, fontSize: 13 }}>
              <strong>{cards[m.uid]?.displayName || (m.uid === me.uid ? me.displayName : 'Teacher')}</strong>
              {m.uid === me.uid && <span style={{ color: C.muted }}> (you)</span>}
              {cards[m.uid]?.username && <span style={{ display: 'block', fontSize: 11, color: C.muted }}>@{cards[m.uid].username}</span>}
            </span>
            {m.role === 'admin' && <span style={{ fontSize: 10, fontWeight: 800, color: C.green, border: `1px solid ${C.green}`, borderRadius: 4, padding: '1px 5px' }}>ADMIN</span>}
            {iAmAdmin && m.uid !== me.uid && (
              <button type="button" disabled={busy} onClick={() => run(() => removeTeamMember(chat.cid, m.uid))} style={{ ...btn, padding: '4px 8px', background: 'transparent', color: C.red }}>Remove</button>
            )}
          </div>
        ))}
      </div>
      {iAmAdmin && (adding ? (
        <ColleaguePicker me={me} exclude={members.map((m) => m.uid)} onPick={(c) => run(async () => { await addTeamMember(me, chat.cid, c.id); setAdding(false); })} />
      ) : (
        <button type="button" onClick={() => setAdding(true)} disabled={members.length >= MAX_TEAM_MEMBERS} style={{ ...btnGhost, marginBottom: 12 }}><Plus size={13} /> Add a teacher</button>
      ))}
      {error && <p style={{ margin: '8px 0', fontSize: 12, color: C.red }}>{error}</p>}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
        {confirmLeave ? (
          <span style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12 }}>
            Leave this team?
            <button type="button" disabled={busy} onClick={() => run(async () => { await leaveTeam(me, chat.cid, members); onLeft(); })} style={{ ...btn, background: C.red, color: '#fff' }}>Leave</button>
            <button type="button" onClick={() => setConfirmLeave(false)} style={btnGhost}>Stay</button>
          </span>
        ) : (
          <button type="button" onClick={() => setConfirmLeave(true)} style={{ ...btnGhost, color: C.red }}>Leave team</button>
        )}
      </div>
    </Modal>
  );
}

function Thread({ me, chat, onBack, onLeft }) {
  const [messages, setMessages] = useState([]);
  const [hasMore, setHasMore] = useState(false);
  const [count, setCount] = useState(50);
  const [members, setMembers] = useState([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState(false);
  const [reporting, setReporting] = useState(null);
  const [reason, setReason] = useState('');
  const [reportDone, setReportDone] = useState(false);
  const endRef = useRef(null);
  const lastCountRef = useRef(0);
  const cid = chat.cid;

  useEffect(() => subscribeMessages(cid, count, (list, more) => { setMessages(list); setHasMore(more); },
    (err) => setError(err?.code === 'permission-denied' ? 'You are no longer a member of this chat.' : 'Could not load messages.')), [cid, count]);

  useEffect(() => (chat.type === 'team' ? subscribeMembers(cid, setMembers, () => setMembers([])) : undefined), [cid, chat.type]);

  // Mark as read while the chat is open and visible.
  useEffect(() => {
    if (!chat.unread) return;
    if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
    markRead(me.uid, cid).catch(() => {});
  }, [chat.unread, cid, me.uid, messages.length]);

  useEffect(() => {
    if (messages.length > lastCountRef.current) endRef.current?.scrollIntoView({ block: 'end' });
    lastCountRef.current = messages.length;
  }, [messages]);

  async function send() {
    if (!text.trim() || sending) return;
    setSending(true);
    setError('');
    try {
      await sendMessage(cid, me, text);
      setText('');
    } catch (err) {
      setError(err?.message || 'Message not sent. Check your connection and try again.');
    } finally {
      setSending(false);
    }
  }

  async function submitReport() {
    try {
      await reportMessage(cid, reporting, me, reason);
      setReportDone(true);
    } catch (err) {
      setError(err?.message || 'Could not send the report.');
      setReporting(null);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderBottom: `1px solid ${C.border}` }}>
        <button onClick={onBack} className="kt-msg-back" title="Back to chats" style={{ ...btn, padding: 4, background: 'transparent', color: C.text }}><ArrowLeft size={16} /></button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ margin: 0, fontSize: 14, fontWeight: 800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}><ChatTitle chat={chat} me={me} /></p>
          {chat.type === 'team' && <p style={{ margin: 0, fontSize: 11, color: C.muted }}>Team · {members.length} member{members.length === 1 ? '' : 's'}</p>}
        </div>
        {chat.type === 'team' && <button onClick={() => setInfo(true)} style={btnGhost}><Settings2 size={13} /> Team info</button>}
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 6 }}>
        {hasMore && <button onClick={() => setCount((n) => n + 50)} style={{ ...btnGhost, alignSelf: 'center', fontSize: 11 }}>Load earlier messages</button>}
        {messages.length === 0 && !error && <p style={{ margin: 'auto', fontSize: 12, color: C.muted }}>No messages yet. Say hello.</p>}
        {messages.map((m) => {
          const mine = m.senderUid === me.uid;
          return (
            <div key={m.id} className="kt-msg-row" style={{ display: 'flex', justifyContent: mine ? 'flex-end' : 'flex-start' }}>
              <div style={{ maxWidth: '78%', minWidth: 0 }}>
                {!mine && chat.type === 'team' && <p style={{ margin: '0 0 2px 4px', fontSize: 11, fontWeight: 700, color: C.muted }}>{m.senderName}</p>}
                <div style={{ background: mine ? C.green : 'rgba(0,0,0,0.06)', color: mine ? '#fff' : C.text, borderRadius: 12, padding: '7px 11px', fontSize: 13, lineHeight: 1.45, whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontStyle: m.deleted ? 'italic' : 'normal', opacity: m.deleted ? 0.7 : 1 }}>
                  {m.deleted ? 'Message deleted' : m.text}
                </div>
                <div style={{ display: 'flex', gap: 8, justifyContent: mine ? 'flex-end' : 'flex-start', alignItems: 'center', margin: '2px 4px 0' }}>
                  <span style={{ fontSize: 10, color: C.muted }}>{when(m.createdAt)}</span>
                  {!m.deleted && (mine ? (
                    <button className="kt-msg-action" title="Delete message" onClick={() => deleteMyMessage(cid, m.id).catch((e) => setError(e?.message || 'Could not delete.'))} style={{ ...btn, padding: 0, background: 'transparent', color: C.muted }}><Trash2 size={11} /></button>
                  ) : (
                    <button className="kt-msg-action" title="Report message" onClick={() => { setReporting(m); setReason(''); setReportDone(false); }} style={{ ...btn, padding: 0, background: 'transparent', color: C.muted }}><Flag size={11} /></button>
                  ))}
                </div>
              </div>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>

      {error && <p style={{ margin: 0, padding: '6px 14px', fontSize: 12, color: C.red }}>{error}</p>}
      <div style={{ display: 'flex', gap: 8, padding: 10, borderTop: `1px solid ${C.border}`, alignItems: 'flex-end' }}>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value.slice(0, MAX_MESSAGE_LENGTH))}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
          rows={2}
          placeholder="Write a message (Enter to send, Shift+Enter for a new line)"
          style={{ ...input, resize: 'none', flex: 1 }}
        />
        <button onClick={send} disabled={sending || !text.trim()} style={{ ...btnPrimary, opacity: sending || !text.trim() ? 0.5 : 1 }}>
          {sending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />} Send
        </button>
      </div>
      {text.length > MAX_MESSAGE_LENGTH - 300 && <p style={{ margin: '0 0 6px 14px', fontSize: 11, color: C.muted }}>{text.length} / {MAX_MESSAGE_LENGTH}</p>}

      {info && chat.type === 'team' && <TeamInfo me={me} chat={chat} members={members} onClose={() => setInfo(false)} onLeft={() => { setInfo(false); onLeft(); }} />}
      {reporting && (
        <Modal title="Report message" onClose={() => setReporting(null)}>
          {reportDone ? (
            <>
              <p style={{ margin: '0 0 12px', fontSize: 13 }}>Thank you. The kaTuro admin will review it.</p>
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}><button onClick={() => setReporting(null)} style={btnPrimary}>Done</button></div>
            </>
          ) : (
            <>
              <p style={{ margin: '0 0 8px', fontSize: 12, color: C.muted }}>“{String(reporting.text).slice(0, 200)}”</p>
              <textarea value={reason} onChange={(e) => setReason(e.target.value.slice(0, 500))} rows={3} placeholder="What is wrong with this message? (optional)" style={{ ...input, resize: 'vertical' }} />
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 10 }}>
                <button onClick={() => setReporting(null)} style={btnGhost}>Cancel</button>
                <button onClick={submitReport} style={{ ...btn, background: C.red, color: '#fff' }}>Send report</button>
              </div>
            </>
          )}
        </Modal>
      )}
    </div>
  );
}

export default function MessagesPanel({ user, onOpenProfile, onOpenChatChange, height = '100%' }) {
  const uid = user?.uid;
  const [me, setMe] = useState(undefined); // undefined = loading, null = no username yet
  const [loadError, setLoadError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [openCid, setOpenCid] = useState(null);
  const [filter, setFilter] = useState('');
  const [dialog, setDialog] = useState(null); // 'dm' | 'team' | 'username'
  const [teamName, setTeamName] = useState('');
  const [teamPick, setTeamPick] = useState([]);
  const [dialogError, setDialogError] = useState('');
  const [busy, setBusy] = useState(false);
  const { chats, ready, error } = useChats(me ? uid : null);

  useEffect(() => {
    let alive = true;
    if (!uid) return undefined;
    syncDirectory()
      .then((entry) => { if (alive) { setLoadError(''); setMe(entry); } })
      // Unknown whether a username exists yet: don't ask for one, offer a retry.
      .catch(() => { if (alive) setLoadError('Messages could not be reached. Check your connection and try again.'); });
    return () => { alive = false; };
  }, [uid, attempt]);

  useEffect(() => { onOpenChatChange?.(openCid); }, [openCid, onOpenChatChange]);

  const openChat = chats.find((c) => c.cid === openCid) || null;

  if (!uid) return null;
  if (loadError && me === undefined) {
    return (
      <div style={{ maxWidth: 440, margin: '30px auto', padding: 20, background: C.card, color: C.text, border: `1px solid ${C.border}`, borderRadius: 14, textAlign: 'center' }}>
        <p style={{ margin: '0 0 12px', fontSize: 13 }}>{loadError}</p>
        <button onClick={() => { setLoadError(''); setAttempt((n) => n + 1); }} style={btnPrimary}>Try again</button>
      </div>
    );
  }
  if (me === undefined) {
    return <div style={{ padding: 40, textAlign: 'center', color: C.muted, fontSize: 13 }}><Loader2 size={18} className="animate-spin" style={{ display: 'inline' }} /> Opening Messages…</div>;
  }
  if (me === null) {
    return (
      <div style={{ maxWidth: 440, margin: '30px auto', padding: 20, background: C.card, color: C.text, border: `1px solid ${C.border}`, borderRadius: 14 }}>
        <h2 style={{ margin: '0 0 6px', fontSize: 17, fontWeight: 800 }}>Choose your username</h2>
        <p style={{ margin: '0 0 14px', fontSize: 13, color: C.muted }}>Teachers at your school or division find and message you by your username. Each username belongs to one teacher only.</p>
        <UsernameForm uid={uid} onDone={(entry) => setMe(entry)} />
      </div>
    );
  }

  const reachable = canMessage(me);
  const visible = chats.filter((c) => {
    const f = filter.trim().toLowerCase();
    if (!f) return true;
    return `${c.conv?.name || ''} ${c.conv?.lastMessage?.senderName || ''} ${c.conv?.lastMessage?.text || ''}`.toLowerCase().includes(f);
  });

  async function startDm(card) {
    setDialogError('');
    setBusy(true);
    try {
      const cid = await openDirectChat(me, card.id);
      setDialog(null);
      setOpenCid(cid);
    } catch (err) {
      setDialogError(err?.code === 'permission-denied' ? 'You can only message teachers from your school or division.' : (err?.message || 'Could not open the chat.'));
    } finally {
      setBusy(false);
    }
  }

  async function makeTeam() {
    setDialogError('');
    setBusy(true);
    try {
      const { cid, failed } = await createTeam(me, teamName, teamPick);
      setDialog(null);
      setTeamName('');
      setTeamPick([]);
      setOpenCid(cid);
      if (failed.length) setDialogError(`${failed.length} teacher(s) could not be added (not in your school or division).`);
    } catch (err) {
      setDialogError(err?.message || 'Could not create the team.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ height, display: 'flex', flexDirection: 'column', background: C.card, color: C.text, border: `1px solid ${C.border}`, borderRadius: 14, overflow: 'hidden', minHeight: 0 }}>
      <style>{`
        .kt-msg-layout { display: grid; grid-template-columns: 300px 1fr; flex: 1; min-height: 0; }
        .kt-msg-back { display: none !important; }
        .kt-msg-action { opacity: 0.55; }
        .kt-msg-row:hover .kt-msg-action { opacity: 1; }
        @media (max-width: 760px) {
          .kt-msg-layout { grid-template-columns: 1fr; }
          .kt-msg-layout.has-open .kt-msg-list { display: none; }
          .kt-msg-layout:not(.has-open) .kt-msg-thread { display: none; }
          .kt-msg-back { display: inline-flex !important; }
        }
      `}</style>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px', borderBottom: `1px solid ${C.border}`, fontSize: 11.5, color: C.muted, flexWrap: 'wrap' }}>
        <Info size={13} />
        <span style={{ flex: 1, minWidth: 200 }}>The kaTuro admin can view messages for safety and child protection. Keep messages professional.</span>
        <button onClick={() => setDialog('username')} style={{ ...btn, padding: '2px 6px', background: 'transparent', color: C.green }}>@{me.username}</button>
      </div>

      {!reachable && (
        <div style={{ padding: '10px 14px', background: 'rgba(180,83,9,0.08)', borderBottom: `1px solid ${C.border}`, fontSize: 12.5, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ flex: 1, minWidth: 220 }}>Add your School ID, school or division in your profile so you can message teachers at your school or division.</span>
          {onOpenProfile && <button onClick={onOpenProfile} style={btnGhost}>Open my profile</button>}
        </div>
      )}

      <div className={`kt-msg-layout${openChat ? ' has-open' : ''}`}>
        <div className="kt-msg-list" style={{ borderRight: `1px solid ${C.border}`, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <div style={{ padding: 10, display: 'flex', flexDirection: 'column', gap: 8, borderBottom: `1px solid ${C.border}` }}>
            <div style={{ display: 'flex', gap: 6 }}>
              <button disabled={!reachable} onClick={() => { setDialog('dm'); setDialogError(''); }} style={{ ...btnPrimary, flex: 1, justifyContent: 'center', opacity: reachable ? 1 : 0.5 }}><Plus size={13} /> New chat</button>
              <button disabled={!reachable} onClick={() => { setDialog('team'); setDialogError(''); }} style={{ ...btnGhost, flex: 1, justifyContent: 'center', opacity: reachable ? 1 : 0.5 }}><Users size={13} /> New team</button>
            </div>
            <div style={{ position: 'relative' }}>
              <Search size={13} style={{ position: 'absolute', left: 10, top: 10, color: '#6E6455' }} />
              <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Search chats" style={{ ...input, paddingLeft: 28, padding: '7px 10px 7px 28px' }} />
            </div>
          </div>
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {!ready && <p style={{ padding: 14, fontSize: 12, color: C.muted }}><Loader2 size={12} className="animate-spin" style={{ display: 'inline' }} /> Loading chats…</p>}
            {error && <p style={{ padding: 14, fontSize: 12, color: C.red }}>{error}</p>}
            {ready && !visible.length && !error && <p style={{ padding: 14, fontSize: 12, color: C.muted }}>{chats.length ? 'No chats match.' : 'No chats yet. Start one with a teacher from your school or division.'}</p>}
            {visible.map((c) => (
              <button key={c.cid} onClick={() => setOpenCid(c.cid)}
                style={{ display: 'flex', width: '100%', gap: 8, textAlign: 'left', padding: '10px 12px', border: 'none', borderBottom: `1px solid ${C.border}`, background: c.cid === openCid ? 'rgba(45,106,79,0.12)' : 'transparent', color: C.text, cursor: 'pointer', fontFamily: 'inherit' }}>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 13, fontWeight: c.unread ? 800 : 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}><ChatTitle chat={c} me={me} /></span>
                    {c.type === 'team' && <span style={{ fontSize: 9, fontWeight: 800, color: C.muted, border: `1px solid ${C.border}`, borderRadius: 4, padding: '0 4px' }}>TEAM</span>}
                  </span>
                  <span style={{ display: 'block', fontSize: 11.5, color: C.muted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {c.conv?.lastMessage ? `${c.conv.lastMessage.senderUid === me.uid ? 'You' : c.conv.lastMessage.senderName}: ${c.conv.lastMessage.text}` : 'No messages yet'}
                  </span>
                </span>
                <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                  <span style={{ fontSize: 10, color: C.muted }}>{when(c.conv?.lastMessageAt)}</span>
                  {c.unread && <span title="Unread" style={{ width: 9, height: 9, borderRadius: 9, background: C.green }} />}
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="kt-msg-thread" style={{ minHeight: 0, minWidth: 0 }}>
          {openChat ? (
            <Thread key={openChat.cid} me={me} chat={openChat} onBack={() => setOpenCid(null)} onLeft={() => setOpenCid(null)} />
          ) : (
            <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.muted, fontSize: 13, padding: 20, textAlign: 'center' }}>
              {dialogError || 'Select a chat, or start a new one.'}
            </div>
          )}
        </div>
      </div>

      {dialog === 'username' && (
        <Modal title="Your username" onClose={() => setDialog(null)}>
          <UsernameForm uid={uid} current={me.username} onCancel={() => setDialog(null)} onDone={(entry) => { setMe(entry); setDialog(null); }} />
        </Modal>
      )}
      {dialog === 'dm' && (
        <Modal title="New chat" onClose={() => setDialog(null)}>
          <ColleaguePicker me={me} onPick={(card) => !busy && startDm(card)} />
          {dialogError && <p style={{ margin: '8px 0 0', fontSize: 12, color: C.red }}>{dialogError}</p>}
        </Modal>
      )}
      {dialog === 'team' && (
        <Modal title="New team" onClose={() => setDialog(null)} width={520}>
          <input value={teamName} onChange={(e) => setTeamName(e.target.value)} maxLength={60} placeholder="Team name, e.g. Grade 7 Science Teachers" style={{ ...input, marginBottom: 10 }} />
          <ColleaguePicker me={me} multiple selected={teamPick}
            onPick={(card) => setTeamPick((p) => (p.includes(card.id) ? p.filter((x) => x !== card.id) : [...p, card.id]))} />
          {dialogError && <p style={{ margin: '8px 0 0', fontSize: 12, color: C.red }}>{dialogError}</p>}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}>
            <span style={{ fontSize: 12, color: C.muted }}>{teamPick.length} selected</span>
            <button onClick={makeTeam} disabled={busy || !teamName.trim()} style={{ ...btnPrimary, opacity: busy || !teamName.trim() ? 0.5 : 1 }}>
              {busy && <Loader2 size={13} className="animate-spin" />} Create team
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
