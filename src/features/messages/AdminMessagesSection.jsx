/**
 * Admin → Messages: reported messages, and read-only access to any chat
 * (teachers are told in Messages that the kaTuro admin can view messages).
 */
import { useEffect, useState } from 'react';
import { collection, doc, getDoc, getDocs, limit, orderBy, query, updateDoc } from 'firebase/firestore';
import { MessageSquare, Loader2, CheckCircle2, X } from 'lucide-react';
import { db } from '../../firebase';
import { fetchChatFile, saveBlobAs, deleteMyMessage, formatBytes } from '../../services/messages/chatService';

const box = { background: 'var(--kt-card)', border: '1px solid var(--kt-border)', borderRadius: 12, padding: 16, marginBottom: 16, color: 'var(--kt-text-primary)' };
const small = { display: 'inline-flex', alignItems: 'center', gap: 5, border: '1px solid var(--kt-border)', background: 'transparent', color: 'var(--kt-text-primary)', borderRadius: 7, padding: '4px 10px', fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' };
const ms = (t) => (t?.toMillis ? t.toMillis() : 0);
const when = (t) => (ms(t) ? new Date(ms(t)).toLocaleString('en-PH', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '');

function ChatViewer({ cid, onClose }) {
  const [state, setState] = useState({ loading: true, conv: null, messages: [], error: '' });
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [conv, msgs] = await Promise.all([
          getDoc(doc(db, 'conversations', cid)),
          getDocs(query(collection(db, 'conversations', cid, 'messages'), orderBy('createdAt', 'desc'), limit(200))),
        ]);
        if (alive) setState({ loading: false, conv: conv.exists() ? conv.data() : null, messages: msgs.docs.map((d) => ({ id: d.id, ...d.data() })).reverse(), error: '' });
      } catch (e) {
        if (alive) setState({ loading: false, conv: null, messages: [], error: e.message });
      }
    })();
    return () => { alive = false; };
  }, [cid]);

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 90, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ ...box, width: '100%', maxWidth: 640, maxHeight: '85vh', overflowY: 'auto', marginBottom: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <strong style={{ fontSize: 14 }}>{state.conv?.type === 'team' ? `Team: ${state.conv.name}` : 'One-to-one chat'} <span style={{ fontWeight: 400, fontSize: 11, color: 'var(--kt-text-secondary)' }}>(read only)</span></strong>
          <button onClick={onClose} style={{ ...small, border: 'none' }}><X size={14} /></button>
        </div>
        {state.loading && <p style={{ fontSize: 12 }}><Loader2 size={12} style={{ display: 'inline', animation: 'spin 1s linear infinite' }} /> Loading…</p>}
        {state.error && <p style={{ fontSize: 12, color: '#c0392b' }}>{state.error}</p>}
        {!state.loading && !state.messages.length && !state.error && <p style={{ fontSize: 12, color: 'var(--kt-text-secondary)' }}>No messages.</p>}
        {state.messages.map((m) => (
          <div key={m.id} style={{ padding: '6px 0', borderBottom: '1px solid var(--kt-border)', fontSize: 12.5 }}>
            <span style={{ fontWeight: 700 }}>{m.senderName}</span>
            <span style={{ color: 'var(--kt-text-secondary)', fontSize: 11, marginLeft: 6 }}>{when(m.createdAt)}</span>
            {m.deleted ? (
              <div style={{ fontStyle: 'italic' }}>Message deleted</div>
            ) : m.attachment ? (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span>{m.attachment.kind === 'image' ? 'Photo' : 'File'}: {m.attachment.name} ({formatBytes(m.attachment.size)})</span>
                <button style={small} onClick={() => fetchChatFile(cid, m.attachment, { download: true }).then((b) => saveBlobAs(b, m.attachment.name)).catch((e) => alert(e.message))}>Open</button>
              </div>
            ) : (
              <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{m.text}</div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function AdminMessagesSection() {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState('reports');
  const [reports, setReports] = useState(null);
  const [chats, setChats] = useState(null);
  const [viewing, setViewing] = useState(null);
  const [error, setError] = useState('');

  async function load(which) {
    setError('');
    try {
      if (which === 'reports') {
        const snap = await getDocs(query(collection(db, 'chatReports'), orderBy('createdAt', 'desc'), limit(200)));
        setReports(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      } else {
        const snap = await getDocs(query(collection(db, 'conversations'), orderBy('lastMessageAt', 'desc'), limit(100)));
        setChats(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      }
    } catch (e) {
      setError(`Could not load: ${e.message}`);
    }
  }

  async function removeMessage(r) {
    if (!window.confirm('Remove this message (and its file) for everyone in the chat?')) return;
    try {
      await deleteMyMessage(r.cid, r.messageId); // the server allows the admin to delete any message
      await resolve(r.id);
    } catch (e) {
      setError(`Could not remove: ${e.message}`);
    }
  }

  async function resolve(id) {
    try {
      await updateDoc(doc(db, 'chatReports', id), { status: 'resolved' });
      setReports((list) => list.map((r) => (r.id === id ? { ...r, status: 'resolved' } : r)));
    } catch (e) {
      setError(`Could not resolve: ${e.message}`);
    }
  }

  const openReports = (reports || []).filter((r) => r.status === 'open');

  return (
    <div style={box}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <MessageSquare size={16} color="#2d6a4f" />
          <div>
            <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700 }}>Messages {reports && openReports.length > 0 && <span style={{ marginLeft: 6, fontSize: 11, color: '#c0392b' }}>{openReports.length} open report{openReports.length === 1 ? '' : 's'}</span>}</h3>
            <p style={{ margin: 0, fontSize: 11, color: 'var(--kt-text-secondary)' }}>Reported messages, and read-only access to teacher chats.</p>
          </div>
        </div>
        <button style={small} onClick={() => { const next = !open; setOpen(next); if (next) load(tab); }}>{open ? 'Hide' : 'View'}</button>
      </div>
      {open && (
        <div style={{ marginTop: 12 }}>
          <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
            {[['reports', 'Reports'], ['chats', 'All chats']].map(([id, label]) => (
              <button key={id} onClick={() => { setTab(id); load(id); }} style={{ ...small, background: tab === id ? '#2d6a4f' : 'transparent', color: tab === id ? '#fff' : 'var(--kt-text-primary)' }}>{label}</button>
            ))}
          </div>
          {error && <p style={{ fontSize: 12, color: '#c0392b' }}>{error}</p>}
          {tab === 'reports' && (reports === null ? <p style={{ fontSize: 12 }}>Loading…</p> : !reports.length ? <p style={{ fontSize: 12, color: 'var(--kt-text-secondary)' }}>No reports.</p> : reports.map((r) => (
            <div key={r.id} style={{ padding: '8px 10px', border: '1px solid var(--kt-border)', borderRadius: 8, marginBottom: 6, opacity: r.status === 'open' ? 1 : 0.6 }}>
              <div style={{ fontSize: 11, color: 'var(--kt-text-secondary)' }}>{when(r.createdAt)} · from {r.senderName || 'a teacher'}{r.status !== 'open' ? ' · resolved' : ''}</div>
              <div style={{ fontSize: 12.5, margin: '3px 0', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>“{r.messageText}”</div>
              {r.reason && <div style={{ fontSize: 11.5, color: 'var(--kt-text-secondary)' }}>Reason: {r.reason}</div>}
              <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                <button style={small} onClick={() => setViewing(r.cid)}>View chat</button>
                {r.status === 'open' && <button style={small} onClick={() => resolve(r.id)}><CheckCircle2 size={11} /> Resolve</button>}
                {r.status === 'open' && <button style={{ ...small, color: '#c0392b' }} onClick={() => removeMessage(r)}>Remove message</button>}
              </div>
            </div>
          )))}
          {tab === 'chats' && (chats === null ? <p style={{ fontSize: 12 }}>Loading…</p> : !chats.length ? <p style={{ fontSize: 12, color: 'var(--kt-text-secondary)' }}>No chats with messages yet.</p> : chats.map((c) => (
            <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 10px', borderBottom: '1px solid var(--kt-border)' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12.5, fontWeight: 700 }}>{c.type === 'team' ? `Team: ${c.name}` : 'One-to-one chat'}</div>
                <div style={{ fontSize: 11.5, color: 'var(--kt-text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.lastMessage ? `${c.lastMessage.senderName}: ${c.lastMessage.text}` : ''} · {when(c.lastMessageAt)}</div>
              </div>
              <button style={small} onClick={() => setViewing(c.id)}>Open</button>
            </div>
          )))}
        </div>
      )}
      {viewing && <ChatViewer cid={viewing} onClose={() => setViewing(null)} />}
    </div>
  );
}
