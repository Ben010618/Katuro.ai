import { useState, useEffect } from 'react';
import {
  collection, query, orderBy, limit, onSnapshot,
  updateDoc, deleteDoc, doc, serverTimestamp,
} from 'firebase/firestore';
import { MessageSquare, Trash2, Archive, ArchiveRestore, Mail, MailOpen, Loader2, Reply, Send } from 'lucide-react';
import { db } from '../../firebase';
import { useAuth } from '../../hooks/useAuth';

const card = {
  background: 'var(--kt-card)', borderRadius: 14,
  border: '1px solid var(--kt-border)', padding: '20px 22px',
};
const btnSecondary = {
  background: 'var(--kt-surface)', color: '#1a3d2b', border: '1px solid rgba(45,106,79,0.2)',
  borderRadius: 8, padding: '6px 12px', fontSize: 11,
  fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
  display: 'flex', alignItems: 'center', gap: 5,
};

const PAGE_SIZE = 25;
const READ_FILTERS = ['All', 'Unread', 'Archived'];
const TYPE_FILTERS = ['All', 'Suggestion', 'Feedback', 'Comment'];

function ts(t) {
  if (!t) return '';
  const d = t.toDate ? t.toDate() : new Date(t);
  return d.toLocaleString('en-PH', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function FeedbackArchive() {
  const { user } = useAuth();
  const [entries,      setEntries]      = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [readFilter,   setReadFilter]   = useState('All');
  const [typeFilter,   setTypeFilter]   = useState('All');
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [replyingId,   setReplyingId]   = useState(null); // entry.id currently showing its reply box
  const [replyDraft,    setReplyDraft]   = useState('');
  const [sendingReply,  setSendingReply] = useState(false);

  useEffect(() => {
    const unsub = onSnapshot(
      query(collection(db, 'feedback_inbox'), orderBy('createdAt', 'desc'), limit(200)),
      (snap) => {
        setEntries(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setLoading(false);
      },
      () => setLoading(false),
    );
    return unsub;
  }, []);

  const filtered = entries.filter((e) => {
    if (readFilter === 'Unread' && (e.read || e.archived)) return false;
    if (readFilter === 'Archived' && !e.archived) return false;
    if (readFilter === 'All' && e.archived) return false;
    if (typeFilter !== 'All' && e.type !== typeFilter) return false;
    return true;
  });
  const visible = filtered.slice(0, visibleCount);
  const unreadCount = entries.filter((e) => !e.read && !e.archived).length;

  async function toggleRead(entry) {
    await updateDoc(doc(db, 'feedback_inbox', entry.id), { read: !entry.read }).catch(() => {});
  }
  async function toggleArchived(entry) {
    await updateDoc(doc(db, 'feedback_inbox', entry.id), { archived: !entry.archived }).catch(() => {});
  }
  async function remove(entry) {
    if (!window.confirm('Delete this feedback entry permanently?')) return;
    await deleteDoc(doc(db, 'feedback_inbox', entry.id)).catch(() => {});
  }

  function openReply(entry) {
    setReplyingId(entry.id);
    setReplyDraft(entry.reply || '');
  }
  function cancelReply() {
    setReplyingId(null);
    setReplyDraft('');
  }
  async function sendReply(entry) {
    const text = replyDraft.trim();
    if (!text || sendingReply) return;
    setSendingReply(true);
    try {
      await updateDoc(doc(db, 'feedback_inbox', entry.id), {
        reply: text,
        repliedAt: serverTimestamp(),
        repliedBy: { uid: user?.uid || '', displayName: user?.displayName || '' },
        // Re-flips to unread for the teacher even if this edits a prior reply.
        replyRead: false,
      });
      cancelReply();
    } catch {
      window.alert("Couldn't send this reply. Please try again.");
    } finally {
      setSendingReply(false);
    }
  }

  return (
    <div style={{ ...card, marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 34, height: 34, borderRadius: 9, background: unreadCount > 0 ? 'rgba(45,106,79,0.1)' : '#f5faf7', display: 'grid', placeItems: 'center' }}>
            <MessageSquare size={16} color={unreadCount > 0 ? '#2d6a4f' : '#9bb8a5'} />
          </div>
          <div>
            <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'var(--kt-text-primary)' }}>
              Feedback Inbox
              {unreadCount > 0 && <span style={{ marginLeft: 8, fontSize: 11, background: '#e8f7ee', color: '#2d6a4f', border: '1px solid rgba(45,106,79,0.2)', borderRadius: 20, padding: '1px 8px' }}>{unreadCount} unread</span>}
            </h3>
            <p style={{ margin: 0, fontSize: 11, color: 'var(--kt-text-secondary)' }}>Suggestions, comments, and feedback submitted by teachers.</p>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 4 }}>
          {READ_FILTERS.map((f) => (
            <button key={f} onClick={() => setReadFilter(f)} style={{ ...btnSecondary, background: readFilter === f ? '#2d6a4f' : 'var(--kt-surface)', color: readFilter === f ? '#fff' : '#1a3d2b' }}>
              {f}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          {TYPE_FILTERS.map((f) => (
            <button key={f} onClick={() => setTypeFilter(f)} style={{ ...btnSecondary, background: typeFilter === f ? '#2d6a4f' : 'var(--kt-surface)', color: typeFilter === f ? '#fff' : '#1a3d2b' }}>
              {f}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 20 }}><Loader2 size={18} style={{ animation: 'kt-spin 0.8s linear infinite' }} /></div>
      ) : visible.length === 0 ? (
        <p style={{ margin: 0, fontSize: 12, color: '#9bb8a5', textAlign: 'center', padding: 16 }}>No feedback entries here.</p>
      ) : (
        <>
          {visible.map((e) => (
            <div key={e.id} style={{
              padding: '10px 12px', borderRadius: 8, marginBottom: 6,
              background: e.read ? 'var(--kt-surface)' : 'rgba(45,106,79,0.05)',
              border: `1px solid ${e.read ? 'var(--kt-border)' : 'rgba(45,106,79,0.15)'}`,
            }}>
              <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', gap: 6, marginBottom: 3, flexWrap: 'wrap', alignItems: 'center' }}>
                    <span style={{ fontSize: 10, fontWeight: 700, background: '#e8f7ee', color: '#2d6a4f', borderRadius: 4, padding: '1px 6px' }}>{e.type || 'Suggestion'}</span>
                    <span style={{ fontSize: 10, color: '#9bb8a5' }}>{ts(e.createdAt)}</span>
                    {e.archived && <span style={{ fontSize: 10, color: '#9bb8a5' }}>Archived</span>}
                    {e.reply && <span style={{ fontSize: 10, fontWeight: 700, color: '#0369a1' }}>Replied</span>}
                  </div>
                  <p style={{ margin: 0, fontSize: 12, color: 'var(--kt-text-primary)', wordBreak: 'break-word' }}>{e.message}</p>
                  <p style={{ margin: '3px 0 0', fontSize: 10, color: '#9bb8a5' }}>
                    {e.createdBy?.displayName || '(unknown)'} · {e.createdBy?.email || 'no email'}
                  </p>
                </div>
                <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                  <button onClick={() => (replyingId === e.id ? cancelReply() : openReply(e))} title={e.reply ? 'Edit reply' : 'Reply'} style={{ ...btnSecondary, padding: '4px 8px', color: replyingId === e.id ? '#fff' : '#1a3d2b', background: replyingId === e.id ? '#2d6a4f' : 'var(--kt-surface)' }}>
                    <Reply size={11} />
                  </button>
                  <button onClick={() => toggleRead(e)} title={e.read ? 'Mark unread' : 'Mark read'} style={{ ...btnSecondary, padding: '4px 8px' }}>
                    {e.read ? <Mail size={11} /> : <MailOpen size={11} />}
                  </button>
                  <button onClick={() => toggleArchived(e)} title={e.archived ? 'Unarchive' : 'Archive'} style={{ ...btnSecondary, padding: '4px 8px' }}>
                    {e.archived ? <ArchiveRestore size={11} /> : <Archive size={11} />}
                  </button>
                  <button onClick={() => remove(e)} title="Delete" style={{ ...btnSecondary, padding: '4px 8px', color: '#c0392b', borderColor: 'rgba(224,92,92,0.3)' }}>
                    <Trash2 size={11} />
                  </button>
                </div>
              </div>

              {e.reply && replyingId !== e.id && (
                <div style={{ marginTop: 8, padding: '8px 10px', background: 'rgba(3,105,161,0.06)', border: '1px solid rgba(3,105,161,0.18)', borderRadius: 6 }}>
                  <p style={{ margin: 0, fontSize: 10, fontWeight: 700, color: '#0369a1' }}>
                    Your reply {e.repliedBy?.displayName ? `(${e.repliedBy.displayName})` : ''} · {ts(e.repliedAt)}
                    {e.replyRead ? ' · Seen' : ' · Not seen yet'}
                  </p>
                  <p style={{ margin: '3px 0 0', fontSize: 12, color: 'var(--kt-text-primary)', wordBreak: 'break-word' }}>{e.reply}</p>
                </div>
              )}

              {replyingId === e.id && (
                <div style={{ marginTop: 8 }}>
                  <textarea
                    autoFocus
                    rows={2}
                    value={replyDraft}
                    onChange={(ev) => setReplyDraft(ev.target.value)}
                    placeholder="Type your reply — the teacher will be notified…"
                    style={{
                      width: '100%', boxSizing: 'border-box', resize: 'vertical',
                      padding: '8px 10px', border: '1.5px solid rgba(45,106,79,0.2)',
                      borderRadius: 6, fontSize: 12, background: 'var(--kt-input-bg)',
                      color: 'var(--kt-text-primary)', outline: 'none', fontFamily: 'inherit',
                    }}
                  />
                  <div style={{ display: 'flex', gap: 6, marginTop: 6, justifyContent: 'flex-end' }}>
                    <button onClick={cancelReply} style={{ ...btnSecondary, fontSize: 11 }}>Cancel</button>
                    <button
                      onClick={() => sendReply(e)}
                      disabled={!replyDraft.trim() || sendingReply}
                      style={{
                        ...btnSecondary, fontSize: 11, background: '#2d6a4f', color: '#fff',
                        opacity: (!replyDraft.trim() || sendingReply) ? 0.6 : 1,
                      }}
                    >
                      {sendingReply ? <Loader2 size={11} style={{ animation: 'kt-spin 0.8s linear infinite' }} /> : <Send size={11} />}
                      Send reply
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
          {filtered.length > visible.length && (
            <button onClick={() => setVisibleCount((v) => v + PAGE_SIZE)} style={{ ...btnSecondary, margin: '8px auto 0', display: 'flex' }}>
              Load more
            </button>
          )}
        </>
      )}
    </div>
  );
}
