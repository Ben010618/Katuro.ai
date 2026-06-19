import { useState, useEffect, useRef } from 'react';
import { X, Send, MessageCircle } from 'lucide-react';
import {
  subscribeStudentComments,
  addStudentComment,
  markCommentRead,
} from '../services/classroomDb';
import { thumbUrl } from '../services/cloudinaryUpload';

function formatTime(ts) {
  if (!ts?.toDate) return '';
  return ts.toDate().toLocaleDateString('en-PH', {
    month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function authorLabel(c) {
  if (c.authorRole === 'adviser') return `${c.authorName} — Class Adviser`;
  return `${c.authorName} — ${c.subject ? c.subject + ' Teacher' : 'Subject Teacher'}`;
}

export default function StudentCardModal({
  student,
  sectionId,
  currentUser,
  authorName,
  authorRole,
  subject,
  onClose,
}) {
  const [comments,  setComments]  = useState([]);
  const [text,      setText]      = useState('');
  const [sending,   setSending]   = useState(false);
  const [sendError, setSendError] = useState('');
  const bottomRef = useRef(null);

  useEffect(() => {
    const unsub = subscribeStudentComments(sectionId, student.id, async (docs) => {
      setComments(docs);
      const unread = docs.filter(c => !(c.readBy || []).includes(currentUser.uid));
      for (const c of unread) {
        markCommentRead(sectionId, c.id, currentUser.uid).catch(() => {});
      }
    });
    return unsub;
  }, [sectionId, student.id, currentUser.uid]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [comments.length]);

  async function handleSend() {
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    setSendError('');
    setSending(true);
    try {
      await addStudentComment(sectionId, {
        studentId:  student.id,
        text:       trimmed,
        authorUid:  currentUser.uid,
        authorName,
        authorRole,
        subject,
      });
      setText('');
    } catch (err) {
      setSendError(err?.message || 'Failed to send. Check your connection.');
    } finally {
      setSending(false);
    }
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 500,
        background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: '#fff', borderRadius: 20, width: '100%', maxWidth: 500,
          maxHeight: '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden',
          boxShadow: '0 32px 100px rgba(0,0,0,0.3)',
        }}
      >
        {/* ── Header ── */}
        <div style={{
          background: 'linear-gradient(135deg, #0d2218, #1a3d2b, #2d6a4f)',
          padding: '20px 22px', display: 'flex', gap: 16, alignItems: 'center', flexShrink: 0,
        }}>
          {student.photoUrl ? (
            <img
              src={thumbUrl(student.photoUrl, 120)}
              alt=""
              style={{ width: 64, height: 64, borderRadius: 12, objectFit: 'cover', border: '2.5px solid rgba(255,255,255,0.3)', flexShrink: 0 }}
            />
          ) : (
            <div style={{
              width: 64, height: 64, borderRadius: 12, flexShrink: 0,
              background: 'rgba(255,255,255,0.15)', display: 'flex',
              alignItems: 'center', justifyContent: 'center',
              fontSize: 24, fontWeight: 800, color: '#fff',
            }}>
              {(student.givenName?.[0] || '') + (student.surname?.[0] || '')}
            </div>
          )}

          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ margin: '0 0 3px', fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '1px' }}>
              Student Profile
            </p>
            <h2 style={{ margin: '0 0 5px', fontSize: 17, fontWeight: 700, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {student.surname}, {student.givenName}{student.middleInitial ? ` ${student.middleInitial}.` : ''}
            </h2>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              {student.lrn && (
                <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)' }}>LRN: {student.lrn}</span>
              )}
              {student.gender && (
                <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)' }}>{student.gender}</span>
              )}
              {student.studentNumber && (
                <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)' }}>#{student.studentNumber}</span>
              )}
            </div>
          </div>

          <button
            onClick={onClose}
            style={{ background: 'rgba(255,255,255,0.12)', border: 'none', borderRadius: 8, width: 30, height: 30, cursor: 'pointer', color: '#fff', display: 'grid', placeItems: 'center', flexShrink: 0 }}
          >
            <X size={14} />
          </button>
        </div>

        {/* ── Comments label ── */}
        <div style={{ padding: '12px 20px 0', background: '#f9fafb', borderBottom: '1px solid rgba(45,106,79,0.08)', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 7 }}>
          <MessageCircle size={14} color="#4a6357" />
          <span style={{ fontSize: 12, fontWeight: 700, color: '#4a6357', textTransform: 'uppercase', letterSpacing: '0.8px' }}>
            Teacher Notes &amp; Observations
          </span>
          {comments.length > 0 && (
            <span style={{ fontSize: 11, color: '#9ca3af', marginLeft: 4 }}>({comments.length})</span>
          )}
          <p style={{ margin: '0 0 10px 0', fontSize: 10, color: '#9ca3af', marginTop: 4, marginLeft: 'auto', fontStyle: 'italic' }}>
            Visible to adviser &amp; all subject teachers
          </p>
        </div>

        {/* ── Thread ── */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 14, background: '#f9fafb' }}>
          {comments.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 20px' }}>
              <MessageCircle size={36} color="#d1d5db" />
              <p style={{ margin: '12px 0 0', fontSize: 13, color: '#9ca3af' }}>
                No notes yet. Leave an observation below.
              </p>
            </div>
          ) : comments.map(c => {
            const isMe = c.authorUid === currentUser.uid;
            return (
              <div key={c.id} style={{ display: 'flex', flexDirection: 'column', alignItems: isMe ? 'flex-end' : 'flex-start' }}>
                <div style={{
                  maxWidth: '85%',
                  background: isMe ? '#1a3d2b' : '#fff',
                  color: isMe ? '#d8f3dc' : '#0d2218',
                  borderRadius: isMe ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
                  padding: '10px 14px',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.07)',
                  border: isMe ? 'none' : '1px solid rgba(45,106,79,0.12)',
                }}>
                  <p style={{ margin: 0, fontSize: 13, lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>{c.text}</p>
                </div>
                <p style={{ margin: '4px 6px 0', fontSize: 10, color: '#9ca3af' }}>
                  {authorLabel(c)}&nbsp;·&nbsp;{formatTime(c.timestamp)}
                </p>
              </div>
            );
          })}
          <div ref={bottomRef} />
        </div>

        {/* ── Send error ── */}
        {sendError && (
          <div style={{ padding: '6px 16px', background: '#fef2f2', borderTop: '1px solid #fecaca', flexShrink: 0 }}>
            <p style={{ margin: 0, fontSize: 12, color: '#dc2626' }}>{sendError}</p>
          </div>
        )}

        {/* ── Input ── */}
        <div style={{ padding: '12px 16px', borderTop: '1px solid rgba(45,106,79,0.1)', background: '#fff', display: 'flex', gap: 10, flexShrink: 0 }}>
          <textarea
            value={text}
            onChange={e => setText(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
            placeholder={`Write a note about ${student.givenName}… (Enter to send, Shift+Enter for new line)`}
            style={{
              flex: 1, padding: '10px 14px', borderRadius: 10,
              border: '1px solid rgba(45,106,79,0.2)', background: '#f5faf7',
              resize: 'none', fontSize: 13, fontFamily: 'inherit',
              color: '#0d2218', outline: 'none', lineHeight: 1.5,
              minHeight: 46, maxHeight: 120,
            }}
          />
          <button
            onClick={handleSend}
            disabled={!text.trim() || sending}
            style={{
              background: text.trim() ? '#2d6a4f' : '#e5e7eb',
              color: text.trim() ? '#fff' : '#9ca3af',
              border: 'none', borderRadius: 10, width: 46,
              cursor: text.trim() ? 'pointer' : 'default',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0, transition: 'background 0.15s',
            }}
          >
            <Send size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
