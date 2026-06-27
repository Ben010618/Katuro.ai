import { useState } from 'react';
import { AlertTriangle, Bug, CheckCircle2, X } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { reportAIError } from '../services/db';

/**
 * Shown at the top of every AI-generated output page.
 * 1. MELC verification warning — reminds teachers to check MELC codes.
 * 2. "Report AI Error" — sends feedback to adminConfig/aiErrorReports.
 */
export default function AIOutputGuard({ feature = 'unknown', inputContext = {} }) {
  const { user } = useAuth();
  const [showForm,  setShowForm]  = useState(false);
  const [message,   setMessage]   = useState('');
  const [sending,   setSending]   = useState(false);
  const [sent,      setSent]      = useState(false);
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  async function handleSend(e) {
    e.preventDefault();
    if (!message.trim()) return;
    setSending(true);
    try {
      await reportAIError({
        uid:          user?.uid,
        feature,
        errorMessage: message.trim(),
        inputContext,
      });
      setSent(true);
      setTimeout(() => { setShowForm(false); setSent(false); setMessage(''); }, 2500);
    } catch (_e) {
      // non-fatal — user sees nothing
    } finally {
      setSending(false);
    }
  }

  return (
    <div style={{
      background: '#fffbeb',
      border: '1px solid rgba(217,119,6,0.3)',
      borderRadius: 12,
      padding: '12px 16px',
      marginBottom: 18,
      position: 'relative',
    }}>
      {/* Dismiss */}
      <button
        onClick={() => setDismissed(true)}
        style={{ position: 'absolute', top: 8, right: 8, background: 'none', border: 'none', cursor: 'pointer', color: '#b45309', padding: 2 }}
        title="Dismiss"
      >
        <X size={14} />
      </button>

      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
        <AlertTriangle size={16} color="#d97706" style={{ flexShrink: 0, marginTop: 1 }} />
        <div style={{ flex: 1 }}>
          <p style={{ margin: '0 0 2px', fontSize: 13, fontWeight: 700, color: '#92400e', fontFamily: '"Plus Jakarta Sans", sans-serif' }}>
            Verify Before Submitting
          </p>
          <p style={{ margin: '0 0 8px', fontSize: 12, color: '#78350f', lineHeight: 1.5, fontFamily: '"Plus Jakarta Sans", sans-serif' }}>
            AI may generate incorrect MELC codes or misaligned content. Always verify the MELC code against the official DepEd list before printing or submitting.
          </p>

          {!showForm && (
            <button
              onClick={() => setShowForm(true)}
              style={{
                background: 'none', border: '1px solid rgba(217,119,6,0.35)',
                borderRadius: 6, padding: '4px 10px', fontSize: 11, fontWeight: 600,
                color: '#b45309', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5,
                fontFamily: '"Plus Jakarta Sans", sans-serif',
              }}
            >
              <Bug size={11} /> Report AI Error
            </button>
          )}

          {showForm && !sent && (
            <form onSubmit={handleSend} style={{ display: 'flex', gap: 6, alignItems: 'flex-end', flexWrap: 'wrap' }}>
              <input
                value={message}
                onChange={e => setMessage(e.target.value)}
                placeholder="Describe what was wrong (e.g., wrong MELC code, irrelevant content…)"
                style={{
                  flex: 1, minWidth: 200,
                  padding: '6px 10px', borderRadius: 6, fontSize: 12,
                  border: '1px solid rgba(217,119,6,0.3)', background: '#fff',
                  fontFamily: '"Plus Jakarta Sans", sans-serif', outline: 'none',
                }}
                autoFocus
              />
              <button
                type="submit"
                disabled={sending || !message.trim()}
                style={{
                  background: '#d97706', color: '#fff', border: 'none',
                  borderRadius: 6, padding: '6px 12px', fontSize: 11,
                  fontWeight: 700, cursor: 'pointer', opacity: (sending || !message.trim()) ? 0.6 : 1,
                  fontFamily: '"Plus Jakarta Sans", sans-serif',
                }}
              >
                {sending ? 'Sending…' : 'Send'}
              </button>
              <button
                type="button"
                onClick={() => { setShowForm(false); setMessage(''); }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#b45309', fontSize: 11, fontFamily: '"Plus Jakarta Sans", sans-serif' }}
              >
                Cancel
              </button>
            </form>
          )}

          {sent && (
            <div style={{ display: 'flex', gap: 5, alignItems: 'center', fontSize: 12, color: '#2d6a4f', fontFamily: '"Plus Jakarta Sans", sans-serif' }}>
              <CheckCircle2 size={13} /> Report sent. Thank you for helping improve kaTuro!
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
