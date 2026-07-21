import { useState, useEffect, useRef } from 'react';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { X, Send, Loader2 } from 'lucide-react';
import { db } from '../../firebase';
import { useAuth } from '../../hooks/useAuth';
import { useToast } from '../../context/ToastContext';

const MAX_LEN = 2000;
const TYPES = ['Suggestion', 'Feedback', 'Comment'];

export default function SuggestionModal({ onClose }) {
  const { user } = useAuth();
  const { addToast } = useToast();
  const [type, setType] = useState('Suggestion');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const overlayRef = useRef(null);
  const messageRef = useRef('');
  useEffect(() => { messageRef.current = message; }, [message]);

  function handleClose() {
    if (messageRef.current.trim() && !window.confirm('Discard your unsent message?')) return;
    onClose();
  }

  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') handleClose(); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!message.trim() || sending) return;
    setSending(true);
    setError('');
    try {
      await addDoc(collection(db, 'feedback_inbox'), {
        message: message.trim().slice(0, MAX_LEN),
        type,
        createdBy: {
          uid: user.uid,
          displayName: user.displayName || '',
          email: user.email || '',
        },
        createdAt: serverTimestamp(),
        read: false,
        archived: false,
      });
      addToast('Salamat! Your feedback was sent.', 'success');
      onClose();
    } catch {
      setError("Couldn't send your message. Please try again.");
      setSending(false);
    }
  }

  return (
    <div
      ref={overlayRef}
      onClick={(e) => { if (e.target === overlayRef.current) handleClose(); }}
      style={{
        position: 'fixed', inset: 0, zIndex: 600,
        background: 'rgba(13,34,24,0.55)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16,
      }}
    >
      <style>{`
        @keyframes kt-suggest-modal-in {
          from { opacity: 0; transform: translateY(16px) scale(0.97); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
      <form
        onSubmit={handleSubmit}
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--kt-card)', borderRadius: 16, padding: '24px 24px 20px',
          width: '100%', maxWidth: 420,
          boxShadow: '0 20px 60px rgba(13,34,24,0.3)',
          animation: 'kt-suggest-modal-in 0.22s cubic-bezier(0.22,1,0.36,1) both',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
          <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: 'var(--kt-text-primary)' }}>
            Tell us what you think!
          </h3>
          <button type="button" onClick={handleClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--kt-text-secondary)', padding: 4 }}>
            <X size={18} />
          </button>
        </div>
        <p style={{ margin: '2px 0 16px', fontSize: 12, color: 'var(--kt-text-secondary)' }}>
          Suggestions, comments, or feedback go straight to the kaTuro team.
        </p>

        <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
          {TYPES.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setType(t)}
              style={{
                flex: 1, padding: '6px 8px', borderRadius: 8, fontSize: 12, fontWeight: 600,
                border: `1px solid ${type === t ? '#2d6a4f' : 'var(--kt-border)'}`,
                background: type === t ? '#2d6a4f' : 'transparent',
                color: type === t ? '#fff' : 'var(--kt-text-secondary)',
                cursor: 'pointer', fontFamily: 'inherit', transition: 'background 0.15s, color 0.15s',
              }}
            >
              {t}
            </button>
          ))}
        </div>

        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value.slice(0, MAX_LEN))}
          placeholder="What's on your mind?"
          rows={5}
          autoFocus
          style={{
            width: '100%', boxSizing: 'border-box', resize: 'vertical',
            padding: '10px 12px', border: '1.5px solid rgba(45,106,79,0.2)',
            borderRadius: 8, fontSize: 14, background: 'var(--kt-input-bg)',
            color: 'var(--kt-text-primary)', outline: 'none', fontFamily: 'inherit',
          }}
        />
        <div style={{ textAlign: 'right', fontSize: 11, color: 'var(--kt-text-secondary)', margin: '4px 0 14px' }}>
          {message.length} / {MAX_LEN}
        </div>

        {error && (
          <p style={{ margin: '0 0 12px', fontSize: 12, color: '#c0392b' }}>{error}</p>
        )}

        <button
          type="submit"
          disabled={!message.trim() || sending}
          style={{
            width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            background: '#2d6a4f', color: '#fff', border: 'none',
            borderRadius: 8, padding: '11px 0', fontSize: 14, fontWeight: 600,
            cursor: (!message.trim() || sending) ? 'not-allowed' : 'pointer',
            opacity: (!message.trim() || sending) ? 0.6 : 1,
            fontFamily: 'inherit',
          }}
        >
          {sending ? <Loader2 size={15} style={{ animation: 'kt-spin 0.8s linear infinite' }} /> : <Send size={15} />}
          {sending ? 'Sending…' : 'Submit'}
        </button>
      </form>
    </div>
  );
}
