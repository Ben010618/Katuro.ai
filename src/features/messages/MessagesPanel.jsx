/**
 * MessagesPanel — teacher-to-teacher messages: unique usernames, finding teachers by
 * @username (with "did you mean" suggestions), invites (bell) and contacts, one-to-one
 * chats and teams. Used by the web /messages page and by KaTuroDesk (top bar → Messages).
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, Plus, Users, Search, Send, X, ArrowLeft, Flag, Trash2, AtSign, Info, Paperclip, FolderOpen, Bell, BellOff, Ban, ExternalLink } from 'lucide-react';
import {
  syncDirectory, claimUsername, isUsernameFree, usernameProblem, normalizeUsername,
  searchTeachers, searchKey, SEARCH_MIN_CHARS, sendInvite, respondInvite, listContacts,
  openDirectChat, createTeam, addTeamMember, removeTeamMember, leaveTeam,
  renameTeam, subscribeMembers, subscribeMessages, sendMessage, markRead, deleteMyMessage, reportMessage,
  getDirectoryCard, MAX_MESSAGE_LENGTH, MAX_TEAM_MEMBERS,
  uploadChatFile, fetchChatFile, saveBlobAs, subscribeAssets, subscribeBlocks, blockTeacher, unblockTeacher,
  setChatMuted, fileProblem, fileExtension, formatBytes, linkDomain, FILE_ACCEPT, FILE_KINDS,
} from '../../services/messages/chatService';
import { useChats } from './chatStore';
import AvatarImage from '../../components/AvatarImage';

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
/** Pick from my contacts (teachers who accepted an invite, or whose invite I accepted). */
function ColleaguePicker({ me, multiple, exclude = [], onPick, selected = [], max = MAX_TEAM_MEMBERS - 1 }) {
  const [list, setList] = useState(null);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('');

  useEffect(() => {
    let alive = true;
    listContacts(me.uid).then((l) => alive && setList(l)).catch((e) => alive && setError(e?.message || 'Could not load your contacts.'));
    return () => { alive = false; };
  }, [me]);

  const shown = useMemo(() => {
    const f = normalizeUsername(filter);
    return (list || []).filter((c) => !exclude.includes(c.id) && (!f || `${c.username} ${c.displayName} ${c.school}`.toLowerCase().includes(f)));
  }, [list, filter, exclude]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ position: 'relative' }}>
        <Search size={14} style={{ position: 'absolute', left: 10, top: 11, color: '#6E6455' }} />
        <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter your contacts" style={{ ...input, paddingLeft: 30 }} />
      </div>
      {error && <p style={{ margin: 0, fontSize: 12, color: C.red }}>{error}</p>}
      {list === null && !error ? (
        <p style={{ margin: 0, fontSize: 12, color: C.muted }}><Loader2 size={12} className="animate-spin" style={{ display: 'inline' }} /> Loading contacts…</p>
      ) : (
        <div style={{ maxHeight: 280, overflowY: 'auto', border: `1px solid ${C.border}`, borderRadius: 8 }}>
          {shown.length === 0 && <p style={{ margin: 0, padding: 12, fontSize: 12, color: C.muted }}>{(list || []).length ? 'No contacts match.' : 'No contacts yet. Use New chat to find teachers by @username and invite them.'}</p>}
          {shown.map((c) => {
            const on = selected.includes(c.id);
            const full = multiple && !on && selected.length >= max;
            return (
              <button key={c.id} type="button" disabled={full} onClick={() => onPick(c)}
                style={{ display: 'flex', width: '100%', textAlign: 'left', gap: 10, alignItems: 'center', padding: '8px 12px', border: 'none', borderBottom: `1px solid ${C.border}`, background: on ? 'rgba(45,106,79,0.12)' : 'transparent', color: C.text, cursor: full ? 'not-allowed' : 'pointer', opacity: full ? 0.5 : 1, fontFamily: 'inherit' }}>
                {multiple && <input type="checkbox" readOnly checked={on} style={{ accentColor: C.green }} />}
                <AvatarImage photoURL={c.photoURL} alt="" style={{ width: 30, height: 30, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: 13, fontWeight: 700 }}>@{c.username}</span>
                  <span style={{ display: 'block', fontSize: 11, color: C.muted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.school || 'School not set'}</span>
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

const RELATION_BUTTON = {
  none: 'Invite',
  invited: 'Invited',
  invited_me: 'Accept',
  contact: 'Message',
};

/**
 * Find any teacher by @username: results drop down as you type, most likely first,
 * with "Did you mean @ben?" for close spellings. Invite / Accept / Message per result.
 */
function PeopleSearch({ onMessage }) {
  const [q, setQ] = useState('');
  const [data, setData] = useState(null); // { query, results }
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [busyUid, setBusyUid] = useState('');
  const [states, setStates] = useState({}); // after Invite/Accept here
  const seq = useRef(0);

  const query = searchKey(q);
  const tooShort = query.length > 0 && query.length < SEARCH_MIN_CHARS;
  useEffect(() => {
    const mine = ++seq.current;
    if (query.length < SEARCH_MIN_CHARS) return undefined;
    const t = setTimeout(() => {
      setLoading(true);
      searchTeachers(query)
        .then((res) => { if (mine === seq.current) { setData(res); setError(''); } })
        .catch((e) => { if (mine === seq.current) setError(e?.message || 'Could not search right now.'); })
        .finally(() => { if (mine === seq.current) setLoading(false); });
    }, 300);
    return () => clearTimeout(t);
  }, [query]);

  async function act(r) {
    const state = states[r.uid] || r.state;
    if (state === 'invited') return;
    if (state === 'contact') { onMessage({ id: r.uid, ...r }); return; }
    setBusyUid(r.uid);
    setError('');
    try {
      const next = state === 'invited_me' ? await respondInvite(r.uid, true) : await sendInvite(r.uid);
      setStates((m) => ({ ...m, [r.uid]: next }));
    } catch (e) {
      setError(e?.message || 'That did not work. Please try again.');
    } finally {
      setBusyUid('');
    }
  }

  // Only results for what is typed now (older answers are never shown).
  const shown = query && data?.query === query ? data : null;
  const results = shown?.results || [];
  const top = results[0];
  const suggest = top && top.username !== shown.query && top.score < 0.75 ? top.username : '';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ position: 'relative' }}>
        <AtSign size={14} style={{ position: 'absolute', left: 10, top: 11, color: '#6E6455' }} />
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value.replace(/^@+/, ''))} placeholder="Search a username, e.g. ben"
          aria-label="Search teachers by username" style={{ ...input, paddingLeft: 30 }} />
        {loading && !tooShort && query && <Loader2 size={14} className="animate-spin" style={{ position: 'absolute', right: 10, top: 11, color: '#6E6455' }} />}
      </div>
      {error && <p style={{ margin: 0, fontSize: 12, color: C.red }}>{error}</p>}
      {tooShort && <p style={{ margin: 0, fontSize: 12, color: C.muted }}>Type at least {SEARCH_MIN_CHARS} characters of the username.</p>}
      {suggest && (
        <p style={{ margin: 0, fontSize: 12, color: C.muted }}>
          Did you mean{' '}
          <button type="button" onClick={() => setQ(suggest)} style={{ border: 'none', background: 'none', padding: 0, color: C.green, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', fontSize: 12 }}>@{suggest}</button>?
        </p>
      )}
      {shown && (
        <div role="listbox" aria-label="Matching teachers" style={{ maxHeight: 320, overflowY: 'auto', border: `1px solid ${C.border}`, borderRadius: 8, boxShadow: '0 6px 18px rgba(0,0,0,0.08)' }}>
          {!results.length && !loading && <p style={{ margin: 0, padding: 12, fontSize: 12, color: C.muted }}>No teacher has a username like @{shown.query}.</p>}
          {results.map((r) => {
            const state = states[r.uid] || r.state;
            const label = RELATION_BUTTON[state] || 'Invite';
            const primary = state === 'none' || state === 'invited_me' || state === 'contact';
            return (
              <div key={r.uid} role="option" aria-selected="false" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderBottom: `1px solid ${C.border}` }}>
                <AvatarImage photoURL={r.photoURL} alt="" style={{ width: 36, height: 36, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: 13, fontWeight: 700 }}>@{r.username}</span>
                  <span style={{ display: 'block', fontSize: 11.5, color: C.muted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.school || 'School not set'}</span>
                </span>
                <button type="button" onClick={() => act(r)} disabled={busyUid === r.uid || state === 'invited'}
                  title={state === 'invited' ? 'Waiting for them to accept' : state === 'invited_me' ? 'They invited you: accept to start messaging' : undefined}
                  style={{ ...(primary ? btnPrimary : btnGhost), padding: '5px 12px', fontSize: 12, opacity: busyUid === r.uid ? 0.6 : 1, cursor: state === 'invited' ? 'default' : 'pointer' }}>
                  {busyUid === r.uid ? <Loader2 size={12} className="animate-spin" /> : label}
                </button>
              </div>
            );
          })}
        </div>
      )}
      <p style={{ margin: 0, fontSize: 11.5, color: C.muted }}>Invite a teacher first. You can message each other once they accept.</p>
    </div>
  );
}

/** The bell: invites waiting for my answer, with Accept and Decline. */
function InviteBell({ me, invites, onAccepted }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const count = invites.length;
  const boxRef = useRef(null);

  // Clicking anywhere else closes the list.
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  async function answer(inv, accept, block = false) {
    setBusy(inv.from);
    setError('');
    try {
      if (block) {
        if (!window.confirm(`Block @${inv.fromUsername}? They will not be able to find you, invite you or message you.`)) return;
        await blockTeacher(me.uid, inv.from); // also declines this invite
      } else {
        await respondInvite(inv.from, accept);
      }
      if (accept) {
        setOpen(false);
        onAccepted?.(inv.from);
      }
    } catch (e) {
      setError(e?.message || 'That did not work. Please try again.');
    } finally {
      setBusy('');
    }
  }

  return (
    <span ref={boxRef} style={{ position: 'relative', display: 'inline-flex' }}>
      <button type="button" onClick={() => setOpen((v) => !v)} aria-label={count ? `${count} invite(s) waiting` : 'Invites'} title={count ? `${count} invite(s) waiting` : 'No invites'}
        style={{ ...btn, position: 'relative', padding: '3px 6px', background: 'transparent', color: count ? C.green : C.muted }}>
        <Bell size={15} />
        {count > 0 && <span style={{ position: 'absolute', top: -3, right: -4, minWidth: 15, height: 15, padding: '0 4px', borderRadius: 8, background: C.red, color: '#fff', fontSize: 9.5, fontWeight: 800, lineHeight: '15px', textAlign: 'center' }}>{count > 99 ? '99+' : count}</span>}
      </button>
      {open && (
        <div role="dialog" aria-label="Invites" style={{ position: 'absolute', right: 0, top: 'calc(100% + 6px)', zIndex: 30, width: 320, maxWidth: '86vw', background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, boxShadow: '0 10px 30px rgba(0,0,0,0.18)', color: C.text }}>
          <p style={{ margin: 0, padding: '10px 12px', fontSize: 12.5, fontWeight: 800, borderBottom: `1px solid ${C.border}` }}>Invites</p>
          {!count && <p style={{ margin: 0, padding: 12, fontSize: 12, color: C.muted }}>No invites right now.</p>}
          <div style={{ maxHeight: 320, overflowY: 'auto' }}>
            {invites.map((inv) => (
              <div key={inv.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderBottom: `1px solid ${C.border}` }}>
                <AvatarImage photoURL={inv.fromPhotoURL} alt="" style={{ width: 34, height: 34, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: 12.5, fontWeight: 700 }}>@{inv.fromUsername}</span>
                  <span style={{ display: 'block', fontSize: 11, color: C.muted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{inv.fromSchool || 'School not set'}</span>
                </span>
                <span style={{ display: 'flex', gap: 4 }}>
                  <button type="button" onClick={() => answer(inv, true)} disabled={busy === inv.from} style={{ ...btnPrimary, padding: '4px 10px', fontSize: 11.5 }}>
                    {busy === inv.from ? <Loader2 size={11} className="animate-spin" /> : 'Accept'}
                  </button>
                  <button type="button" onClick={() => answer(inv, false)} disabled={busy === inv.from} style={{ ...btnGhost, padding: '4px 8px', fontSize: 11.5 }}>Decline</button>
                  <button type="button" onClick={() => answer(inv, false, true)} disabled={busy === inv.from} title="Decline and block" aria-label={`Block @${inv.fromUsername}`} style={{ ...btnGhost, padding: '4px 6px', fontSize: 11.5, color: C.red }}><Ban size={12} /></button>
                </span>
              </div>
            ))}
          </div>
          {error && <p style={{ margin: 0, padding: '8px 12px', fontSize: 12, color: C.red }}>{error}</p>}
        </div>
      )}
    </span>
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

/** Message text with clickable http(s) links (opened outside the app, isolated). */
function Linkified({ text }) {
  const parts = String(text || '').split(/(\bhttps?:\/\/[^\s<>"']+[^\s<>"'.,;:!?)\]])/gi);
  return parts.map((part, i) => (/^https?:\/\//i.test(part)
    ? <a key={i} href={part} target="_blank" rel="noopener noreferrer" style={{ color: 'inherit', textDecoration: 'underline', wordBreak: 'break-all' }}>{part}</a>
    : <span key={i}>{part}</span>));
}

function useBlobUrl(cid, attachment, enabled = true) {
  const [state, setState] = useState({ url: '', error: '' });
  // Keyed on the file id: callers may pass a new object with the same file each render.
  const assetId = attachment?.assetId;
  const kind = attachment?.kind;
  useEffect(() => {
    if (!enabled || !assetId) return undefined;
    let alive = true;
    let url = '';
    fetchChatFile(cid, { assetId, kind })
      .then((blob) => { if (alive) { url = URL.createObjectURL(blob); setState({ url, error: '' }); } })
      .catch((e) => alive && setState({ url: '', error: e?.message || 'Could not load.' }));
    return () => { alive = false; if (url) URL.revokeObjectURL(url); };
  }, [cid, assetId, kind, enabled]);
  return state;
}

/** Open / Download / Save to my folder for one shared file. */
function useFileActions(cid, deskFiles, setError) {
  const [busy, setBusy] = useState('');
  const run = async (key, fn) => {
    setBusy(key);
    setError?.('');
    try { await fn(); } catch (e) { setError?.(e?.message || 'That did not work. Please try again.'); } finally { setBusy(''); }
  };
  return {
    busy,
    open: (a) => {
      if (deskFiles) {
        return run(`open-${a.assetId}`, async () => {
          const blob = await fetchChatFile(cid, a);
          const path = await deskFiles.save(a.name, new Uint8Array(await blob.arrayBuffer()));
          await deskFiles.open(path);
        });
      }
      const viewable = a.kind === 'image' || a.contentType === 'application/pdf';
      if (!viewable) {
        return run(`open-${a.assetId}`, async () => saveBlobAs(await fetchChatFile(cid, a, { download: true }), a.name));
      }
      // Open the tab now, on the click (a tab opened after the download is blocked as a pop-up).
      const tab = window.open('', '_blank');
      return run(`open-${a.assetId}`, async () => {
        try {
          const url = URL.createObjectURL(await fetchChatFile(cid, a));
          if (tab && !tab.closed) {
            tab.opener = null;
            tab.location.href = url;
          } else {
            saveBlobAs(await fetchChatFile(cid, a, { download: true }), a.name); // tab was blocked
          }
          setTimeout(() => URL.revokeObjectURL(url), 120000);
        } catch (err) {
          tab?.close();
          throw err;
        }
      });
    },
    download: (a) => run(`dl-${a.assetId}`, async () => saveBlobAs(await fetchChatFile(cid, a, { download: true }), a.name)),
    save: (a) => run(`save-${a.assetId}`, async () => {
      const blob = await fetchChatFile(cid, a, { download: true });
      const path = await deskFiles.save(a.name, new Uint8Array(await blob.arrayBuffer()));
      setError?.(`Saved to your folder: ${path}`);
    }),
  };
}

function FileIcon({ name }) {
  const ext = fileExtension(name);
  const label = ext === 'pdf' ? 'PDF' : ext.startsWith('doc') ? 'DOC' : ext.startsWith('xls') ? 'XLS' : ext.startsWith('ppt') ? 'PPT' : 'FILE';
  const color = ext === 'pdf' ? '#b91c1c' : ext.startsWith('doc') ? '#1d4ed8' : ext.startsWith('xls') ? '#15803d' : ext.startsWith('ppt') ? '#c2410c' : '#6E6455';
  return <span style={{ width: 36, height: 36, borderRadius: 8, background: `${color}18`, color, fontSize: 10, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{label}</span>;
}

function FileCard({ cid, attachment, deskFiles, setError, mine }) {
  const act = useFileActions(cid, deskFiles, setError);
  const a = attachment;
  const link = { ...btn, padding: '3px 8px', fontSize: 11, background: 'transparent', color: mine ? '#fff' : C.green, border: `1px solid ${mine ? 'rgba(255,255,255,0.5)' : C.border}` };
  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'center', minWidth: 220 }}>
      <FileIcon name={a.name} />
      <div style={{ minWidth: 0, flex: 1 }}>
        <p style={{ margin: 0, fontSize: 12.5, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={a.name}>{a.name}</p>
        <p style={{ margin: '1px 0 5px', fontSize: 11, opacity: 0.8 }}>{fileExtension(a.name).toUpperCase()} · {formatBytes(a.size)}</p>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <button style={link} disabled={Boolean(act.busy)} onClick={() => act.open(a)}>{act.busy === `open-${a.assetId}` ? 'Opening…' : 'Open'}</button>
          {deskFiles
            ? <button style={link} disabled={Boolean(act.busy)} onClick={() => act.save(a)}>{act.busy === `save-${a.assetId}` ? 'Saving…' : 'Save to my folder'}</button>
            : <button style={link} disabled={Boolean(act.busy)} onClick={() => act.download(a)}>{act.busy === `dl-${a.assetId}` ? 'Downloading…' : 'Download'}</button>}
        </div>
      </div>
    </div>
  );
}

function ImageThumb({ cid, attachment, onOpen, size = 220 }) {
  const { url, error } = useBlobUrl(cid, attachment);
  if (error) return <span style={{ fontSize: 11, opacity: 0.8 }}>Image unavailable ({error})</span>;
  if (!url) return <span style={{ display: 'inline-flex', width: size, height: Math.round(size * 0.66), alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.06)', borderRadius: 8 }}><Loader2 size={16} className="animate-spin" /></span>;
  return (
    <button onClick={() => onOpen(attachment)} title={attachment.name} style={{ padding: 0, border: 'none', background: 'transparent', cursor: 'zoom-in', display: 'block' }}>
      <img src={url} alt={attachment.name} style={{ maxWidth: size, maxHeight: size, borderRadius: 8, display: 'block', objectFit: 'cover' }} />
    </button>
  );
}

function Lightbox({ cid, attachment, deskFiles, onClose }) {
  const { url, error } = useBlobUrl(cid, attachment);
  const [msg, setMsg] = useState('');
  const act = useFileActions(cid, deskFiles, setMsg);
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 90, background: 'rgba(0,0,0,0.85)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 20, gap: 12 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ display: 'flex', gap: 8 }}>
        {deskFiles
          ? <button style={btnPrimary} onClick={() => act.save(attachment)}>{act.busy ? 'Saving…' : 'Save to my folder'}</button>
          : <button style={btnPrimary} onClick={() => act.download(attachment)}>{act.busy ? 'Downloading…' : 'Download'}</button>}
        <button style={{ ...btnGhost, color: '#fff', borderColor: 'rgba(255,255,255,0.4)' }} onClick={onClose}><X size={14} /> Close</button>
      </div>
      {msg && <p onClick={(e) => e.stopPropagation()} style={{ margin: 0, color: '#fff', fontSize: 12 }}>{msg}</p>}
      {error && <p style={{ color: '#fff' }}>{error}</p>}
      {url ? <img onClick={(e) => e.stopPropagation()} src={url} alt={attachment.name} style={{ maxWidth: '92vw', maxHeight: '80vh', borderRadius: 8 }} /> : !error && <Loader2 size={24} color="#fff" className="animate-spin" />}
    </div>
  );
}

/** KaTuroDesk: pick a file from the classroom folder to send. */
function FolderPicker({ deskFiles, onPick, onClose }) {
  const [filter, setFilter] = useState('');
  const files = useMemo(() => deskFiles.list().filter((f) => FILE_KINDS[fileExtension(f.name)]), [deskFiles]);
  const shown = files.filter((f) => !filter.trim() || f.path.toLowerCase().includes(filter.trim().toLowerCase())).slice(0, 300);
  return (
    <Modal title="Send a file from your folder" onClose={onClose} width={560}>
      <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter files" style={{ ...input, marginBottom: 8 }} />
      <div style={{ maxHeight: 340, overflowY: 'auto', border: `1px solid ${C.border}`, borderRadius: 8 }}>
        {!shown.length && <p style={{ margin: 0, padding: 12, fontSize: 12, color: C.muted }}>No Word, Excel, PowerPoint, PDF or image files in your folder.</p>}
        {shown.map((f) => (
          <button key={f.path} onClick={() => onPick(f)} style={{ display: 'flex', width: '100%', gap: 10, alignItems: 'center', textAlign: 'left', padding: '8px 12px', border: 'none', borderBottom: `1px solid ${C.border}`, background: 'transparent', color: C.text, cursor: 'pointer', fontFamily: 'inherit' }}>
            <FileIcon name={f.name} />
            <span style={{ minWidth: 0 }}>
              <span style={{ display: 'block', fontSize: 12.5, fontWeight: 700 }}>{f.name}</span>
              <span style={{ display: 'block', fontSize: 11, color: C.muted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{f.path}{f.size ? ` · ${formatBytes(f.size)}` : ''}</span>
            </span>
          </button>
        ))}
      </div>
    </Modal>
  );
}

/** Messenger-style chat info: about, mute/block, and Media / Files / Links. */
function ChatInfoPanel({ me, chat, members, blocked, deskFiles, onClose, onOpenImage, onTeamSettings }) {
  const [tab, setTab] = useState('media');
  const [count, setCount] = useState(30);
  const [items, setItems] = useState([]);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const otherUid = chat.type === 'dm' ? (chat.conv?.members || []).find((u) => u !== me.uid) : null;
  const other = useCardName(otherUid);
  const iBlocked = otherUid ? blocked.has(otherUid) : false;

  useEffect(() => subscribeAssets(chat.cid, tab, count, (list, more) => { setItems(list); setHasMore(more); }, () => setError('Could not load.')), [chat.cid, tab, count]);

  const run = async (fn) => {
    setBusy(true);
    setError('');
    try { await fn(); } catch (e) { setError(e?.message || 'That did not work.'); } finally { setBusy(false); }
  };

  const tabBtn = (id, label) => (
    <button key={id} onClick={() => { setTab(id); setCount(30); setItems([]); }} style={{ ...btn, flex: 1, justifyContent: 'center', padding: '6px 8px', fontSize: 12, background: tab === id ? C.green : 'transparent', color: tab === id ? '#fff' : C.text, border: `1px solid ${tab === id ? C.green : C.border}` }}>{label}</button>
  );

  return (
    <div className="kt-msg-info" style={{ borderLeft: `1px solid ${C.border}`, display: 'flex', flexDirection: 'column', minHeight: 0, background: C.card }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', borderBottom: `1px solid ${C.border}` }}>
        <strong style={{ fontSize: 13 }}>Chat info</strong>
        <button onClick={onClose} title="Close chat info" style={{ ...btn, padding: 4, background: 'transparent', color: C.muted }}><X size={15} /></button>
      </div>
      <div style={{ padding: 12, borderBottom: `1px solid ${C.border}`, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <p style={{ margin: 0, fontSize: 14, fontWeight: 800 }}><ChatTitle chat={chat} me={me} /></p>
        {chat.type === 'dm' && other && <p style={{ margin: 0, fontSize: 11.5, color: C.muted }}>@{other.username}{other.school ? ` · ${other.school}` : ''}</p>}
        {chat.type === 'team' && (
          <button onClick={onTeamSettings} style={{ ...btnGhost, justifyContent: 'center' }}><Users size={13} /> Members ({members.length}) and team settings</button>
        )}
        <button disabled={busy} onClick={() => run(() => setChatMuted(me.uid, chat.cid, !chat.muted))} style={{ ...btnGhost, justifyContent: 'center' }}>
          {chat.muted ? <><Bell size={13} /> Unmute notifications</> : <><BellOff size={13} /> Mute notifications</>}
        </button>
        {chat.type === 'dm' && otherUid && (
          <button disabled={busy} onClick={() => run(() => (iBlocked ? unblockTeacher(me.uid, otherUid) : blockTeacher(me.uid, otherUid)))} style={{ ...btnGhost, justifyContent: 'center', color: iBlocked ? C.text : C.red }}>
            <Ban size={13} /> {iBlocked ? 'Unblock this teacher' : 'Block this teacher'}
          </button>
        )}
      </div>
      <div style={{ display: 'flex', gap: 6, padding: '10px 12px' }}>
        {tabBtn('media', 'Media')}
        {tabBtn('files', 'Files')}
        {tabBtn('links', 'Links')}
      </div>
      {error && <p style={{ margin: '0 12px 6px', fontSize: 12, color: C.red }}>{error}</p>}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 12px 12px' }}>
        {!items.length && <p style={{ fontSize: 12, color: C.muted }}>{tab === 'media' ? 'No photos shared yet.' : tab === 'files' ? 'No files shared yet.' : 'No links shared yet.'}</p>}
        {tab === 'media' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 4 }}>
            {items.map((m) => <ImageThumb key={m.id} cid={chat.cid} attachment={{ ...m, assetId: m.id }} onOpen={onOpenImage} size={92} />)}
          </div>
        )}
        {tab === 'files' && items.map((f) => (
          <div key={f.id} style={{ padding: '8px 0', borderBottom: `1px solid ${C.border}` }}>
            <FileCard cid={chat.cid} attachment={{ ...f, assetId: f.id }} deskFiles={deskFiles} setError={setError} />
            <p style={{ margin: '4px 0 0 46px', fontSize: 10.5, color: C.muted }}>{f.senderName} · {when(f.createdAt)}</p>
          </div>
        ))}
        {tab === 'links' && items.map((l) => (
          <a key={l.id} href={l.url} target="_blank" rel="noopener noreferrer" style={{ display: 'block', padding: '8px 0', borderBottom: `1px solid ${C.border}`, textDecoration: 'none', color: C.text }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: 700 }}><ExternalLink size={12} /> {linkDomain(l.url) || 'Link'}</span>
            <span style={{ display: 'block', fontSize: 11, color: C.muted, wordBreak: 'break-all' }}>{l.url}</span>
            <span style={{ display: 'block', fontSize: 10.5, color: C.muted }}>{l.senderName} · {when(l.createdAt)}</span>
          </a>
        ))}
        {hasMore && <button onClick={() => setCount((n) => n + 30)} style={{ ...btnGhost, width: '100%', justifyContent: 'center', marginTop: 8, fontSize: 11 }}>Show more</button>}
      </div>
    </div>
  );
}

function Thread({ me, chat, blocked, deskFiles, onBack, onLeft }) {
  const [messages, setMessages] = useState([]);
  const [hasMore, setHasMore] = useState(false);
  const [count, setCount] = useState(50);
  const [members, setMembers] = useState([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [teamSettings, setTeamSettings] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [lightbox, setLightbox] = useState(null);
  const [upload, setUpload] = useState(null); // { name, progress, cancel }
  const [picking, setPicking] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [reporting, setReporting] = useState(null);
  const [reason, setReason] = useState('');
  const [reportDone, setReportDone] = useState(false);
  const fileInputRef = useRef(null);
  const endRef = useRef(null);
  const lastCountRef = useRef(0);
  const cid = chat.cid;
  const otherUid = chat.type === 'dm' ? (chat.conv?.members || []).find((u) => u !== me.uid) : null;
  const iBlocked = otherUid ? blocked.has(otherUid) : false;

  useEffect(() => subscribeMessages(cid, count, (list, more) => { setMessages(list); setHasMore(more); },
    (err) => setError(err?.code === 'permission-denied' ? 'You are no longer a member of this chat.' : 'Could not load messages.')), [cid, count]);

  useEffect(() => (chat.type === 'team' ? subscribeMembers(cid, setMembers, () => setMembers([])) : undefined), [cid, chat.type]);

  // Mark as read while the chat is open and visible (also when coming back to the window).
  useEffect(() => {
    const mark = () => {
      if (chat.unread && document.visibilityState === 'visible') markRead(me.uid, cid).catch(() => {});
    };
    mark();
    document.addEventListener('visibilitychange', mark);
    return () => document.removeEventListener('visibilitychange', mark);
  }, [chat.unread, cid, me.uid, messages.length]);

  useEffect(() => {
    if (messages.length > lastCountRef.current) endRef.current?.scrollIntoView({ block: 'end' });
    lastCountRef.current = messages.length;
  }, [messages]);

  const friendly = (err, fallback) => (err?.code === 'permission-denied' && chat.type === 'dm'
    ? 'You cannot send messages in this chat.'
    : (err?.message || fallback));

  async function send() {
    if (!text.trim() || sending || iBlocked) return;
    setSending(true);
    setError('');
    try {
      await sendMessage(cid, me, text);
      setText('');
    } catch (err) {
      setError(friendly(err, 'Message not sent. Check your connection and try again.'));
    } finally {
      setSending(false);
    }
  }

  async function sendFile(file) {
    if (!file || upload || iBlocked) return;
    const size = file.size ?? file.bytes?.byteLength ?? 0;
    const problem = fileProblem(file.name, size);
    if (problem) { setError(problem); return; }
    setError('');
    const task = uploadChatFile(cid, file, (p) => setUpload((u) => (u ? { ...u, progress: p } : u)));
    setUpload({ name: file.name, progress: 0, cancel: task.cancel });
    try {
      await task.promise;
    } catch (err) {
      if (!err?.cancelled) setError(err?.message || 'Upload failed. Please try again.');
    } finally {
      setUpload(null);
    }
  }

  async function sendFromFolder(entry) {
    setPicking(false);
    try {
      const { name, bytes } = await deskFiles.read(entry.path);
      await sendFile({ name, bytes, size: bytes.byteLength });
    } catch (err) {
      setError(err?.message || 'Could not read that file.');
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

  const composerLocked = iBlocked;

  return (
    <div className={`kt-msg-thread-wrap${showInfo ? ' with-info' : ''}`}>
      <div
        style={{ display: 'flex', flexDirection: 'column', height: '100%', minWidth: 0, position: 'relative' }}
        onDragOver={(e) => { if (!composerLocked && e.dataTransfer?.types?.includes('Files')) { e.preventDefault(); setDragging(true); } }}
        onDragLeave={(e) => { if (e.currentTarget === e.target) setDragging(false); }}
        onDrop={(e) => { e.preventDefault(); setDragging(false); if (!composerLocked) sendFile(e.dataTransfer?.files?.[0]); }}
      >
        {dragging && (
          <div style={{ position: 'absolute', inset: 0, zIndex: 5, background: 'rgba(45,106,79,0.12)', border: `2px dashed ${C.green}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, color: C.green, pointerEvents: 'none' }}>
            Drop a file to send it (Word, Excel, PowerPoint, PDF, images · up to 25 MB)
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderBottom: `1px solid ${C.border}` }}>
          <button onClick={onBack} className="kt-msg-back" title="Back to chats" style={{ ...btn, padding: 4, background: 'transparent', color: C.text }}><ArrowLeft size={16} /></button>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ margin: 0, fontSize: 14, fontWeight: 800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}><ChatTitle chat={chat} me={me} /></p>
            {chat.type === 'team' && <p style={{ margin: 0, fontSize: 11, color: C.muted }}>Team · {members.length} member{members.length === 1 ? '' : 's'}</p>}
          </div>
          <button onClick={() => setShowInfo((v) => !v)} title="Chat info: media, files and links" style={{ ...btnGhost, background: showInfo ? 'rgba(45,106,79,0.12)' : 'transparent' }}><Info size={13} /> Chat info</button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 6 }}>
          {hasMore && <button onClick={() => setCount((n) => n + 50)} style={{ ...btnGhost, alignSelf: 'center', fontSize: 11 }}>Load earlier messages</button>}
          {messages.length === 0 && !error && <p style={{ margin: 'auto', fontSize: 12, color: C.muted }}>No messages yet. Say hello.</p>}
          {messages.map((m) => {
            const mine = m.senderUid === me.uid;
            const a = !m.deleted ? m.attachment : null;
            return (
              <div key={m.id} className="kt-msg-row" style={{ display: 'flex', justifyContent: mine ? 'flex-end' : 'flex-start' }}>
                <div style={{ maxWidth: '78%', minWidth: 0 }}>
                  {!mine && chat.type === 'team' && <p style={{ margin: '0 0 2px 4px', fontSize: 11, fontWeight: 700, color: C.muted }}>{m.senderName}</p>}
                  {a?.kind === 'image' ? (
                    <ImageThumb cid={cid} attachment={a} onOpen={setLightbox} />
                  ) : (
                    <div style={{ background: mine ? C.green : 'rgba(0,0,0,0.06)', color: mine ? '#fff' : C.text, borderRadius: 12, padding: '7px 11px', fontSize: 13, lineHeight: 1.45, whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontStyle: m.deleted ? 'italic' : 'normal', opacity: m.deleted ? 0.7 : 1 }}>
                      {m.deleted ? 'Message deleted' : a ? <FileCard cid={cid} attachment={a} deskFiles={deskFiles} setError={setError} mine={mine} /> : <Linkified text={m.text} />}
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: 8, justifyContent: mine ? 'flex-end' : 'flex-start', alignItems: 'center', margin: '2px 4px 0' }}>
                    <span style={{ fontSize: 10, color: C.muted }}>{when(m.createdAt)}</span>
                    {!m.deleted && (mine ? (
                      <button className="kt-msg-action" title={a ? 'Delete message and file' : 'Delete message'} onClick={() => deleteMyMessage(cid, m.id).catch((e) => setError(e?.message || 'Could not delete.'))} style={{ ...btn, padding: 0, background: 'transparent', color: C.muted }}><Trash2 size={11} /></button>
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

        {error && <p style={{ margin: 0, padding: '6px 14px', fontSize: 12, color: error.startsWith('Saved to your folder') ? C.green : C.red }}>{error}</p>}
        {upload && (
          <div style={{ padding: '6px 14px', display: 'flex', alignItems: 'center', gap: 10, fontSize: 12 }}>
            <span style={{ flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {(upload.progress || 0) >= 1 ? `Processing ${upload.name}…` : `Sending ${upload.name}… ${Math.round((upload.progress || 0) * 100)}%`}
            </span>
            <span style={{ width: 120, height: 6, borderRadius: 6, background: 'rgba(0,0,0,0.1)', overflow: 'hidden' }}><span style={{ display: 'block', height: '100%', width: `${Math.round((upload.progress || 0) * 100)}%`, background: C.green }} /></span>
            {(upload.progress || 0) < 1 && (
              <button onClick={() => upload.cancel()} style={{ ...btn, padding: '2px 8px', fontSize: 11, background: 'transparent', color: C.red, border: `1px solid ${C.border}` }}>Cancel</button>
            )}
          </div>
        )}
        {composerLocked ? (
          <div style={{ padding: 12, borderTop: `1px solid ${C.border}`, fontSize: 12.5, color: C.muted, display: 'flex', gap: 10, alignItems: 'center', justifyContent: 'center' }}>
            You blocked this teacher. Unblock them in Chat info to send messages.
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 8, padding: 10, borderTop: `1px solid ${C.border}`, alignItems: 'flex-end' }}>
            <input ref={fileInputRef} type="file" accept={FILE_ACCEPT} hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; sendFile(f); }} />
            <button onClick={() => fileInputRef.current?.click()} disabled={Boolean(upload)} title="Attach a file (Word, Excel, PowerPoint, PDF, images · up to 25 MB)" style={{ ...btnGhost, padding: 8 }}><Paperclip size={15} /></button>
            {deskFiles && <button onClick={() => setPicking(true)} disabled={Boolean(upload)} title="Send a file from your classroom folder" style={{ ...btnGhost, padding: 8 }}><FolderOpen size={15} /></button>}
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
        )}
        {text.length > MAX_MESSAGE_LENGTH - 300 && <p style={{ margin: '0 0 6px 14px', fontSize: 11, color: C.muted }}>{text.length} / {MAX_MESSAGE_LENGTH}</p>}
      </div>

      {showInfo && (
        <ChatInfoPanel me={me} chat={chat} members={members} blocked={blocked} deskFiles={deskFiles}
          onClose={() => setShowInfo(false)} onOpenImage={setLightbox} onTeamSettings={() => setTeamSettings(true)} />
      )}

      {teamSettings && chat.type === 'team' && <TeamInfo me={me} chat={chat} members={members} onClose={() => setTeamSettings(false)} onLeft={() => { setTeamSettings(false); onLeft(); }} />}
      {lightbox && <Lightbox cid={cid} attachment={lightbox} deskFiles={deskFiles} onClose={() => setLightbox(null)} />}
      {picking && deskFiles && <FolderPicker deskFiles={deskFiles} onPick={sendFromFolder} onClose={() => setPicking(false)} />}
      {reporting && (
        <Modal title="Report message" onClose={() => setReporting(null)}>
          {reportDone ? (
            <>
              <p style={{ margin: '0 0 12px', fontSize: 13 }}>Thank you. The kaTuro admin will review it.</p>
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}><button onClick={() => setReporting(null)} style={btnPrimary}>Done</button></div>
            </>
          ) : (
            <>
              <p style={{ margin: '0 0 8px', fontSize: 12, color: C.muted }}>“{String(reporting.text || reporting.attachment?.name || '').slice(0, 200)}”</p>
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

export default function MessagesPanel({ user, onOpenChatChange, deskFiles = null, height = '100%' }) {
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
  const { chats, invites, ready, error } = useChats(me ? uid : null);
  const [blocked, setBlocked] = useState(() => new Set());
  useEffect(() => (me && uid ? subscribeBlocks(uid, setBlocked) : undefined), [me, uid]);

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
        <p style={{ margin: '0 0 14px', fontSize: 13, color: C.muted }}>Teachers find and invite you by your username. Each username belongs to one teacher only.</p>
        <UsernameForm uid={uid} onDone={(entry) => setMe(entry)} />
      </div>
    );
  }

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
      setDialogError(err?.code === 'permission-denied' ? 'You can message this teacher once they accept your invite.' : (err?.message || 'Could not open the chat.'));
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
      if (failed.length) setDialogError(`${failed.length} teacher(s) could not be added (only your contacts can be added).`);
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
        .kt-msg-thread-wrap { display: grid; grid-template-columns: 1fr; height: 100%; min-height: 0; }
        .kt-msg-thread-wrap.with-info { grid-template-columns: 1fr 300px; }
        @media (max-width: 1100px) {
          .kt-msg-thread-wrap.with-info { grid-template-columns: 1fr; position: relative; }
          .kt-msg-thread-wrap.with-info .kt-msg-info { position: absolute; inset: 0; z-index: 6; }
        }
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
        <InviteBell me={me} invites={invites} onAccepted={(fromUid) => startDm({ id: fromUid })} />
        <button onClick={() => setDialog('username')} style={{ ...btn, padding: '2px 6px', background: 'transparent', color: C.green }}>@{me.username}</button>
      </div>

      <div className={`kt-msg-layout${openChat ? ' has-open' : ''}`}>
        <div className="kt-msg-list" style={{ borderRight: `1px solid ${C.border}`, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <div style={{ padding: 10, display: 'flex', flexDirection: 'column', gap: 8, borderBottom: `1px solid ${C.border}` }}>
            <div style={{ display: 'flex', gap: 6 }}>
              <button onClick={() => { setDialog('dm'); setDialogError(''); }} style={{ ...btnPrimary, flex: 1, justifyContent: 'center' }}><Plus size={13} /> New chat</button>
              <button onClick={() => { setDialog('team'); setDialogError(''); }} style={{ ...btnGhost, flex: 1, justifyContent: 'center' }}><Users size={13} /> New team</button>
            </div>
            <div style={{ position: 'relative' }}>
              <Search size={13} style={{ position: 'absolute', left: 10, top: 10, color: '#6E6455' }} />
              <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Search chats" style={{ ...input, paddingLeft: 28, padding: '7px 10px 7px 28px' }} />
            </div>
          </div>
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {!ready && <p style={{ padding: 14, fontSize: 12, color: C.muted }}><Loader2 size={12} className="animate-spin" style={{ display: 'inline' }} /> Loading chats…</p>}
            {error && <p style={{ padding: 14, fontSize: 12, color: C.red }}>{error}</p>}
            {ready && !visible.length && !error && <p style={{ padding: 14, fontSize: 12, color: C.muted }}>{chats.length ? 'No chats match.' : 'No chats yet. Use New chat to find a teacher by @username and invite them.'}</p>}
            {visible.map((c) => (
              <button key={c.cid} onClick={() => setOpenCid(c.cid)}
                style={{ display: 'flex', width: '100%', gap: 8, textAlign: 'left', padding: '10px 12px', border: 'none', borderBottom: `1px solid ${C.border}`, background: c.cid === openCid ? 'rgba(45,106,79,0.12)' : 'transparent', color: C.text, cursor: 'pointer', fontFamily: 'inherit' }}>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 13, fontWeight: c.unread ? 800 : 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}><ChatTitle chat={c} me={me} /></span>
                    {c.type === 'team' && <span style={{ fontSize: 9, fontWeight: 800, color: C.muted, border: `1px solid ${C.border}`, borderRadius: 4, padding: '0 4px' }}>TEAM</span>}
                    {c.muted && <BellOff size={11} color="#6E6455" aria-label="Muted" />}
                  </span>
                  <span style={{ display: 'block', fontSize: 11.5, color: C.muted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {c.conv?.lastMessage ? `${c.conv.lastMessage.senderUid === me.uid ? 'You' : c.conv.lastMessage.senderName}: ${c.conv.lastMessage.text}` : 'No messages yet'}
                  </span>
                </span>
                <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                  <span style={{ fontSize: 10, color: C.muted }}>{when(c.conv?.lastMessageAt)}</span>
                  {c.unread && <span title={c.muted ? 'Unread (muted)' : 'Unread'} style={{ width: 9, height: 9, borderRadius: 9, background: c.muted ? '#9ca3af' : C.green }} />}
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="kt-msg-thread" style={{ minHeight: 0, minWidth: 0 }}>
          {openChat ? (
            <Thread key={openChat.cid} me={me} chat={openChat} blocked={blocked} deskFiles={deskFiles} onBack={() => setOpenCid(null)} onLeft={() => setOpenCid(null)} />
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
        <Modal title="Find a teacher" onClose={() => setDialog(null)}>
          <PeopleSearch onMessage={(card) => !busy && startDm(card)} />
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
