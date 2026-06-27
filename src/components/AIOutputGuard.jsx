import { useState, useEffect } from 'react';
import { AlertTriangle, Bug, CheckCircle2, X, ShieldCheck, ShieldAlert, Loader2 } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { reportAIError, validateMelcCode } from '../services/db';

export default function AIOutputGuard({ feature = 'unknown', inputContext = {} }) {
  const { user } = useAuth();
  const [showForm,    setShowForm]    = useState(false);
  const [message,     setMessage]     = useState('');
  const [sending,     setSending]     = useState(false);
  const [sent,        setSent]        = useState(false);
  const [dismissed,   setDismissed]   = useState(false);
  const [melcStatus,  setMelcStatus]  = useState('idle'); // idle | checking | valid | warning
  const [melcResults, setMelcResults] = useState([]);

  // Run MELC validation in background after mount
  useEffect(() => {
    const codes = [];
    if (inputContext.melc)             codes.push(inputContext.melc);
    if (inputContext.competencyText)   codes.push(inputContext.competencyText);
    if (!codes.length || !inputContext.subject) return;

    setMelcStatus('checking');
    validateMelcCode({
      subject:    inputContext.subject,
      gradeLevel: inputContext.gradeLevel || inputContext.grade,
      quarter:    inputContext.quarter    || inputContext.term,
      melcCodes:  codes,
    }).then(({ results }) => {
      setMelcResults(results || []);
      const hasIssue = results?.some(r => r.isValid === false);
      setMelcStatus(hasIssue ? 'warning' : 'valid');
    }).catch(() => {
      setMelcStatus('idle');
    });
  }, []);

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
    } finally {
      setSending(false);
    }
  }

  const hasMelcWarning = melcStatus === 'warning';
  const badCodes = melcResults.filter(r => r.isValid === false);

  return (
    <div style={{
      background: hasMelcWarning ? '#fff7ed' : '#fffbeb',
      border: `1px solid ${hasMelcWarning ? 'rgba(234,88,12,0.35)' : 'rgba(217,119,6,0.3)'}`,
      borderRadius: 12,
      padding: '12px 16px',
      marginBottom: 18,
      position: 'relative',
    }}>
      <button
        onClick={() => setDismissed(true)}
        style={{ position: 'absolute', top: 8, right: 8, background: 'none', border: 'none', cursor: 'pointer', color: '#b45309', padding: 2 }}
        title="Dismiss"
      >
        <X size={14} />
      </button>

      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
        <AlertTriangle size={16} color={hasMelcWarning ? '#ea580c' : '#d97706'} style={{ flexShrink: 0, marginTop: 1 }} />
        <div style={{ flex: 1 }}>
          <p style={{ margin: '0 0 2px', fontSize: 13, fontWeight: 700, color: hasMelcWarning ? '#7c2d12' : '#92400e', fontFamily: '"Plus Jakarta Sans", sans-serif' }}>
            Verify Before Submitting
          </p>
          <p style={{ margin: '0 0 8px', fontSize: 12, color: '#78350f', lineHeight: 1.5, fontFamily: '"Plus Jakarta Sans", sans-serif' }}>
            Always verify MELC codes against the official DepEd list before printing or submitting.
          </p>

          {/* MELC validation status */}
          {melcStatus === 'checking' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 8, fontSize: 11, color: '#92400e', fontFamily: '"Plus Jakarta Sans", sans-serif' }}>
              <Loader2 size={11} style={{ animation: 'spin 1s linear infinite' }} /> Checking MELC codes…
            </div>
          )}
          {melcStatus === 'valid' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 8, fontSize: 11, color: '#166534', fontWeight: 600, fontFamily: '"Plus Jakarta Sans", sans-serif' }}>
              <ShieldCheck size={12} /> MELC codes look valid
            </div>
          )}
          {melcStatus === 'warning' && badCodes.length > 0 && (
            <div style={{ marginBottom: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 700, color: '#9a3412', marginBottom: 4, fontFamily: '"Plus Jakarta Sans", sans-serif' }}>
                <ShieldAlert size={12} /> Possible MELC issue detected
              </div>
              {badCodes.map((r, i) => (
                <div key={i} style={{ fontSize: 11, color: '#7c2d12', marginBottom: 3, paddingLeft: 17, fontFamily: '"Plus Jakarta Sans", sans-serif' }}>
                  <span style={{ fontWeight: 700 }}>"{r.code}"</span>
                  {r.suggestedCode && <> → try <span style={{ fontWeight: 700, color: '#0d5c35' }}>{r.suggestedCode}</span></>}
                  {r.note && <span style={{ color: '#92400e' }}> — {r.note}</span>}
                </div>
              ))}
            </div>
          )}

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
