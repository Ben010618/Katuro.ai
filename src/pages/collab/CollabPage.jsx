import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../../firebase';
import { useAuth } from '../../hooks/useAuth';
import ktLogo from '../../assets/KT Favicon.png';
import {
  Hash, Plus, ChevronDown, X, Send, AtSign,
  Settings, LogOut, Loader2, Search, MessageCircle,
  Volume2, Crown, Wifi, WifiOff, BookOpen, Camera,
  Copy, Check, UserPlus, ArrowLeft,
} from 'lucide-react';
import {
  COMMUNITY_ID, STATUSES,
  ensureCommunityChannel, subscribeToMyChannels,
  subscribeToChannelMessages, sendChannelMessage,
  createChannel, joinByInviteCode,
  dmId, openOrCreateDM, subscribeToMyDMs,
  subscribeToDMMessages, sendDM,
  uploadProfilePhoto, setStatus, fetchAllTeachers,
} from '../../services/collabService';

// ── Colour tokens (Discord-inspired, kaTuro branded) ─────────────────────────
const C = {
  bg:        '#1e2124',
  sidebar:   '#2b2d31',
  channel:   '#313338',
  input:     '#383a40',
  hover:     '#35373c',
  active:    '#404249',
  text:      '#f2f3f5',
  muted:     '#96989d',
  green:     '#00c974',
  mention:   'rgba(0,201,116,0.15)',
  ai:        '#5865f2',
  aiBg:      'rgba(88,101,242,0.08)',
  border:    'rgba(255,255,255,0.06)',
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function statusColor(s) {
  return STATUSES.find(x => x.key === s)?.color ?? C.muted;
}

function formatTime(ts) {
  if (!ts) return '';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' });
}

function formatDate(ts) {
  if (!ts) return '';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  const today = new Date();
  if (d.toDateString() === today.toDateString()) return 'Today';
  const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString('en-PH', { month: 'long', day: 'numeric', year: 'numeric' });
}

function renderText(text) {
  // Bold **text**, @KaTuro highlight, basic escaping
  return text
    .split(/(\*\*[^*]+\*\*|@KaTuro)/g)
    .map((part, i) => {
      if (part.startsWith('**') && part.endsWith('**'))
        return <strong key={i}>{part.slice(2, -2)}</strong>;
      if (part === '@KaTuro')
        return <span key={i} style={{ background: C.mention, color: C.green, borderRadius: 3, padding: '0 3px', fontWeight: 700 }}>@KaTuro</span>;
      return part;
    });
}

// ── Avatar ────────────────────────────────────────────────────────────────────

function Avatar({ photoURL, name, size = 36, isAI, status }) {
  const initials = isAI ? 'KT' : (name || '?').split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  return (
    <div style={{ position: 'relative', flexShrink: 0 }}>
      <div style={{
        width: size, height: size, borderRadius: '50%', flexShrink: 0,
        background: isAI ? C.ai : '#2d6a4f',
        backgroundImage: photoURL ? `url(${photoURL})` : undefined,
        backgroundSize: 'cover', backgroundPosition: 'center',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: size * 0.35, fontWeight: 700, color: '#fff',
        fontFamily: '"Plus Jakarta Sans", sans-serif',
      }}>
        {!photoURL && initials}
        {isAI && !photoURL && <img src={ktLogo} alt="" style={{ width: size * 0.75, height: size * 0.75, objectFit: 'cover', borderRadius: '50%' }} />}
      </div>
      {status && (
        <div style={{
          position: 'absolute', bottom: -1, right: -1,
          width: size * 0.35, height: size * 0.35, borderRadius: '50%',
          background: statusColor(status), border: `2px solid ${C.sidebar}`,
        }} />
      )}
    </div>
  );
}

// ── Message bubble ────────────────────────────────────────────────────────────

function Msg({ msg, showHeader, myUid }) {
  const isMe = msg.uid === myUid;
  const isAI = msg.isAI;
  return (
    <div style={{
      display: 'flex', gap: 12, padding: showHeader ? '14px 16px 2px' : '2px 16px 2px',
      background: isAI ? C.aiBg : 'transparent',
      borderLeft: isAI ? `3px solid ${C.ai}` : '3px solid transparent',
    }}>
      {showHeader
        ? <Avatar photoURL={msg.photoURL} name={msg.displayName} size={36} isAI={isAI} />
        : <div style={{ width: 36, flexShrink: 0 }} />
      }
      <div style={{ flex: 1, minWidth: 0 }}>
        {showHeader && (
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 2 }}>
            <span style={{
              fontSize: 14, fontWeight: 700,
              color: isAI ? C.ai : (isMe ? C.green : C.text),
            }}>{msg.displayName}</span>
            {isAI && (
              <span style={{ fontSize: 9, fontWeight: 700, background: C.ai, color: '#fff', borderRadius: 3, padding: '1px 4px', letterSpacing: '0.06em' }}>
                BOT
              </span>
            )}
            <span style={{ fontSize: 11, color: C.muted }}>{formatTime(msg.createdAt)}</span>
          </div>
        )}
        <p style={{ margin: 0, fontSize: 14, color: C.text, lineHeight: 1.6, wordBreak: 'break-word' }}>
          {renderText(msg.text)}
        </p>
      </div>
    </div>
  );
}

// ── Message area (shared for channels & DMs) ──────────────────────────────────

function MessageArea({ messages, myUid, placeholder, onSend, aiLoading, headerSlot }) {
  const [text, setText]         = useState('');
  const [sending, setSending]   = useState(false);
  const bottomRef = useRef(null);
  const textareaRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function handleSend() {
    const t = text.trim();
    if (!t || sending) return;
    setText('');
    setSending(true);
    try { await onSend(t); } finally { setSending(false); }
    textareaRef.current?.focus();
  }

  function handleKey(e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  }

  // Group consecutive messages from same user
  const grouped = messages.map((msg, i) => ({
    ...msg,
    showHeader: i === 0 || messages[i - 1].uid !== msg.uid ||
      (msg.createdAt && messages[i - 1].createdAt &&
       (msg.createdAt?.toMillis?.() ?? 0) - (messages[i - 1].createdAt?.toMillis?.() ?? 0) > 5 * 60 * 1000),
  }));

  // Date dividers
  const withDividers = [];
  let lastDate = '';
  grouped.forEach(msg => {
    const d = msg.createdAt ? formatDate(msg.createdAt) : '';
    if (d && d !== lastDate) {
      withDividers.push({ type: 'divider', label: d, id: `div-${d}` });
      lastDate = d;
    }
    withDividers.push({ type: 'msg', ...msg });
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: C.channel }}>
      {/* Channel/DM header */}
      {headerSlot}

      {/* Messages */}
      <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 8 }}>
        {messages.length === 0 && (
          <div style={{ padding: 40, textAlign: 'center', color: C.muted, fontSize: 14 }}>
            <MessageCircle size={40} style={{ opacity: 0.3, marginBottom: 12 }} />
            <p style={{ margin: 0 }}>No messages yet — be the first to say hello! 👋</p>
          </div>
        )}
        {withDividers.map(item =>
          item.type === 'divider' ? (
            <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 16px 4px', color: C.muted, fontSize: 11, fontWeight: 600 }}>
              <div style={{ flex: 1, height: 1, background: C.border }} />
              <span>{item.label}</span>
              <div style={{ flex: 1, height: 1, background: C.border }} />
            </div>
          ) : (
            <Msg key={item.id} msg={item} showHeader={item.showHeader} myUid={myUid} />
          )
        )}
        {aiLoading && (
          <div style={{ display: 'flex', gap: 12, padding: '14px 16px', background: C.aiBg, borderLeft: `3px solid ${C.ai}` }}>
            <Avatar name="KaTuro AI" size={36} isAI />
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: C.muted, fontSize: 13 }}>
              <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />
              KaTuro AI is thinking…
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div style={{ padding: '0 16px 16px' }}>
        <div style={{
          display: 'flex', alignItems: 'flex-end', gap: 8,
          background: C.input, borderRadius: 10, padding: '10px 14px',
        }}>
          <textarea
            ref={textareaRef}
            value={text}
            onChange={e => { setText(e.target.value); e.target.style.height = 'auto'; e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px'; }}
            onKeyDown={handleKey}
            placeholder={placeholder}
            rows={1}
            style={{
              flex: 1, background: 'none', border: 'none', outline: 'none', resize: 'none',
              color: C.text, fontSize: 14, fontFamily: '"Plus Jakarta Sans", sans-serif',
              lineHeight: 1.5, maxHeight: 120, overflowY: 'auto',
              '::placeholder': { color: C.muted },
            }}
          />
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <span style={{ fontSize: 10, color: C.muted }}>
              <AtSign size={13} style={{ verticalAlign: 'middle' }} /> KaTuro
            </span>
            <button
              onClick={handleSend}
              disabled={!text.trim() || sending}
              style={{
                background: text.trim() ? C.green : C.hover,
                border: 'none', borderRadius: 7, padding: '6px 12px',
                cursor: text.trim() ? 'pointer' : 'default',
                display: 'flex', alignItems: 'center', gap: 4,
                color: text.trim() ? '#fff' : C.muted,
                transition: 'background 0.15s',
              }}
            >
              <Send size={14} />
            </button>
          </div>
        </div>
        <p style={{ margin: '4px 0 0', fontSize: 10, color: C.muted, paddingLeft: 2 }}>
          Enter to send · Shift+Enter for new line · @KaTuro to ask AI
        </p>
      </div>
    </div>
  );
}

// ── Create Channel Modal ──────────────────────────────────────────────────────

function CreateChannelModal({ uid, onCreated, onClose }) {
  const [name, setName]   = useState('');
  const [desc, setDesc]   = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');
  const [done, setDone]       = useState(null); // { id, inviteCode }
  const [copied, setCopied]   = useState(false);

  async function handleCreate() {
    if (!name.trim()) { setError('Channel name is required.'); return; }
    setLoading(true); setError('');
    try {
      const result = await createChannel(uid, { name: name.trim(), description: desc.trim() });
      setDone(result);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }

  async function copy() {
    await navigator.clipboard.writeText(done.inviteCode);
    setCopied(true); setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: C.sidebar, borderRadius: 16, padding: 28, width: '100%', maxWidth: 420 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: C.text, fontFamily: '"Plus Jakarta Sans", sans-serif' }}>
            {done ? '✅ Channel Created!' : 'Create Channel'}
          </h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.muted }}><X size={18} /></button>
        </div>

        {!done ? (
          <>
            <label style={{ display: 'block', marginBottom: 6, fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Channel Name</label>
            <div style={{ display: 'flex', alignItems: 'center', background: C.input, borderRadius: 8, padding: '10px 12px', marginBottom: 12 }}>
              <Hash size={14} color={C.muted} style={{ marginRight: 6 }} />
              <input
                value={name} onChange={e => setName(e.target.value)}
                placeholder="e.g. math-department"
                style={{ background: 'none', border: 'none', outline: 'none', flex: 1, color: C.text, fontSize: 14, fontFamily: '"Plus Jakarta Sans", sans-serif' }}
                autoFocus
              />
            </div>
            <label style={{ display: 'block', marginBottom: 6, fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Description (optional)</label>
            <input
              value={desc} onChange={e => setDesc(e.target.value)}
              placeholder="What's this channel for?"
              style={{ width: '100%', boxSizing: 'border-box', background: C.input, border: 'none', outline: 'none', borderRadius: 8, padding: '10px 12px', color: C.text, fontSize: 14, fontFamily: '"Plus Jakarta Sans", sans-serif', marginBottom: 16 }}
            />
            {error && <p style={{ color: '#f87171', fontSize: 12, marginBottom: 12 }}>{error}</p>}
            <button onClick={handleCreate} disabled={loading} style={{ width: '100%', padding: '12px', borderRadius: 9, border: 'none', background: C.green, color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer', fontFamily: '"Plus Jakarta Sans", sans-serif', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, opacity: loading ? 0.7 : 1 }}>
              {loading ? <><Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> Creating…</> : 'Create Channel'}
            </button>
          </>
        ) : (
          <>
            <p style={{ color: C.muted, fontSize: 14, marginBottom: 20 }}>Share this invite code so others can join <strong style={{ color: C.text }}># {name}</strong></p>
            <div style={{ display: 'flex', gap: 8, background: C.input, borderRadius: 9, padding: '12px 14px', marginBottom: 20, alignItems: 'center' }}>
              <span style={{ flex: 1, fontFamily: '"DM Mono", monospace', fontSize: 22, fontWeight: 700, color: C.green, letterSpacing: '0.12em' }}>{done.inviteCode}</span>
              <button onClick={copy} style={{ background: 'none', border: 'none', cursor: 'pointer', color: copied ? C.green : C.muted }}>
                {copied ? <Check size={18} /> : <Copy size={18} />}
              </button>
            </div>
            <button onClick={() => { onCreated(done); onClose(); }} style={{ width: '100%', padding: '12px', borderRadius: 9, border: 'none', background: C.green, color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer', fontFamily: '"Plus Jakarta Sans", sans-serif' }}>
              Go to Channel
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ── Join by Invite Code Modal ─────────────────────────────────────────────────

function JoinModal({ uid, onJoined, onClose }) {
  const [code, setCode]     = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');

  async function handleJoin() {
    if (!code.trim()) return;
    setLoading(true); setError('');
    try {
      const ch = await joinByInviteCode(uid, code);
      onJoined(ch.id);
      onClose();
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: C.sidebar, borderRadius: 16, padding: 28, width: '100%', maxWidth: 380 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: C.text, fontFamily: '"Plus Jakarta Sans", sans-serif' }}>Join a Channel</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.muted }}><X size={18} /></button>
        </div>
        <label style={{ display: 'block', marginBottom: 6, fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Invite Code</label>
        <input
          value={code} onChange={e => setCode(e.target.value.toUpperCase())}
          placeholder="e.g. A3B7C9D2"
          maxLength={8}
          style={{ width: '100%', boxSizing: 'border-box', background: C.input, border: 'none', outline: 'none', borderRadius: 8, padding: '12px', color: C.green, fontSize: 20, fontWeight: 700, fontFamily: '"DM Mono", monospace', letterSpacing: '0.12em', marginBottom: 12 }}
          autoFocus
          onKeyDown={e => e.key === 'Enter' && handleJoin()}
        />
        {error && <p style={{ color: '#f87171', fontSize: 12, marginBottom: 8 }}>{error}</p>}
        <button onClick={handleJoin} disabled={loading || !code.trim()} style={{ width: '100%', padding: '12px', borderRadius: 9, border: 'none', background: C.green, color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer', fontFamily: '"Plus Jakarta Sans", sans-serif', opacity: (loading || !code.trim()) ? 0.6 : 1 }}>
          {loading ? 'Joining…' : 'Join Channel'}
        </button>
      </div>
    </div>
  );
}

// ── DM User Picker ────────────────────────────────────────────────────────────

function DMPicker({ myUid, myProfile, onDMOpen, onClose }) {
  const [teachers, setTeachers] = useState([]);
  const [search, setSearch]     = useState('');
  const [loading, setLoading]   = useState(true);

  useEffect(() => {
    fetchAllTeachers().then(list => {
      setTeachers(list.filter(t => t.id !== myUid));
      setLoading(false);
    });
  }, [myUid]);

  const filtered = teachers.filter(t =>
    (t.displayName || t.email || '').toLowerCase().includes(search.toLowerCase()) ||
    (t.school || '').toLowerCase().includes(search.toLowerCase())
  );

  async function handleSelect(t) {
    const id = await openOrCreateDM(myUid, t.id,
      { name: myProfile?.displayName || '', photoURL: myProfile?.photoURL || null },
      { name: t.displayName || t.email || '', photoURL: t.photoURL || null }
    );
    onDMOpen(id, t);
    onClose();
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: C.sidebar, borderRadius: 16, padding: 24, width: '100%', maxWidth: 400, maxHeight: '70vh', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: C.text, fontFamily: '"Plus Jakarta Sans", sans-serif' }}>New Message</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.muted }}><X size={18} /></button>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: C.input, borderRadius: 8, padding: '8px 12px', marginBottom: 12 }}>
          <Search size={14} color={C.muted} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search teachers…"
            style={{ background: 'none', border: 'none', outline: 'none', flex: 1, color: C.text, fontSize: 14, fontFamily: '"Plus Jakarta Sans", sans-serif' }}
            autoFocus
          />
        </div>
        <div style={{ overflowY: 'auto', flex: 1 }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: 24, color: C.muted }}>
              <Loader2 size={20} style={{ animation: 'spin 1s linear infinite' }} />
            </div>
          ) : filtered.length === 0 ? (
            <p style={{ color: C.muted, fontSize: 13, textAlign: 'center', padding: 16 }}>No teachers found</p>
          ) : filtered.map(t => (
            <button key={t.id} onClick={() => handleSelect(t)} style={{
              width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px',
              background: 'none', border: 'none', cursor: 'pointer', borderRadius: 8,
              textAlign: 'left', color: C.text,
            }}
              onMouseEnter={e => e.currentTarget.style.background = C.hover}
              onMouseLeave={e => e.currentTarget.style.background = 'none'}
            >
              <Avatar photoURL={t.photoURL} name={t.displayName || t.email} size={32} status={t.status} />
              <div>
                <p style={{ margin: 0, fontSize: 13, fontWeight: 600 }}>{t.displayName || t.email}</p>
                {t.school && <p style={{ margin: 0, fontSize: 11, color: C.muted }}>{t.school}</p>}
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Invite Code Display Modal ─────────────────────────────────────────────────

function InviteModal({ channel, onClose }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    await navigator.clipboard.writeText(channel.inviteCode);
    setCopied(true); setTimeout(() => setCopied(false), 2000);
  }
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: C.sidebar, borderRadius: 16, padding: 28, width: '100%', maxWidth: 380 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: C.text, fontFamily: '"Plus Jakarta Sans", sans-serif' }}>Invite to #{channel.name}</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.muted }}><X size={18} /></button>
        </div>
        <p style={{ color: C.muted, fontSize: 13, marginBottom: 20 }}>Share this code with other teachers to let them join.</p>
        <div style={{ display: 'flex', gap: 8, background: C.input, borderRadius: 9, padding: '12px 14px', alignItems: 'center' }}>
          <span style={{ flex: 1, fontFamily: '"DM Mono", monospace', fontSize: 26, fontWeight: 700, color: C.green, letterSpacing: '0.15em' }}>{channel.inviteCode}</span>
          <button onClick={copy} style={{ background: 'none', border: 'none', cursor: 'pointer', color: copied ? C.green : C.muted }}>
            {copied ? <Check size={20} /> : <Copy size={20} />}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main CollabPage ───────────────────────────────────────────────────────────

export default function CollabPage() {
  const navigate             = useNavigate();
  const { user, profile }    = useAuth();
  const uid                  = user?.uid;
  const myName               = profile?.displayName || user?.displayName || user?.email?.split('@')[0] || 'Teacher';
  const myPhoto              = profile?.photoURL    || user?.photoURL    || null;
  const myStatus             = profile?.status || 'online';
  const mySchool             = profile?.school || '';

  const [channels,        setChannels]        = useState([]);
  const [dms,             setDms]             = useState([]);
  const [activeChannel,   setActiveChannel]   = useState(COMMUNITY_ID);
  const [activeDM,        setActiveDM]        = useState(null);   // dmId
  const [activeDMPeer,    setActiveDMPeer]    = useState(null);   // peer info
  const [messages,        setMessages]        = useState([]);
  const [msgLoading,      setMsgLoading]      = useState(true);
  const [aiLoading,       setAiLoading]       = useState(false);
  const [modal,           setModal]           = useState(null);   // 'create'|'join'|'dm-picker'|{type:'invite',channel}
  const [statusOpen,      setStatusOpen]      = useState(false);
  const photoInputRef = useRef(null);

  // Bootstrap + subscriptions
  useEffect(() => {
    if (!uid) return;
    ensureCommunityChannel().catch(() => {});
    const unsub = subscribeToMyChannels(uid, setChannels);
    return unsub;
  }, [uid]);

  useEffect(() => {
    if (!uid) return;
    const unsub = subscribeToMyDMs(uid, setDms);
    return unsub;
  }, [uid]);

  // Message subscription
  useEffect(() => {
    if (!uid) return;
    setMessages([]); setMsgLoading(true);
    let unsub;
    if (activeDM) {
      unsub = subscribeToDMMessages(activeDM, msgs => { setMessages(msgs); setMsgLoading(false); });
    } else if (activeChannel) {
      unsub = subscribeToChannelMessages(activeChannel, msgs => { setMessages(msgs); setMsgLoading(false); });
    }
    return () => unsub?.();
  }, [uid, activeChannel, activeDM]);

  // ── Handlers ──────────────────────────────────────────────────────────────

  async function handleSend(text) {
    const mentions = /@KaTuro/i.test(text);
    if (activeDM) {
      await sendDM(activeDM, { uid, displayName: myName, photoURL: myPhoto, text });
    } else {
      await sendChannelMessage(activeChannel, { uid, displayName: myName, photoURL: myPhoto, text });
    }
    if (mentions) {
      setAiLoading(true);
      try {
        const fn = httpsCallable(functions, 'collabAIReply');
        await fn({ channelId: activeDM ? null : activeChannel, dmId: activeDM || null, messageText: text });
      } catch (_e) {
      } finally { setAiLoading(false); }
    }
  }

  async function handlePhotoUpload(e) {
    const file = e.target.files?.[0];
    if (!file || !uid) return;
    try { await uploadProfilePhoto(uid, file); } catch (_e) {}
  }

  async function handleStatus(s) {
    setStatusOpen(false);
    await setStatus(uid, s);
  }

  function selectChannel(id) {
    setActiveChannel(id);
    setActiveDM(null);
    setActiveDMPeer(null);
  }

  function selectDM(id, dm) {
    const peer = dm.participants.find(p => p !== uid);
    const info = dm.participantInfo?.[peer] ?? {};
    setActiveDM(id);
    setActiveDMPeer({ uid: peer, ...info });
    setActiveChannel(null);
  }

  const activeChannelObj = channels.find(c => c.id === activeChannel);

  // ── Sidebar ────────────────────────────────────────────────────────────────

  function SidebarItem({ active, onClick, icon, label, badge }) {
    return (
      <button onClick={onClick} style={{
        width: '100%', display: 'flex', alignItems: 'center', gap: 8,
        padding: '6px 8px', borderRadius: 6, border: 'none', cursor: 'pointer',
        background: active ? C.active : 'none',
        color: active ? C.text : C.muted,
        fontWeight: active ? 600 : 400, fontSize: 14,
        fontFamily: '"Plus Jakarta Sans", sans-serif',
        textAlign: 'left', transition: 'background 0.12s, color 0.12s',
      }}
        onMouseEnter={e => { if (!active) { e.currentTarget.style.background = C.hover; e.currentTarget.style.color = C.text; } }}
        onMouseLeave={e => { if (!active) { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = C.muted; } }}
      >
        {icon}
        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
        {badge && <span style={{ background: '#ed4245', color: '#fff', borderRadius: 10, fontSize: 10, padding: '1px 5px', fontWeight: 700 }}>{badge}</span>}
      </button>
    );
  }

  return (
    <>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 4px; }
      `}</style>

      <div style={{ display: 'flex', height: '100vh', background: C.bg, fontFamily: '"Plus Jakarta Sans", sans-serif', overflow: 'hidden' }}>

        {/* ── Left Sidebar ────────────────────────────────────────────────── */}
        <div style={{ width: 240, flexShrink: 0, background: C.sidebar, display: 'flex', flexDirection: 'column', height: '100%' }}>

          {/* Workspace header */}
          <div style={{ padding: '14px 16px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
            <img src={ktLogo} alt="" style={{ width: 28, height: 28, borderRadius: 7, objectFit: 'cover', flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 14, fontWeight: 700, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>KaTuro Collab</p>
              <p style={{ fontSize: 10, color: C.green }}>● {channels.length} channels</p>
            </div>
            <ChevronDown size={14} color={C.muted} />
          </div>

          {/* Scrollable nav */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '8px 8px' }}>

            {/* Back to app */}
            <button onClick={() => navigate('/dashboard')} style={{
              width: '100%', display: 'flex', alignItems: 'center', gap: 6,
              padding: '6px 8px', borderRadius: 6, border: 'none', cursor: 'pointer',
              background: 'none', color: C.muted, fontSize: 12, fontFamily: 'inherit',
              marginBottom: 8,
            }}>
              <ArrowLeft size={12} /> Back to kaTuro AI
            </button>

            {/* CHANNELS */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 8px 4px' }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Channels</span>
              <div style={{ display: 'flex', gap: 4 }}>
                <button onClick={() => setModal('join')} title="Join by invite code" style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.muted, lineHeight: 0 }}>
                  <UserPlus size={13} />
                </button>
                <button onClick={() => setModal('create')} title="Create channel" style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.muted, lineHeight: 0 }}>
                  <Plus size={13} />
                </button>
              </div>
            </div>

            {channels.map(ch => (
              <SidebarItem
                key={ch.id}
                active={!activeDM && activeChannel === ch.id}
                onClick={() => selectChannel(ch.id)}
                icon={<Hash size={15} />}
                label={ch.name}
              />
            ))}

            {/* DIRECT MESSAGES */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 8px 4px' }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Direct Messages</span>
              <button onClick={() => setModal('dm-picker')} title="New message" style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.muted, lineHeight: 0 }}>
                <Plus size={13} />
              </button>
            </div>

            {dms.length === 0 && (
              <p style={{ fontSize: 12, color: C.muted, padding: '4px 8px' }}>No direct messages yet</p>
            )}
            {dms.map(dm => {
              const peer = dm.participants.find(p => p !== uid);
              const info = dm.participantInfo?.[peer] ?? {};
              return (
                <SidebarItem
                  key={dm.id}
                  active={activeDM === dm.id}
                  onClick={() => selectDM(dm.id, dm)}
                  icon={<Avatar photoURL={info.photoURL} name={info.name} size={20} status={info.status} />}
                  label={info.name || 'Unknown'}
                />
              );
            })}
          </div>

          {/* ── User panel (bottom) ─────────────────────────────────── */}
          <div style={{ padding: '8px 12px', borderTop: `1px solid ${C.border}`, background: C.bg, display: 'flex', alignItems: 'center', gap: 8 }}>
            {/* Avatar — click to upload photo */}
            <div
              onClick={() => photoInputRef.current?.click()}
              title="Click to change profile photo"
              style={{ position: 'relative', cursor: 'pointer', flexShrink: 0 }}
            >
              <Avatar photoURL={myPhoto} name={myName} size={32} status={myStatus} />
              <div style={{
                position: 'absolute', inset: 0, borderRadius: '50%', background: 'rgba(0,0,0,0.5)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0, transition: 'opacity 0.15s',
              }}
                onMouseEnter={e => e.currentTarget.style.opacity = '1'}
                onMouseLeave={e => e.currentTarget.style.opacity = '0'}
              >
                <Camera size={12} color="#fff" />
              </div>
            </div>
            <input ref={photoInputRef} type="file" accept="image/*" onChange={handlePhotoUpload} style={{ display: 'none' }} />

            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 13, fontWeight: 700, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{myName}</p>
              {/* Status selector */}
              <div style={{ position: 'relative' }}>
                <button onClick={() => setStatusOpen(v => !v)} style={{
                  background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                  display: 'flex', alignItems: 'center', gap: 4, color: C.muted, fontSize: 11,
                }}>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: statusColor(myStatus), display: 'inline-block' }} />
                  {STATUSES.find(s => s.key === myStatus)?.label ?? 'Online'}
                  <ChevronDown size={10} />
                </button>
                {statusOpen && (
                  <div style={{ position: 'absolute', bottom: '100%', left: 0, background: C.bg, borderRadius: 9, boxShadow: '0 4px 24px rgba(0,0,0,0.4)', padding: 6, zIndex: 50, minWidth: 130 }}>
                    {STATUSES.map(s => (
                      <button key={s.key} onClick={() => handleStatus(s.key)} style={{
                        width: '100%', display: 'flex', alignItems: 'center', gap: 8,
                        padding: '7px 10px', borderRadius: 6, border: 'none', cursor: 'pointer',
                        background: 'none', color: myStatus === s.key ? C.text : C.muted,
                        fontWeight: myStatus === s.key ? 700 : 400, fontSize: 13, fontFamily: 'inherit',
                      }}>
                        <span style={{ width: 9, height: 9, borderRadius: '50%', background: s.color, flexShrink: 0 }} />
                        {s.label}
                        {s.key === 'teaching' && <BookOpen size={11} style={{ marginLeft: 'auto' }} />}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <button onClick={() => navigate('/dashboard')} title="Back to kaTuro" style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.muted, lineHeight: 0 }}>
              <Settings size={16} />
            </button>
          </div>
        </div>

        {/* ── Main Content ─────────────────────────────────────────────────── */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: C.channel }}>
          {activeDM && activeDMPeer ? (
            <MessageArea
              messages={messages}
              myUid={uid}
              aiLoading={aiLoading}
              placeholder={`Message ${activeDMPeer.name || 'this teacher'}`}
              onSend={handleSend}
              headerSlot={
                <div style={{ padding: '12px 20px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                  <Avatar photoURL={activeDMPeer.photoURL} name={activeDMPeer.name} size={30} status={activeDMPeer.status} />
                  <div>
                    <p style={{ fontWeight: 700, color: C.text, fontSize: 16 }}>{activeDMPeer.name}</p>
                    <p style={{ fontSize: 11, color: C.muted }}>Direct Message</p>
                  </div>
                </div>
              }
            />
          ) : activeChannelObj ? (
            <MessageArea
              messages={messages}
              myUid={uid}
              aiLoading={aiLoading}
              placeholder={`Message #${activeChannelObj.name}`}
              onSend={handleSend}
              headerSlot={
                <div style={{ padding: '12px 20px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                  <Hash size={20} color={C.muted} />
                  <div style={{ flex: 1 }}>
                    <p style={{ fontWeight: 700, color: C.text, fontSize: 16 }}>{activeChannelObj.name}</p>
                    {activeChannelObj.description && <p style={{ fontSize: 11, color: C.muted }}>{activeChannelObj.description}</p>}
                  </div>
                  {activeChannelObj.inviteCode && (
                    <button onClick={() => setModal({ type: 'invite', channel: activeChannelObj })} style={{ display: 'flex', alignItems: 'center', gap: 5, background: C.hover, border: 'none', borderRadius: 7, padding: '6px 10px', cursor: 'pointer', color: C.text, fontSize: 12, fontFamily: 'inherit' }}>
                      <UserPlus size={13} /> Invite
                    </button>
                  )}
                </div>
              }
            />
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1, color: C.muted }}>
              <div style={{ textAlign: 'center' }}>
                <Volume2 size={48} style={{ opacity: 0.2, marginBottom: 12 }} />
                <p>Select a channel or DM to start chatting</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Modals */}
      {modal === 'create'     && <CreateChannelModal uid={uid} onCreated={r => selectChannel(r.id)} onClose={() => setModal(null)} />}
      {modal === 'join'       && <JoinModal uid={uid} onJoined={selectChannel} onClose={() => setModal(null)} />}
      {modal === 'dm-picker'  && <DMPicker myUid={uid} myProfile={{ displayName: myName, photoURL: myPhoto, school: mySchool }} onDMOpen={(id, t) => { setActiveDM(id); setActiveDMPeer({ uid: t.id, name: t.displayName || t.email, photoURL: t.photoURL }); setActiveChannel(null); }} onClose={() => setModal(null)} />}
      {modal?.type === 'invite' && <InviteModal channel={modal.channel} onClose={() => setModal(null)} />}
    </>
  );
}
